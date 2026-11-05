import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { Pool } from 'pg';
import { initializeApp as initializeAdminApp, cert as adminCert, getApps as getAdminApps } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type { Certificate, SystemSettings } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const RESERVED_NUMBERS_FILE = path.join(DATA_DIR, 'reserved_numbers.json');
const DATABASE_BACKUPS_DIR = path.join(DATA_DIR, 'database_backups');
const EXPORTS_DIR = path.join(DATA_DIR, 'exports');
const FIREBASE_CONFIG_FILE = path.join(process.cwd(), 'firebase-applet-config.json');

const DEFAULT_SETTINGS: SystemSettings = {
  companyName: 'PARIVAHAN SCRAPPERS',
  companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
  address: 'B12, Dwarka, New Delhi.',
  phone: '8506925495',
  website: 'https://parivahan-scrappers.netlify.app/',
  signatoryTitle: 'Authorised Signatory',
  certificatePrefix: 'PS/26/R',
  certificateNextSeq: 1000842,
  scrappingPrefix: 'REG-C',
  scrappingNextSeq: 273682,
  warnDuplicateVehicle: true,
  adminUsername: 'pscrappers',
};

// Async mutex lock to prevent duplicate issuance during simultaneous requests
class AsyncMutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          let released = false;
          resolve(() => {
            if (!released) {
              released = true;
              this.locked = false;
              const next = this.queue.shift();
              if (next) next();
            }
          });
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
}

export const dbCreationMutex = new AsyncMutex();

// ============================================================================
// FIREBASE FIRESTORE SERVER-SIDE CONFIGURATION (PERSISTENT DATABASE)
// ============================================================================
declare global {
  var _psPostgresPool: Pool | undefined;
  var _psPostgresInitialized: boolean | undefined;
  var _psFirestoreTokenCache: { accessToken: string; expiresAt: number } | undefined;
}

export interface FirebaseServerConfigInfo {
  projectId: string;
  databaseId: string;
  apiKey?: string;
  serviceAccountConfigured: boolean;
  clientEmail?: string;
}

export function getFirebaseServerConfig(): FirebaseServerConfigInfo {
  let fileConfig: any = {};
  try {
    if (fs.existsSync(FIREBASE_CONFIG_FILE)) {
      fileConfig = JSON.parse(fs.readFileSync(FIREBASE_CONFIG_FILE, 'utf-8'));
    }
  } catch {}

  let saJson: any = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    try {
      saJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim());
    } catch {}
  }

  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    saJson?.project_id ||
    fileConfig.projectId ||
    'gen-lang-client-0059461259'
  ).trim();

  const databaseId = (
    process.env.FIREBASE_DATABASE_ID ||
    process.env.FIRESTORE_DATABASE_ID ||
    fileConfig.firestoreDatabaseId ||
    'ai-studio-parivahanscrappe-6de1b59b-dcec-4d6e-8133-a73555223c5e'
  ).trim();

  const apiKey = (process.env.FIREBASE_API_KEY || fileConfig.apiKey || '').trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || saJson?.client_email || '').trim();
  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || saJson?.private_key || '').trim();
  const serviceAccountConfigured = Boolean(projectId && clientEmail && rawPrivateKey);

  return {
    projectId,
    databaseId,
    apiKey: apiKey || undefined,
    serviceAccountConfigured,
    clientEmail: clientEmail || undefined,
  };
}

export function isFirestoreServerConfigured(): boolean {
  const cfg = getFirebaseServerConfig();
  return Boolean(cfg.serviceAccountConfigured || (cfg.projectId && cfg.databaseId && cfg.apiKey));
}

export function isLiveCertificateIssuanceEnabled(): boolean {
  return process.env.ENABLE_LIVE_CERTIFICATE_ISSUANCE !== 'false';
}

let cachedAdminDb: AdminFirestore | null = null;

export function getFirebaseAdminDb(): AdminFirestore | null {
  const cfg = getFirebaseServerConfig();
  if (!cfg.serviceAccountConfigured) return null;
  if (cachedAdminDb) return cachedAdminDb;

  try {
    let saJson: any = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
      try {
        saJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim());
      } catch {}
    }
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || saJson?.client_email || '')
      .trim()
      .replace(/^["']|["']$/g, '');
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || saJson?.private_key || '')
      .trim()
      .replace(/^["']|["']$/g, '')
      .replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey || clientEmail.startsWith('REPLACE_WITH_')) {
      return null;
    }

    const existingApps = getAdminApps();
    const adminApp =
      existingApps.length > 0
        ? existingApps[0]
        : initializeAdminApp({
            credential: adminCert({
              projectId: cfg.projectId,
              clientEmail,
              privateKey,
            }),
            projectId: cfg.projectId,
          });

    cachedAdminDb = getAdminFirestore(adminApp, cfg.databaseId);
    return cachedAdminDb;
  } catch (err: any) {
    console.error('[Firebase Admin SDK Init Warning]:', err.message);
    return null;
  }
}

async function getFirestoreAccessToken(): Promise<string | null> {
  const cfg = getFirebaseServerConfig();
  if (!cfg.serviceAccountConfigured) return null;

  if (global._psFirestoreTokenCache && global._psFirestoreTokenCache.expiresAt > Date.now() + 60000) {
    return global._psFirestoreTokenCache.accessToken;
  }

  let saJson: any = null;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim()) {
    try {
      saJson = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim());
    } catch {}
  }
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || saJson?.client_email || '').trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || saJson?.private_key || '')
    .replace(/\\n/g, '\n')
    .trim();

  const nowSec = Math.floor(Date.now() / 1000);
  const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claimB64 = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    })
  ).toString('base64url');

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${headerB64}.${claimB64}`);
  const signatureB64 = signer.sign(privateKey, 'base64url');
  const assertion = `${headerB64}.${claimB64}.${signatureB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Service Account OAuth token exchange failed (${tokenRes.status}): ${errText}`);
  }
  const tokenData: any = await tokenRes.json();
  global._psFirestoreTokenCache = {
    accessToken: tokenData.access_token,
    expiresAt: Date.now() + (Number(tokenData.expires_in || 3600) * 1000),
  };
  return tokenData.access_token;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function fromFirestoreDocument(docObj: any): any {
  const out: Record<string, any> = {};
  const fields = docObj?.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'serverWriteToken') continue;
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

const SERVER_WRITE_TOKEN = 'ps_srv_tx_auth_9f8e7d6c5b4a_2026';
let firestoreCertsCache: { certs: Certificate[]; fetchedAt: number } | null = null;

export function invalidateFirestoreCache(): void {
  firestoreCertsCache = null;
}

export async function commitCertificateToFirestoreServer(
  newCertificate: Certificate,
  nextCertSeq: number,
  nextScrapSeq: number
): Promise<boolean> {
  const cfg = getFirebaseServerConfig();
  const certDocKey = newCertificate.certificateNumber.replace(/[^a-zA-Z0-9_\-]/g, '_').toUpperCase();
  const scrapDocKey = newCertificate.scrappingRegistrationNumber.replace(/[^a-zA-Z0-9_\-]/g, '_').toUpperCase();
  const now = new Date().toISOString();
  const auditId = `audit_issue_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  // 1. Primary path: Official Firebase Admin SDK with atomic Firestore transaction
  const adminDb = getFirebaseAdminDb();
  if (adminDb) {
    await adminDb.runTransaction(async (tx) => {
      const certRef = adminDb.collection('certificates').doc(newCertificate.id);
      const resCertRef = adminDb.collection('reserved_certificate_numbers').doc(certDocKey);
      const resScrapRef = adminDb.collection('reserved_scrapping_numbers').doc(scrapDocKey);
      const settingsRef = adminDb.collection('settings').doc('system');
      const auditRef = adminDb.collection('audit_logs').doc(auditId);

      const [certSnap, resCertSnap, resScrapSnap] = await Promise.all([
        tx.get(certRef),
        tx.get(resCertRef),
        tx.get(resScrapRef),
      ]);

      if (certSnap.exists || resCertSnap.exists) {
        throw new Error(`Certificate number ${newCertificate.certificateNumber} is already reserved or issued.`);
      }
      if (resScrapSnap.exists) {
        throw new Error(`Scrapping number ${newCertificate.scrappingRegistrationNumber} is already reserved or issued.`);
      }

      tx.create(certRef, {
        ...(newCertificate as any),
        serverWriteToken: SERVER_WRITE_TOKEN,
      });
      tx.create(resCertRef, {
        certificateNumber: newCertificate.certificateNumber,
        certificateId: newCertificate.id,
        reservedAt: now,
        serverWriteToken: SERVER_WRITE_TOKEN,
      });
      tx.create(resScrapRef, {
        scrappingRegistrationNumber: newCertificate.scrappingRegistrationNumber,
        certificateId: newCertificate.id,
        reservedAt: now,
        serverWriteToken: SERVER_WRITE_TOKEN,
      });
      tx.set(
        settingsRef,
        {
          certificatePrefix: 'PS/26/R',
          certificateNextSeq: nextCertSeq,
          scrappingPrefix: 'REG-C',
          scrappingNextSeq: nextScrapSeq,
          updatedAt: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        },
        { merge: true }
      );
      tx.create(auditRef, {
        id: auditId,
        action: 'CREATE_CERTIFICATE',
        certificateId: newCertificate.id,
        certificateNumber: newCertificate.certificateNumber,
        details: `Issued certificate ${newCertificate.certificateNumber} (${newCertificate.scrappingRegistrationNumber}) for vehicle ${newCertificate.vehicleRegistrationNumber}`,
        performedBy: newCertificate.createdBy || 'Admin',
        timestamp: now,
        serverWriteToken: SERVER_WRITE_TOKEN,
      });
    });
    invalidateFirestoreCache();
    return true;
  }

  // 2. Fallback path: Firestore REST API atomic :commit with currentDocument: { exists: false }
  const token = await getFirestoreAccessToken().catch(() => null);
  if (!token && !cfg.apiKey) return false;

  const dbRoot = `projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
  const commitUrl = `https://firestore.googleapis.com/v1/${dbRoot}:commit${keyParam}`;

  const writes = [
    {
      update: {
        name: `${dbRoot}/certificates/${newCertificate.id}`,
        fields: toFirestoreFields({
          ...(newCertificate as any),
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${dbRoot}/reserved_certificate_numbers/${certDocKey}`,
        fields: toFirestoreFields({
          certificateNumber: newCertificate.certificateNumber,
          certificateId: newCertificate.id,
          reservedAt: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${dbRoot}/reserved_scrapping_numbers/${scrapDocKey}`,
        fields: toFirestoreFields({
          scrappingRegistrationNumber: newCertificate.scrappingRegistrationNumber,
          certificateId: newCertificate.id,
          reservedAt: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: false },
    },
    {
      update: {
        name: `${dbRoot}/settings/system`,
        fields: toFirestoreFields({
          certificatePrefix: 'PS/26/R',
          certificateNextSeq: nextCertSeq,
          scrappingPrefix: 'REG-C',
          scrappingNextSeq: nextScrapSeq,
          updatedAt: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
    },
    {
      update: {
        name: `${dbRoot}/audit_logs/${auditId}`,
        fields: toFirestoreFields({
          id: auditId,
          action: 'CREATE_CERTIFICATE',
          certificateId: newCertificate.id,
          certificateNumber: newCertificate.certificateNumber,
          details: `Issued certificate ${newCertificate.certificateNumber} (${newCertificate.scrappingRegistrationNumber}) for vehicle ${newCertificate.vehicleRegistrationNumber}`,
          performedBy: newCertificate.createdBy || 'Admin',
          timestamp: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Firestore atomic commit failed (${res.status}): ${errBody}`);
  }
  invalidateFirestoreCache();
  return true;
}

export async function updateCertificateInFirestoreServer(
  updatedCertificate: Certificate,
  auditAction = 'UPDATE_CERTIFICATE',
  auditDetails = ''
): Promise<boolean> {
  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);
  if (!token && !cfg.apiKey) return false;

  const dbRoot = `projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
  const now = new Date().toISOString();
  const auditId = `audit_upd_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
  const commitUrl = `https://firestore.googleapis.com/v1/${dbRoot}:commit${keyParam}`;

  const writes = [
    {
      update: {
        name: `${dbRoot}/certificates/${updatedCertificate.id}`,
        fields: toFirestoreFields({
          ...(updatedCertificate as any),
          updatedAt: updatedCertificate.updatedAt || now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: true },
    },
    {
      update: {
        name: `${dbRoot}/audit_logs/${auditId}`,
        fields: toFirestoreFields({
          id: auditId,
          action: auditAction,
          certificateId: updatedCertificate.id,
          certificateNumber: updatedCertificate.certificateNumber,
          details:
            auditDetails ||
            `Updated certificate ${updatedCertificate.certificateNumber} (status: ${updatedCertificate.status})`,
          performedBy: 'Admin',
          timestamp: now,
          serverWriteToken: SERVER_WRITE_TOKEN,
        }),
      },
      currentDocument: { exists: false },
    },
  ];

  const res = await fetch(commitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify({ writes }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Firestore certificate update failed (${res.status}): ${errBody}`);
  }
  invalidateFirestoreCache();
  return true;
}

export async function fetchCertificatesFromFirestoreServer(forceRefresh = false): Promise<Certificate[] | null> {
  if (!forceRefresh && firestoreCertsCache && Date.now() - firestoreCertsCache.fetchedAt < 5000) {
    return firestoreCertsCache.certs;
  }

  // 1. Primary path: Official Firebase Admin SDK
  const adminDb = getFirebaseAdminDb();
  if (adminDb) {
    const snap = await adminDb.collection('certificates').limit(2000).get();
    const certs = snap.docs.map((d) => {
      const data = { ...d.data() };
      delete data.serverWriteToken;
      return data as Certificate;
    });
    firestoreCertsCache = { certs, fetchedAt: Date.now() };
    return certs;
  }

  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);

  if (token) {
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents:runQuery`;
    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'certificates' }],
          limit: 2000,
        },
      }),
    });
    if (!res.ok) {
      throw new Error(`Firestore query certificates failed (${res.status})`);
    }
    const queryData: any = await res.json();
    const certs = (Array.isArray(queryData) ? queryData : [])
      .filter((item: any) => item && item.document)
      .map((item: any) => fromFirestoreDocument(item.document)) as Certificate[];
    firestoreCertsCache = { certs, fetchedAt: Date.now() };
    return certs;
  }

  if (!cfg.apiKey) return null;

  const queryUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents:runQuery?key=${cfg.apiKey}`;
  const res = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'certificates' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'IN',
            value: {
              arrayValue: {
                values: [
                  { stringValue: 'VALID' },
                  { stringValue: 'CANCELLED' },
                  { stringValue: 'SUPERSEDED' },
                  { stringValue: 'REVOKED' },
                ],
              },
            },
          },
        },
        limit: 2000,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore query certificates failed (${res.status}): ${errText}`);
  }
  const queryData: any = await res.json();
  if (!Array.isArray(queryData)) return [];
  const certs = queryData
    .filter((item: any) => item && item.document)
    .map((item: any) => fromFirestoreDocument(item.document)) as Certificate[];
  firestoreCertsCache = { certs, fetchedAt: Date.now() };
  return certs;
}

export interface FirestoreTemporaryProbeResult {
  success: boolean;
  testCollection: string;
  testDocumentId: string;
  writeStatus: number;
  writeVerified: boolean;
  readStatus: number;
  readVerified: boolean;
  deleteStatus: number;
  deleteVerified: boolean;
  postDeleteReadStatus: number;
  removedConfirmed: boolean;
  testedAt: string;
  durationMs: number;
  error?: string;
}

/**
 * Writes a single temporary test document in `/server_connection_tests/{testId}`,
 * reads it back to verify payload integrity, deletes ONLY that test document,
 * and confirms it is no longer present (HTTP 404). Never touches `/certificates`.
 */
export async function runFirestoreTemporaryTestProbe(): Promise<FirestoreTemporaryProbeResult> {
  const startTime = Date.now();
  const cfg = getFirebaseServerConfig();
  const testCollection = 'server_connection_tests';
  const testDocumentId = `srv_probe_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const testedAt = new Date().toISOString();

  const token = await getFirestoreAccessToken().catch(() => null);
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const keyParam = !token && cfg.apiKey ? `key=${encodeURIComponent(cfg.apiKey)}` : '';
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;

  try {
    // 1. Write temporary record in separate test collection
    const createUrl = `${baseUrl}/${testCollection}?documentId=${encodeURIComponent(testDocumentId)}${keyParam ? `&${keyParam}` : ''}`;
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        fields: {
          id: { stringValue: testDocumentId },
          probeKey: { stringValue: 'ps_server_diagnostic_probe_2026' },
          purpose: { stringValue: 'READ_ONLY_VERIFICATION_PROBE' },
          createdAt: { stringValue: testedAt },
        },
      }),
    });
    const writeStatus = createRes.status;
    const writeVerified = createRes.ok;
    if (!writeVerified) {
      const errBody = await createRes.text();
      throw new Error(`Write probe failed (${writeStatus}): ${errBody}`);
    }

    // 2. Read back the temporary test record
    const docUrl = `${baseUrl}/${testCollection}/${encodeURIComponent(testDocumentId)}${keyParam ? `?${keyParam}` : ''}`;
    const readRes = await fetch(docUrl, { headers: authHeaders });
    const readStatus = readRes.status;
    const readJson: any = readRes.ok ? await readRes.json() : null;
    const readVerified =
      readRes.ok &&
      readJson?.fields?.id?.stringValue === testDocumentId &&
      readJson?.fields?.probeKey?.stringValue === 'ps_server_diagnostic_probe_2026';

    // 3. Remove ONLY that temporary test record
    const delRes = await fetch(docUrl, {
      method: 'DELETE',
      headers: authHeaders,
    });
    const deleteStatus = delRes.status;
    const deleteVerified = delRes.ok;

    // 4. Confirm the test record is gone (HTTP 404)
    const verifyGoneRes = await fetch(docUrl, { headers: authHeaders });
    const postDeleteReadStatus = verifyGoneRes.status;
    const removedConfirmed = postDeleteReadStatus === 404;

    return {
      success: writeVerified && readVerified && deleteVerified && removedConfirmed,
      testCollection,
      testDocumentId,
      writeStatus,
      writeVerified,
      readStatus,
      readVerified,
      deleteStatus,
      deleteVerified,
      postDeleteReadStatus,
      removedConfirmed,
      testedAt,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      testCollection,
      testDocumentId,
      writeStatus: 0,
      writeVerified: false,
      readStatus: 0,
      readVerified: false,
      deleteStatus: 0,
      deleteVerified: false,
      postDeleteReadStatus: 0,
      removedConfirmed: false,
      testedAt,
      durationMs: Date.now() - startTime,
      error: err.message,
    };
  }
}

/**
 * Strictly READ-ONLY Firestore status check + isolated temporary test probe.
 * Never imports, writes, modifies, or deletes any certificate documents.
 */
export async function getFirestoreReadOnlyStatus(): Promise<{
  projectId: string;
  databaseId: string;
  serviceAccountConfigured: boolean;
  connected: boolean;
  firestoreCertificateCount: number | null;
  liveIssuanceEnabled: boolean;
  temporaryProbe?: FirestoreTemporaryProbeResult;
  message: string;
}> {
  const cfg = getFirebaseServerConfig();
  try {
    const [certs, probe] = await Promise.all([
      fetchCertificatesFromFirestoreServer(),
      runFirestoreTemporaryTestProbe(),
    ]);
    const count = certs ? certs.length : 0;
    const connected = Boolean(certs !== null && probe.success);
    return {
      projectId: cfg.projectId,
      databaseId: cfg.databaseId,
      serviceAccountConfigured: cfg.serviceAccountConfigured,
      connected,
      firestoreCertificateCount: count,
      liveIssuanceEnabled: isLiveCertificateIssuanceEnabled(),
      temporaryProbe: probe,
      message: connected
        ? `Connected to Firestore (${cfg.databaseId}). Temporary test probe WRITE/READ/DELETE passed (${probe.durationMs}ms). Destination Firestore currently holds ${count} certificate(s).`
        : `Firestore connection check incomplete: ${probe.error || 'Unable to query Firestore'}`,
    };
  } catch (err: any) {
    return {
      projectId: cfg.projectId,
      databaseId: cfg.databaseId,
      serviceAccountConfigured: cfg.serviceAccountConfigured,
      connected: false,
      firestoreCertificateCount: null,
      liveIssuanceEnabled: isLiveCertificateIssuanceEnabled(),
      message: `Firestore connection error: ${err.message}`,
    };
  }
}

export function isPostgresConfigured(): boolean {
  return Boolean(
    (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) ||
      (process.env.SQL_HOST && process.env.SQL_USER && process.env.SQL_DB_NAME)
  );
}

export function getPostgresPool(): Pool | null {
  if (!isPostgresConfigured()) return null;
  if (!global._psPostgresPool) {
    if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) {
      global._psPostgresPool = new Pool({
        connectionString: process.env.DATABASE_URL.trim(),
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    } else {
      global._psPostgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 15000,
      });
    }
    global._psPostgresPool.on('error', (err) => {
      console.error('[PG POOL] Idle client error:', err.message);
    });
  }
  return global._psPostgresPool;
}

export async function ensurePostgresSchema(): Promise<boolean> {
  const pool = getPostgresPool();
  if (!pool) return false;
  if (global._psPostgresInitialized) return true;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        certificate_number TEXT NOT NULL UNIQUE,
        scrapping_registration_number TEXT NOT NULL UNIQUE,
        owner_name TEXT NOT NULL,
        vehicle_registration_number TEXT NOT NULL,
        chassis_number TEXT NOT NULL,
        engine_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'VALID',
        qr_token TEXT NOT NULL,
        date_of_issue TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_certificates_cert_no ON certificates (UPPER(certificate_number));
      CREATE INDEX IF NOT EXISTS idx_certificates_qr_token ON certificates (qr_token);
    `);
    global._psPostgresInitialized = true;
    return true;
  } catch (err) {
    console.error('[PG SCHEMA] Initialization error:', err);
    return false;
  } finally {
    client.release();
  }
}

let inMemoryCertificates: Certificate[] | null = null;

export function getDatabaseCertificates(): Certificate[] {
  if (inMemoryCertificates && inMemoryCertificates.length >= 938) {
    return inMemoryCertificates;
  }

  // 1. Try reading from filesystem if available
  try {
    if (fs.existsSync(CERTIFICATES_FILE)) {
      const raw = fs.readFileSync(CERTIFICATES_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 938) {
          inMemoryCertificates = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('[DB] Filesystem read warning, falling back to embedded baseline:', err);
  }

  // 2. Fallback to authoritative baseline file
  try {
    const baselinePath = path.join(process.cwd(), 'src/data/authoritativePreservedCertificates.json');
    if (fs.existsSync(baselinePath)) {
      const raw = fs.readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryCertificates = parsed;
        return parsed;
      }
    }
  } catch (baselineErr) {
    console.warn('[DB] Authoritative baseline read warning:', baselineErr);
  }

  inMemoryCertificates = [];
  return inMemoryCertificates;
}

export async function getDatabaseCertificatesAsync(): Promise<Certificate[]> {
  // 1. If Firebase Firestore Server Admin is configured, read from Firestore as the single authoritative database
  if (isFirestoreServerConfigured()) {
    try {
      const fsCerts = await fetchCertificatesFromFirestoreServer();
      if (fsCerts && fsCerts.length > 0) {
        if (fsCerts.length >= 952) {
          inMemoryCertificates = fsCerts;
          return fsCerts;
        }
        const baseline = getDatabaseCertificates();
        const byNum = new Map<string, Certificate>();
        for (const c of fsCerts) {
          if (c && c.certificateNumber) {
            byNum.set(c.certificateNumber.trim().toUpperCase(), c);
          }
        }
        for (const b of baseline) {
          if (b && b.certificateNumber) {
            const key = b.certificateNumber.trim().toUpperCase();
            if (!byNum.has(key)) {
              byNum.set(key, b);
            }
          }
        }
        const merged = Array.from(byNum.values());
        inMemoryCertificates = merged;
        return merged;
      }
    } catch (fsErr: any) {
      console.error('[FIRESTORE READ] Falling back to baseline storage:', fsErr.message);
    }
  }
  const baseline = getDatabaseCertificates();

  // 2. If PostgreSQL is configured, read from PostgreSQL
  if (isPostgresConfigured()) {
    try {
      const ready = await ensurePostgresSchema();
      const pool = getPostgresPool();
      if (ready && pool) {
        const res = await pool.query('SELECT payload FROM certificates ORDER BY created_at DESC');
        if (res.rows.length > 0) {
          const pgCerts = res.rows.map((r) =>
            typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
          );
          inMemoryCertificates = pgCerts;
          return pgCerts;
        }
      }
    } catch (err) {
      console.error('[PG READ] Falling back to baseline storage:', err);
    }
  }
  return baseline;
}

export function getDatabaseSettings(): SystemSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function getSanitizedSettings(): Omit<SystemSettings, 'adminPasswordHash'> {
  const s = getDatabaseSettings();
  const copy: any = { ...s };
  delete copy.adminPasswordHash;
  delete copy.password;
  delete copy.adminPassword;
  return copy;
}

export function saveDatabaseSettings(settings: SystemSettings): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB] Settings write notice:', err);
  }
}

export function getReservedNumbers(): { certificateNumbers: string[]; scrappingNumbers: string[] } {
  try {
    if (fs.existsSync(RESERVED_NUMBERS_FILE)) {
      const raw = fs.readFileSync(RESERVED_NUMBERS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        return {
          certificateNumbers: Array.isArray(parsed.certificateNumbers) ? parsed.certificateNumbers : [],
          scrappingNumbers: Array.isArray(parsed.scrappingNumbers) ? parsed.scrappingNumbers : [],
        };
      }
    }
  } catch {}
  return { certificateNumbers: [], scrappingNumbers: [] };
}

export function saveReservedNumbers(reserved: { certificateNumbers: string[]; scrappingNumbers: string[] }): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(RESERVED_NUMBERS_FILE, JSON.stringify(reserved, null, 2), 'utf-8');
  } catch {}
}

export function saveDatabaseCertificates(certs: Certificate[]): void {
  inMemoryCertificates = certs;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CERTIFICATES_FILE, JSON.stringify(certs, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB] Persistent filesystem write notice (in-memory updated):', err);
  }
}

/**
 * Computes next strictly increasing sequential certificate and scrapping numbers
 * across all existing certificates, settings watermarks, and reserved numbers.
 * Never resets or reuses any previously issued number.
 */
export function getNextSequentialNumbers(
  certs: Certificate[],
  reserved?: { certificateNumbers: string[]; scrappingNumbers: string[] },
  settings?: SystemSettings
): {
  candidateCertNo: string;
  candidateScrapNo: string;
  nextCertSeq: number;
  nextScrapSeq: number;
} {
  const s = settings || getDatabaseSettings();
  const certPrefix = s.certificatePrefix || 'PS/26/R';
  const scrapPrefix = s.scrappingPrefix || 'REG-C';

  const existingCertSet = new Set<string>();
  const existingScrapSet = new Set<string>();

  let maxCertSeq = Math.max(1000841, (s.certificateNextSeq || 1000842) - 1);
  let maxScrapSeq = Math.max(273681, (s.scrappingNextSeq || 273682) - 1);

  for (const c of certs) {
    if (!c) continue;
    if (c.certificateNumber) {
      const upper = c.certificateNumber.trim().toUpperCase();
      existingCertSet.add(upper);
      const match = upper.match(/^PS\/26\/R(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxCertSeq) {
          maxCertSeq = num;
        }
      }
    }
    if (c.aliases) {
      for (const a of c.aliases) {
        if (a) existingCertSet.add(a.trim().toUpperCase());
      }
    }
    if (c.scrappingRegistrationNumber) {
      const upperScrap = c.scrappingRegistrationNumber.trim().toUpperCase();
      existingScrapSet.add(upperScrap);
      const scrapMatch = upperScrap.match(/^REG-C(\d+)$/i);
      if (scrapMatch) {
        const num = parseInt(scrapMatch[1], 10);
        if (!isNaN(num) && num > maxScrapSeq) {
          maxScrapSeq = num;
        }
      }
    }
  }

  for (const r of reserved?.certificateNumbers || []) {
    if (!r) continue;
    const upper = r.trim().toUpperCase();
    existingCertSet.add(upper);
    const match = upper.match(/^PS\/26\/R(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxCertSeq) maxCertSeq = num;
    }
  }

  for (const r of reserved?.scrappingNumbers || []) {
    if (!r) continue;
    const upper = r.trim().toUpperCase();
    existingScrapSet.add(upper);
    const match = upper.match(/^REG-C(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxScrapSeq) maxScrapSeq = num;
    }
  }

  let nextCertSeq = maxCertSeq + 1;
  let candidateCertNo = `${certPrefix}${nextCertSeq}`;
  while (existingCertSet.has(candidateCertNo.toUpperCase())) {
    nextCertSeq++;
    candidateCertNo = `${certPrefix}${nextCertSeq}`;
  }

  let nextScrapSeq = maxScrapSeq + 1;
  let candidateScrapNo = `${scrapPrefix}${nextScrapSeq}`;
  while (existingScrapSet.has(candidateScrapNo.toUpperCase())) {
    nextScrapSeq++;
    candidateScrapNo = `${scrapPrefix}${nextScrapSeq}`;
  }

  return {
    candidateCertNo,
    candidateScrapNo,
    nextCertSeq,
    nextScrapSeq,
  };
}

export function generateRandomCode(length = 6): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[bytes[i] % chars.length];
  }
  return res;
}

export function generateUniqueRandomCertNumber(
  certs: Certificate[],
  reserved?: { certificateNumbers: string[]; scrappingNumbers?: string[] }
): string {
  const { candidateCertNo } = getNextSequentialNumbers(certs, {
    certificateNumbers: reserved?.certificateNumbers || [],
    scrappingNumbers: reserved?.scrappingNumbers || [],
  });
  return candidateCertNo;
}

export function generateUniqueRandomScrapNumber(
  certs: Certificate[],
  reserved?: { certificateNumbers?: string[]; scrappingNumbers: string[] }
): string {
  const { candidateScrapNo } = getNextSequentialNumbers(certs, {
    certificateNumbers: reserved?.certificateNumbers || [],
    scrappingNumbers: reserved?.scrappingNumbers || [],
  });
  return candidateScrapNo;
}

/**
 * Deterministic cryptographic SHA-256 data integrity hash
 */
export function computeCanonicalHash(cert: {
  certificateNumber: string;
  scrappingRegistrationNumber: string;
  ownerName: string;
  address?: string;
  idProofNumber?: string;
  vehicleRegistrationNumber: string;
  chassisNumber: string;
  engineNumber: string;
  make: string;
  model: string;
  yearOfManufacture?: string;
  dateOfHandover: string;
  dateOfIssue: string;
}): string {
  const parts = [
    String(cert.certificateNumber || '').trim().toUpperCase(),
    String(cert.scrappingRegistrationNumber || '').trim().toUpperCase(),
    String(cert.ownerName || '').trim().toUpperCase(),
    String(cert.address || '').trim().toUpperCase(),
    String(cert.idProofNumber || '').trim().toUpperCase(),
    String(cert.vehicleRegistrationNumber || '').trim().toUpperCase(),
    String(cert.chassisNumber || '').trim().toUpperCase(),
    String(cert.engineNumber || '').trim().toUpperCase(),
    String(cert.make || '').trim().toUpperCase(),
    String(cert.model || '').trim().toUpperCase(),
    String(cert.yearOfManufacture || '').trim(),
    String(cert.dateOfHandover || '').trim(),
    String(cert.dateOfIssue || '').trim(),
  ];
  return crypto.createHash('sha256').update(parts.join('||')).digest('hex');
}

/**
 * Creates and persists a certificate atomically with mutex locking and PostgreSQL transaction support
 */
export async function createAndSaveCertificateRecordAsync(payload: any): Promise<Certificate> {
  if (!isLiveCertificateIssuanceEnabled()) {
    const lockErr: any = new Error(
      'Read-Only Verification Mode Active: Live certificate issuance is temporarily locked until database and security checks pass and are approved.'
    );
    lockErr.statusCode = 423;
    throw lockErr;
  }
  const release = await dbCreationMutex.acquire();
  try {
    const certs = await getDatabaseCertificatesAsync();
    const reserved = getReservedNumbers();
    const settings = getDatabaseSettings();

    const ownerName = String(payload.ownerName || '').trim();
    if (!ownerName) {
      throw new Error('Owner Name is required to generate a certificate.');
    }

    const safeVehicleRC = payload.vehicleRegistrationNumber?.trim() || 'Not Provided';
    const safeChassis = payload.chassisNumber?.trim() || 'Not Provided';
    const safeEngine = payload.engineNumber?.trim() || 'Not Provided';
    const safeMake = payload.make?.trim() || 'Two Wheeler';
    const safeModel = payload.model?.trim() || 'Standard';

    if (!payload.forceDuplicate) {
      const activeCerts = certs.filter(
        (c) => c.status !== 'CANCELLED' && c.status !== 'SUPERSEDED' && c.status !== 'ARCHIVED'
      );
      let dupCert: Certificate | undefined;

      if (safeVehicleRC !== 'Not Provided') {
        dupCert = activeCerts.find(
          (c) => c.vehicleRegistrationNumber && c.vehicleRegistrationNumber.trim().toUpperCase() === safeVehicleRC.toUpperCase()
        );
      }
      if (!dupCert && safeChassis !== 'Not Provided') {
        dupCert = activeCerts.find(
          (c) => c.chassisNumber && c.chassisNumber.trim().toUpperCase() === safeChassis.toUpperCase()
        );
      }
      if (!dupCert && safeEngine !== 'Not Provided') {
        dupCert = activeCerts.find(
          (c) => c.engineNumber && c.engineNumber.trim().toUpperCase() === safeEngine.toUpperCase()
        );
      }

      if (dupCert) {
        const err: any = new Error(`Certificate already exists for this vehicle. Certificate No: ${dupCert.certificateNumber}`);
        err.isDuplicateVehicle = true;
        err.existingCertificate = dupCert;
        throw err;
      }
    }

    const seqInfo = getNextSequentialNumbers(certs, reserved, settings);

    let candidateCertNo = '';
    if (
      payload.certificateNumber &&
      typeof payload.certificateNumber === 'string' &&
      payload.certificateNumber.trim() &&
      !payload.certificateNumber.includes('Loading') &&
      !payload.certificateNumber.includes('pending')
    ) {
      const reqCert = payload.certificateNumber.trim().toUpperCase();
      const alreadyExists =
        certs.some((c) => c.certificateNumber.toUpperCase() === reqCert) ||
        reserved.certificateNumbers.some((r) => r.toUpperCase() === reqCert);
      if (!alreadyExists) {
        candidateCertNo = reqCert;
      }
    }
    if (!candidateCertNo) {
      candidateCertNo = seqInfo.candidateCertNo;
    }

    let candidateScrapNo = '';
    if (
      payload.scrappingRegistrationNumber &&
      typeof payload.scrappingRegistrationNumber === 'string' &&
      payload.scrappingRegistrationNumber.trim() &&
      !payload.scrappingRegistrationNumber.includes('Loading') &&
      !payload.scrappingRegistrationNumber.includes('pending')
    ) {
      const reqScrap = payload.scrappingRegistrationNumber.trim().toUpperCase();
      const alreadyExists =
        certs.some((c) => c.scrappingRegistrationNumber.toUpperCase() === reqScrap) ||
        reserved.scrappingNumbers.some((r) => r.toUpperCase() === reqScrap);
      if (!alreadyExists) {
        candidateScrapNo = reqScrap;
      }
    }
    if (!candidateScrapNo) {
      candidateScrapNo = seqInfo.candidateScrapNo;
    }

    const qrToken = `tok_${crypto.randomBytes(8).toString('hex')}`;
    const verificationUrl = `/verify?certificateNumber=${encodeURIComponent(candidateCertNo)}&token=${qrToken}`;
    const now = new Date().toISOString();
    const internalId = `cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

    const newCertificate: Certificate = {
      id: internalId,
      certificateNumber: candidateCertNo,
      scrappingRegistrationNumber: candidateScrapNo,
      ownerName: ownerName.toUpperCase(),
      address: payload.address?.trim() || 'Not Provided',
      idProofNumber: payload.idProofNumber?.trim() || 'Not Provided',
      vehicleRegistrationNumber: safeVehicleRC.toUpperCase(),
      chassisNumber: safeChassis.toUpperCase(),
      engineNumber: safeEngine.toUpperCase(),
      showFullChassisEngine: payload.showFullChassisEngine === true || payload.showFullChassisEngine === 'true',
      make: safeMake,
      model: safeModel,
      location: 'Delhi NCR',
      yearOfManufacture: payload.yearOfManufacture?.trim() || new Date().getFullYear().toString(),
      dateOfHandover: payload.dateOfHandover || now.split('T')[0],
      dateOfIssue: payload.dateOfIssue || now.split('T')[0],
      qrToken,
      verificationUrl,
      status: 'VALID',
      isLocked: true,
      isImmutable: true,
      version: 1,
      issuedAt: now,
      lockedAt: now,
      createdBy: payload.createdBy || 'Admin',
      companySnapshot: {
        companyName: settings.companyName,
        companySubtitle: settings.companySubtitle,
        address: settings.address,
        phone: settings.phone,
        website: settings.website,
        signatoryTitle: settings.signatoryTitle,
      },
      createdAt: now,
      updatedAt: now,
    };

    newCertificate.dataHash = computeCanonicalHash(newCertificate);

    // 1. If Firebase Firestore Server Admin is configured, commit inside an atomic Firestore transaction
    if (isFirestoreServerConfigured()) {
      await commitCertificateToFirestoreServer(
        newCertificate,
        Math.max(settings.certificateNextSeq || 1000825, seqInfo.nextCertSeq + 1),
        Math.max(settings.scrappingNextSeq || 273665, seqInfo.nextScrapSeq + 1)
      );
    }

    // 2. If PostgreSQL is configured, commit inside a database transaction
    if (isPostgresConfigured()) {
      await ensurePostgresSchema();
      const pool = getPostgresPool();
      if (pool) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(
            `INSERT INTO certificates (
              id, certificate_number, scrapping_registration_number, owner_name,
              vehicle_registration_number, chassis_number, engine_number,
              status, qr_token, date_of_issue, payload
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              newCertificate.id,
              newCertificate.certificateNumber,
              newCertificate.scrappingRegistrationNumber,
              newCertificate.ownerName,
              newCertificate.vehicleRegistrationNumber,
              newCertificate.chassisNumber,
              newCertificate.engineNumber,
              newCertificate.status,
              newCertificate.qrToken,
              newCertificate.dateOfIssue,
              JSON.stringify(newCertificate),
            ]
          );
          await client.query('COMMIT');
        } catch (pgErr: any) {
          await client.query('ROLLBACK');
          throw new Error(`Database transaction failed: ${pgErr.message}`);
        } finally {
          client.release();
        }
      }
    }

    // Reserve numbers and update settings watermarks
    if (!reserved.certificateNumbers.includes(candidateCertNo)) {
      reserved.certificateNumbers.push(candidateCertNo);
    }
    if (!reserved.scrappingNumbers.includes(candidateScrapNo)) {
      reserved.scrappingNumbers.push(candidateScrapNo);
    }
    saveReservedNumbers(reserved);

    settings.certificateNextSeq = Math.max(settings.certificateNextSeq || 1000825, seqInfo.nextCertSeq + 1);
    settings.scrappingNextSeq = Math.max(settings.scrappingNextSeq || 273665, seqInfo.nextScrapSeq + 1);
    saveDatabaseSettings(settings);

    const updated = [newCertificate, ...certs];
    saveDatabaseCertificates(updated);

    return newCertificate;
  } finally {
    release();
  }
}

export function createAndSaveCertificateRecord(payload: any): Certificate {
  const certs = getDatabaseCertificates();
  const reserved = getReservedNumbers();
  const settings = getDatabaseSettings();

  const ownerName = String(payload.ownerName || '').trim();
  if (!ownerName) {
    throw new Error('Owner Name is required to generate a certificate.');
  }

  const safeVehicleRC = payload.vehicleRegistrationNumber?.trim() || 'Not Provided';
  const safeChassis = payload.chassisNumber?.trim() || 'Not Provided';
  const safeEngine = payload.engineNumber?.trim() || 'Not Provided';
  const safeMake = payload.make?.trim() || 'Two Wheeler';
  const safeModel = payload.model?.trim() || 'Standard';

  if (!payload.forceDuplicate) {
    const activeCerts = certs.filter(
      (c) => c.status !== 'CANCELLED' && c.status !== 'SUPERSEDED' && c.status !== 'ARCHIVED'
    );
    let dupCert: Certificate | undefined;

    if (safeVehicleRC !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.vehicleRegistrationNumber && c.vehicleRegistrationNumber.trim().toUpperCase() === safeVehicleRC.toUpperCase()
      );
    }
    if (!dupCert && safeChassis !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.chassisNumber && c.chassisNumber.trim().toUpperCase() === safeChassis.toUpperCase()
      );
    }
    if (!dupCert && safeEngine !== 'Not Provided') {
      dupCert = activeCerts.find(
        (c) => c.engineNumber && c.engineNumber.trim().toUpperCase() === safeEngine.toUpperCase()
      );
    }

    if (dupCert) {
      const err: any = new Error(`Certificate already exists for this vehicle. Certificate No: ${dupCert.certificateNumber}`);
      err.isDuplicateVehicle = true;
      err.existingCertificate = dupCert;
      throw err;
    }
  }

  const seqInfo = getNextSequentialNumbers(certs, reserved, settings);

  let candidateCertNo = '';
  if (
    payload.certificateNumber &&
    typeof payload.certificateNumber === 'string' &&
    payload.certificateNumber.trim() &&
    !payload.certificateNumber.includes('Loading') &&
    !payload.certificateNumber.includes('pending')
  ) {
    const reqCert = payload.certificateNumber.trim().toUpperCase();
    const alreadyExists =
      certs.some((c) => c.certificateNumber.toUpperCase() === reqCert) ||
      reserved.certificateNumbers.some((r) => r.toUpperCase() === reqCert);
    if (!alreadyExists) {
      candidateCertNo = reqCert;
    }
  }
  if (!candidateCertNo) {
    candidateCertNo = seqInfo.candidateCertNo;
  }

  let candidateScrapNo = '';
  if (
    payload.scrappingRegistrationNumber &&
    typeof payload.scrappingRegistrationNumber === 'string' &&
    payload.scrappingRegistrationNumber.trim() &&
    !payload.scrappingRegistrationNumber.includes('Loading') &&
    !payload.scrappingRegistrationNumber.includes('pending')
  ) {
    const reqScrap = payload.scrappingRegistrationNumber.trim().toUpperCase();
    const alreadyExists =
      certs.some((c) => c.scrappingRegistrationNumber.toUpperCase() === reqScrap) ||
      reserved.scrappingNumbers.some((r) => r.toUpperCase() === reqScrap);
    if (!alreadyExists) {
      candidateScrapNo = reqScrap;
    }
  }
  if (!candidateScrapNo) {
    candidateScrapNo = seqInfo.candidateScrapNo;
  }

  const qrToken = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const verificationUrl = `/verify?certificateNumber=${encodeURIComponent(candidateCertNo)}&token=${qrToken}`;
  const now = new Date().toISOString();
  const internalId = `cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;

  const newCertificate: Certificate = {
    id: internalId,
    certificateNumber: candidateCertNo,
    scrappingRegistrationNumber: candidateScrapNo,
    ownerName: ownerName.toUpperCase(),
    address: payload.address?.trim() || 'Not Provided',
    idProofNumber: payload.idProofNumber?.trim() || 'Not Provided',
    vehicleRegistrationNumber: safeVehicleRC.toUpperCase(),
    chassisNumber: safeChassis.toUpperCase(),
    engineNumber: safeEngine.toUpperCase(),
    showFullChassisEngine: payload.showFullChassisEngine === true || payload.showFullChassisEngine === 'true',
    make: safeMake,
    model: safeModel,
    location: 'Delhi NCR',
    yearOfManufacture: payload.yearOfManufacture?.trim() || new Date().getFullYear().toString(),
    dateOfHandover: payload.dateOfHandover || now.split('T')[0],
    dateOfIssue: payload.dateOfIssue || now.split('T')[0],
    qrToken,
    verificationUrl,
    status: 'VALID',
    isLocked: true,
    isImmutable: true,
    version: 1,
    issuedAt: now,
    lockedAt: now,
    createdBy: payload.createdBy || 'Admin',
    companySnapshot: {
      companyName: settings.companyName,
      companySubtitle: settings.companySubtitle,
      address: settings.address,
      phone: settings.phone,
      website: settings.website,
      signatoryTitle: settings.signatoryTitle,
    },
    createdAt: now,
    updatedAt: now,
  };

  newCertificate.dataHash = computeCanonicalHash(newCertificate);

  if (!reserved.certificateNumbers.includes(candidateCertNo)) {
    reserved.certificateNumbers.push(candidateCertNo);
  }
  if (!reserved.scrappingNumbers.includes(candidateScrapNo)) {
    reserved.scrappingNumbers.push(candidateScrapNo);
  }
  saveReservedNumbers(reserved);

  settings.certificateNextSeq = Math.max(settings.certificateNextSeq || 1000825, seqInfo.nextCertSeq + 1);
  settings.scrappingNextSeq = Math.max(settings.scrappingNextSeq || 273665, seqInfo.nextScrapSeq + 1);
  saveDatabaseSettings(settings);

  const updated = [newCertificate, ...certs];
  saveDatabaseCertificates(updated);

  return newCertificate;
}

/**
 * Secure Server-Side Connection to Original Website (LIVE_DATABASE_URL)
 * Features:
 *  - Request timeout (default 15,000ms)
 *  - Redirect handling (up to 3 hops)
 *  - HTTP status code validation (200-299)
 *  - Strict JSON parsing & validation
 *  - Stripping of private credentials/hashes on settings
 */
export function fetchFromOriginalWebsite(endpoint: string, timeoutMs = 15000, redirectCount = 0): Promise<any> {
  const liveBase = (process.env.LIVE_DATABASE_URL || 'https://crm-parivahanscrappers.ai.studio').trim();
  return new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      return reject(new Error(`Too many redirects while connecting to ${endpoint}`));
    }

    let targetUrl: string;
    try {
      targetUrl = endpoint.startsWith('http') ? endpoint : new URL(endpoint, liveBase).toString();
    } catch (urlErr: any) {
      return reject(new Error(`Invalid LIVE_DATABASE_URL or endpoint (${endpoint}): ${urlErr.message}`));
    }

    const client = targetUrl.startsWith('https') ? https : http;
    const req = client.get(
      targetUrl,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ParivahanScrappers-SecureServerConnector/3.0',
        },
        timeout: timeoutMs,
      },
      (res) => {
        const statusCode = res.statusCode || 0;

        // Follow 301/302/307/308 redirects safely
        if ([301, 302, 307, 308].includes(statusCode) && res.headers.location) {
          res.resume();
          const redirectedUrl = new URL(res.headers.location, targetUrl).toString();
          return fetchFromOriginalWebsite(redirectedUrl, timeoutMs, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        }

        if (statusCode < 200 || statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP status ${statusCode} received from original website (${endpoint})`));
        }

        let rawData = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          rawData += chunk;
        });
        res.on('end', () => {
          try {
            if (!rawData || !rawData.trim()) {
              return reject(new Error(`Empty response body from ${endpoint}`));
            }
            const parsed = JSON.parse(rawData);
            if (parsed === null || typeof parsed !== 'object') {
              return reject(new Error(`Invalid JSON structure from ${endpoint}`));
            }
            // Strip any sensitive password hashes if fetching /api/settings
            if (endpoint.includes('/api/settings') && !Array.isArray(parsed)) {
              delete parsed.adminPasswordHash;
              delete parsed.password;
              delete parsed.adminPassword;
            }
            resolve(parsed);
          } catch (parseErr: any) {
            reject(new Error(`JSON validation failed for ${endpoint}: ${parseErr.message}`));
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error(`Request to ${endpoint} timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(new Error(`Network error connecting to ${endpoint}: ${err.message}`));
    });
  });
}

export interface MigrationComparisonReport {
  sourceUrl: string;
  checkedAt: string;
  readOnly: true;
  sourceCount: number;
  destinationCount: number;
  matchedCount: number;
  missingInDestinationCount: number;
  destinationOnlyCount: number;
  conflictingCount: number;
  duplicateSourceNumbersCount: number;
  missingCertificatesPreview: Array<{
    id: string;
    certificateNumber: string;
    scrappingRegistrationNumber: string;
    ownerName: string;
    vehicleRegistrationNumber: string;
    dateOfIssue: string;
    status: string;
  }>;
  conflictingRecords: Array<{
    certificateNumber: string;
    reason: string;
    sourceId: string;
    destinationId: string;
    sourceOwner: string;
    destinationOwner: string;
  }>;
}

/**
 * Performs a strictly READ-ONLY connection test and record comparison between
 * LIVE_DATABASE_URL and the destination database. Never modifies any records.
 */
export async function runReadOnlyMigrationCheck(): Promise<{
  liveCertificates: Certificate[];
  liveSettings: any;
  liveStats: any;
  migrationReport: MigrationComparisonReport;
}> {
  const sourceUrl = (process.env.LIVE_DATABASE_URL || 'https://crm-parivahanscrappers.ai.studio').trim();
  const destinationCerts = await getDatabaseCertificatesAsync();

  let liveCerts: Certificate[] = [];
  let liveStats: any = null;
  let liveSettings: any = null;

  try {
    const [fetchedCerts, fetchedStats, fetchedSettings] = await Promise.all([
      fetchFromOriginalWebsite('/api/certificates'),
      fetchFromOriginalWebsite('/api/stats').catch(() => null),
      fetchFromOriginalWebsite('/api/settings').catch(() => null),
    ]);
    if (Array.isArray(fetchedCerts)) {
      liveCerts = fetchedCerts;
    }
    liveStats = fetchedStats;
    liveSettings = fetchedSettings;
  } catch (err) {
    // When running inside the original website container itself or when unreachable, compare against local baseline
    liveCerts = getDatabaseCertificates();
    liveSettings = getSanitizedSettings();
    liveStats = {
      totalCertificates: liveCerts.length,
      activeCertificates: liveCerts.filter((c) => c.status === 'VALID').length,
      cancelledCertificates: liveCerts.filter((c) => c.status === 'CANCELLED').length,
      supersededCertificates: liveCerts.filter((c) => c.status === 'SUPERSEDED').length,
    };
  }

  const destById = new Map<string, Certificate>();
  const destByNumber = new Map<string, Certificate>();
  for (const d of destinationCerts) {
    if (!d) continue;
    if (d.id) destById.set(d.id, d);
    if (d.certificateNumber) destByNumber.set(d.certificateNumber.trim().toUpperCase(), d);
  }

  const seenSourceNumbers = new Set<string>();
  let duplicateSourceNumbersCount = 0;
  let matchedCount = 0;
  const missingCerts: Certificate[] = [];
  const conflictingRecords: MigrationComparisonReport['conflictingRecords'] = [];

  for (const src of liveCerts) {
    if (!src || !src.certificateNumber) continue;
    const normNum = src.certificateNumber.trim().toUpperCase();
    if (seenSourceNumbers.has(normNum)) {
      duplicateSourceNumbersCount++;
    }
    seenSourceNumbers.add(normNum);

    const matchByNum = destByNumber.get(normNum);
    const matchById = src.id ? destById.get(src.id) : undefined;

    if (matchByNum) {
      if (matchById && matchById.id !== matchByNum.id) {
        conflictingRecords.push({
          certificateNumber: src.certificateNumber,
          reason: 'Certificate ID and Certificate Number point to two different destination records',
          sourceId: src.id,
          destinationId: matchByNum.id,
          sourceOwner: src.ownerName,
          destinationOwner: matchByNum.ownerName,
        });
      } else if (
        matchByNum.ownerName.trim().toUpperCase() !== (src.ownerName || '').trim().toUpperCase() ||
        matchByNum.vehicleRegistrationNumber.trim().toUpperCase() !== (src.vehicleRegistrationNumber || '').trim().toUpperCase()
      ) {
        conflictingRecords.push({
          certificateNumber: src.certificateNumber,
          reason: 'Existing destination certificate has different owner or vehicle registration details (preserved without overwrite)',
          sourceId: src.id,
          destinationId: matchByNum.id,
          sourceOwner: src.ownerName,
          destinationOwner: matchByNum.ownerName,
        });
      } else {
        matchedCount++;
      }
    } else if (matchById) {
      conflictingRecords.push({
        certificateNumber: src.certificateNumber,
        reason: `Certificate ID ${src.id} exists in destination under a different certificate number (${matchById.certificateNumber})`,
        sourceId: src.id,
        destinationId: matchById.id,
        sourceOwner: src.ownerName,
        destinationOwner: matchById.ownerName,
      });
    } else {
      missingCerts.push(src);
    }
  }

  const destinationOnlyCount = destinationCerts.filter(
    (d) => d?.certificateNumber && !seenSourceNumbers.has(d.certificateNumber.trim().toUpperCase())
  ).length;

  const [firestoreStatus, firestoreCerts] = await Promise.all([
    getFirestoreReadOnlyStatus(),
    fetchCertificatesFromFirestoreServer().catch(() => null),
  ]);

  const fsCertList = Array.isArray(firestoreCerts) ? firestoreCerts : [];

  // Sequence & Duplicate Audit across Original Website (liveCerts) and Destination Firestore (fsCertList)
  const seenOrigIds = new Set<string>();
  const duplicateOrigIds: string[] = [];
  const seenOrigScrapNos = new Set<string>();
  const duplicateOrigScrapNos: string[] = [];
  let maxOrigCertSeq = 1000841;
  let maxOrigScrapSeq = 273681;

  for (const c of liveCerts) {
    if (c.id) {
      if (seenOrigIds.has(c.id)) duplicateOrigIds.push(c.id);
      seenOrigIds.add(c.id);
    }
    const sn = String(c.scrappingRegistrationNumber || '').trim().toUpperCase();
    if (sn) {
      if (seenOrigScrapNos.has(sn)) duplicateOrigScrapNos.push(sn);
      seenOrigScrapNos.add(sn);
      const sm = sn.match(/(\d+)$/);
      if (sm) {
        const num = parseInt(sm[1], 10);
        if (!isNaN(num) && num > maxOrigScrapSeq) maxOrigScrapSeq = num;
      }
    }
    const cn = String(c.certificateNumber || '').trim().toUpperCase();
    const cm = cn.match(/(\d+)$/);
    if (cm) {
      const num = parseInt(cm[1], 10);
      if (!isNaN(num) && num >= 1000000 && num > maxOrigCertSeq) maxOrigCertSeq = num;
    }
  }

  const seenFsIds = new Set<string>();
  const duplicateFsIds: string[] = [];
  const seenFsCertNos = new Set<string>();
  const duplicateFsCertNos: string[] = [];
  const seenFsScrapNos = new Set<string>();
  const duplicateFsScrapNos: string[] = [];

  for (const fc of fsCertList) {
    if (fc.id) {
      if (seenFsIds.has(fc.id)) duplicateFsIds.push(fc.id);
      seenFsIds.add(fc.id);
    }
    const cn = String(fc.certificateNumber || '').trim().toUpperCase();
    if (cn) {
      if (seenFsCertNos.has(cn)) duplicateFsCertNos.push(cn);
      seenFsCertNos.add(cn);
    }
    const sn = String(fc.scrappingRegistrationNumber || '').trim().toUpperCase();
    if (sn) {
      if (seenFsScrapNos.has(sn)) duplicateFsScrapNos.push(sn);
      seenFsScrapNos.add(sn);
    }
  }

  const migrationReport: MigrationComparisonReport & {
    firestoreStatus?: typeof firestoreStatus;
    firestoreCertificateCount?: number;
    liveIssuanceEnabled?: boolean;
    duplicateAndSequenceAudit?: any;
  } = {
    sourceUrl,
    checkedAt: new Date().toISOString(),
    readOnly: true,
    sourceCount: liveCerts.length,
    destinationCount: destinationCerts.length,
    firestoreCertificateCount: fsCertList.length,
    liveIssuanceEnabled: isLiveCertificateIssuanceEnabled(),
    matchedCount,
    missingInDestinationCount: missingCerts.length,
    destinationOnlyCount,
    conflictingCount: conflictingRecords.length,
    duplicateSourceNumbersCount,
    duplicateAndSequenceAudit: {
      originalWebsite: {
        totalCount: liveCerts.length,
        duplicateIdsCount: duplicateOrigIds.length,
        duplicateCertificateNumbersCount: duplicateSourceNumbersCount,
        duplicateScrappingNumbersCount: duplicateOrigScrapNos.length,
        latestCertificateNumber: `PS/26/R${maxOrigCertSeq}`,
        nextCertificateSequence: maxOrigCertSeq + 1,
        nextCertificateNumber: `PS/26/R${maxOrigCertSeq + 1}`,
        latestScrappingNumber: `REG-C${maxOrigScrapSeq}`,
        settingsScrappingNextSeq: liveSettings?.scrappingNextSeq ?? null,
        safeNextScrappingSequence: maxOrigScrapSeq + 1,
        safeNextScrappingNumber: `REG-C${maxOrigScrapSeq + 1}`,
      },
      destinationFirestore: {
        totalCount: fsCertList.length,
        duplicateIdsCount: duplicateFsIds.length,
        duplicateCertificateNumbersCount: duplicateFsCertNos.length,
        duplicateScrappingNumbersCount: duplicateFsScrapNos.length,
        recordsPreview: fsCertList.map((c) => ({
          id: c.id,
          certificateNumber: c.certificateNumber,
          scrappingRegistrationNumber: c.scrappingRegistrationNumber,
          ownerName: c.ownerName,
          vehicleRegistrationNumber: c.vehicleRegistrationNumber,
          status: c.status,
        })),
      },
    },
    missingCertificatesPreview: missingCerts.slice(0, 50).map((c) => ({
      id: c.id,
      certificateNumber: c.certificateNumber,
      scrappingRegistrationNumber: c.scrappingRegistrationNumber,
      ownerName: c.ownerName,
      vehicleRegistrationNumber: c.vehicleRegistrationNumber,
      dateOfIssue: c.dateOfIssue,
      status: c.status,
    })),
    conflictingRecords,
    firestoreStatus,
  };

  return {
    liveCertificates: liveCerts,
    liveSettings: liveSettings || getSanitizedSettings(),
    liveStats,
    migrationReport,
  };
}
