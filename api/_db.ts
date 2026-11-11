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
import {
  CORE_ADMIN_INITIAL_PASSWORD,
  matchesInitialCoreAdminPassword,
  verifyAdminCredentials,
  hashCoreAdminPassword,
  verifyCoreAdminHash,
  createCoreAdminToken,
  verifyCoreAdminToken,
  extractCoreAdminTokensFromReq,
  safeCompare,
  setCachedMakerSessionVersion,
} from './_auth.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const CERTIFICATES_FILE = path.join(DATA_DIR, 'certificates.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const CORE_ADMIN_CREDS_FILE = path.join(DATA_DIR, 'core_admin_credentials.json');
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

// Authoritative exclusion list for confirmed synthetic test certificates generated during audit suites
export const EXCLUDED_SYNTHETIC_TEST_IDS = new Set<string>([
  'cert-1793982817191-45f982fa96e2',
  'cert-1793982914462-0e4f869fbc18',
  'cert-1793983972204-32451644c600',
  'cert-1793984129303-38318eb06f4e',
  'cert-1793986942086-f7fa134b6def',
  'cert-1793364775204-47122786c04d',
  'cert-1793364787559-a85df20336a0',
  'cert-1793364723381-97d12500c39d',
]);

/**
 * Deterministic guard that detects and excludes synthetic diagnostic/integration test records
 * so that snapshot restorations or cache reads can never introduce synthetic test records into production.
 */
export function isSyntheticTestCertificate(c: any): boolean {
  if (!c || typeof c !== 'object') return false;
  if (c.id && EXCLUDED_SYNTHETIC_TEST_IDS.has(String(c.id))) return true;
  const owner = String(c.ownerName || '').trim().toUpperCase();
  const veh = String(c.vehicleRegistrationNumber || '').trim().toUpperCase();
  const chassis = String(c.chassisNumber || '').trim().toUpperCase();
  const engine = String(c.engineNumber || '').trim().toUpperCase();
  if (
    owner === 'DIAGNOSTIC TEST VEHICLE OWNER' ||
    owner === 'INTEGRATION TEST USER' ||
    (veh.startsWith('TEST-DL-') && chassis.startsWith('TEST-CH-') && engine.startsWith('TEST-EN-'))
  ) {
    return true;
  }
  return false;
}

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

export async function getFirestoreAccessToken(): Promise<string | null> {
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

export function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
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

export const SERVER_WRITE_TOKEN = 'ps_srv_tx_auth_9f8e7d6c5b4a_2026';
let firestoreCertsCache: { certs: Certificate[]; fetchedAt: number } | null = null;
let inFlightFirestoreCertsPromise: Promise<Certificate[] | null> | null = null;
let firestoreQuotaCooldownUntil = 0;

export function invalidateFirestoreCache(updatedOrNewCert?: Certificate): void {
  if (updatedOrNewCert && firestoreCertsCache && Array.isArray(firestoreCertsCache.certs)) {
    const normNo = String(updatedOrNewCert.certificateNumber || '').trim().toUpperCase();
    const filtered = firestoreCertsCache.certs.filter(
      (c) => String(c.certificateNumber || '').trim().toUpperCase() !== normNo && c.id !== updatedOrNewCert.id
    );
    firestoreCertsCache = {
      certs: [updatedOrNewCert, ...filtered],
      fetchedAt: Date.now(),
    };
    return;
  }
  firestoreCertsCache = null;
  inFlightFirestoreCertsPromise = null;
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
    invalidateFirestoreCache(newCertificate);
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
  invalidateFirestoreCache(updatedCertificate);
  return true;
}

export async function fetchCertificatesFromFirestoreServer(forceRefresh = false): Promise<Certificate[] | null> {
  if (!forceRefresh && firestoreCertsCache && Date.now() - firestoreCertsCache.fetchedAt < 300000) {
    return firestoreCertsCache.certs;
  }
  if (Date.now() < firestoreQuotaCooldownUntil) {
    const fallbackCerts = firestoreCertsCache?.certs || getDatabaseCertificates();
    firestoreCertsCache = { certs: fallbackCerts, fetchedAt: Date.now() };
    return fallbackCerts;
  }
  if (!forceRefresh && inFlightFirestoreCertsPromise) {
    return inFlightFirestoreCertsPromise;
  }

  inFlightFirestoreCertsPromise = (async () => {
    try {
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
        if (res.status === 429) {
          firestoreQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
          const fallbackCerts = getDatabaseCertificates();
          firestoreCertsCache = { certs: fallbackCerts, fetchedAt: Date.now() };
          return fallbackCerts;
        }
        if (!res.ok) {
          throw new Error(`Firestore query certificates failed (${res.status})`);
        }
        const queryData: any = await res.json();
        const certs = ((Array.isArray(queryData) ? queryData : [])
          .filter((item: any) => item && item.document)
          .map((item: any) => fromFirestoreDocument(item.document)) as Certificate[])
          .filter((c) => c && c.id && !isSyntheticTestCertificate(c));
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

      if (res.status === 429) {
        firestoreQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
        const fallbackCerts = getDatabaseCertificates();
        firestoreCertsCache = { certs: fallbackCerts, fetchedAt: Date.now() };
        return fallbackCerts;
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Firestore query certificates failed (${res.status}): ${errText}`);
      }
      const queryData: any = await res.json();
      if (!Array.isArray(queryData)) return [];
      const certs = (queryData
        .filter((item: any) => item && item.document)
        .map((item: any) => fromFirestoreDocument(item.document)) as Certificate[])
        .filter((c) => c && c.id && !isSyntheticTestCertificate(c));
      firestoreCertsCache = { certs, fetchedAt: Date.now() };
      return certs;
    } catch (err: any) {
      if (String(err?.message || '').includes('429') || String(err?.message || '').includes('Quota exceeded')) {
        firestoreQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
        const fallbackCerts = getDatabaseCertificates();
        firestoreCertsCache = { certs: fallbackCerts, fetchedAt: Date.now() };
        return fallbackCerts;
      }
      throw err;
    } finally {
      inFlightFirestoreCertsPromise = null;
    }
  })();

  return inFlightFirestoreCertsPromise;
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
          const filtered = parsed.filter((c: any) => c && c.id && !isSyntheticTestCertificate(c));
          inMemoryCertificates = filtered;
          return filtered;
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
    } catch (_fsErr: any) {
      // Gracefully fall back to synchronized baseline storage without emitting noisy console errors
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

let inMemorySettings: SystemSettings | null = null;

export function getDatabaseSettings(): SystemSettings {
  let diskSettings: SystemSettings | null = null;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        diskSettings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch {}

  if (inMemorySettings && diskSettings) {
    const memVer = Number((inMemorySettings as any).makerSessionVersion) || 1;
    const diskVer = Number((diskSettings as any).makerSessionVersion) || 1;
    const chosen = diskVer > memVer ? { ...inMemorySettings, ...diskSettings } : { ...diskSettings, ...inMemorySettings };
    inMemorySettings = chosen;
    setCachedMakerSessionVersion(Number((chosen as any).makerSessionVersion) || 1);
    return chosen;
  }

  if (diskSettings) {
    inMemorySettings = diskSettings;
    setCachedMakerSessionVersion(Number((diskSettings as any).makerSessionVersion) || 1);
    return diskSettings;
  }

  if (inMemorySettings) {
    setCachedMakerSessionVersion(Number((inMemorySettings as any).makerSessionVersion) || 1);
    return inMemorySettings;
  }

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
  inMemorySettings = { ...settings };
  setCachedMakerSessionVersion(Number((settings as any).makerSessionVersion) || 1);
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
/**
 * Generates cryptographically secure random unique certificate and scrapping numbers
 * checked against the complete Firestore database and reserved numbers.
 * Preserves existing prefixes and format:
 *   Certificate: PS/26/R + 7 cryptographically random digits (1000000 - 9999999)
 *   Scrap Registration: REG-C + 6 cryptographically random digits (100000 - 999999)
 * Never consumes or reserves a number until a certificate is actually created.
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
  }

  for (const r of reserved?.scrappingNumbers || []) {
    if (!r) continue;
    const upper = r.trim().toUpperCase();
    existingScrapSet.add(upper);
  }

  // Generate cryptographically secure random 7-digit numeric suffix for Certificate Number
  let randomCertNum = crypto.randomInt(1000000, 10000000);
  let candidateCertNo = `${certPrefix}${randomCertNum}`;
  let attempts = 0;
  while (existingCertSet.has(candidateCertNo.toUpperCase()) && attempts < 10000) {
    randomCertNum = crypto.randomInt(1000000, 10000000);
    candidateCertNo = `${certPrefix}${randomCertNum}`;
    attempts++;
  }

  // Generate cryptographically secure random 6-digit numeric suffix for Scrap Registration Number
  let randomScrapNum = crypto.randomInt(100000, 1000000);
  let candidateScrapNo = `${scrapPrefix}${randomScrapNum}`;
  attempts = 0;
  while (
    (existingScrapSet.has(candidateScrapNo.toUpperCase()) ||
      candidateScrapNo.toUpperCase() === candidateCertNo.toUpperCase()) &&
    attempts < 10000
  ) {
    randomScrapNum = crypto.randomInt(100000, 1000000);
    candidateScrapNo = `${scrapPrefix}${randomScrapNum}`;
    attempts++;
  }

  return {
    candidateCertNo,
    candidateScrapNo,
    nextCertSeq: Math.max(maxCertSeq + 1, 1000842),
    nextScrapSeq: Math.max(maxScrapSeq + 1, 273682),
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
 * Returns ONLY the 5 most recently created certificates sorted by creation timestamp descending.
 * Used for the restricted Certificate Maker view so older records and total count are never exposed.
 */
export async function getRecentCertificatesForMakerAsync(limit = 5): Promise<Certificate[]> {
  const certs = await getDatabaseCertificatesAsync();
  const sorted = [...certs].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.issuedAt || 0).getTime() || 0;
    const timeB = new Date(b.createdAt || b.issuedAt || 0).getTime() || 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
  return sorted.slice(0, Math.max(1, Math.min(limit, 5)));
}

// ============================================================================
// MAIN CORE ADMIN CREDENTIAL PERSISTENCE (FIRESTORE + SERVER MIRROR)
// ============================================================================
export interface CoreAdminCredentialsDoc {
  passwordHash: string;
  sessionVersion: number;
  updatedAt: string;
}

let inMemoryCoreAdminCreds: CoreAdminCredentialsDoc | null = null;

export async function getCoreAdminCredentialsServer(forceRefresh = false): Promise<CoreAdminCredentialsDoc | null> {
  let localMirrorDoc: CoreAdminCredentialsDoc | null = null;
  try {
    if (fs.existsSync(CORE_ADMIN_CREDS_FILE)) {
      const raw = fs.readFileSync(CORE_ADMIN_CREDS_FILE, 'utf-8');
      if (raw && raw.trim()) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.passwordHash === 'string' && parsed.passwordHash.startsWith('scrypt$')) {
          localMirrorDoc = {
            passwordHash: parsed.passwordHash,
            sessionVersion: Number(parsed.sessionVersion) || 1,
            updatedAt: String(parsed.updatedAt || new Date().toISOString()),
          };
        }
      }
    }
  } catch {}

  if (!forceRefresh && inMemoryCoreAdminCreds) {
    if (localMirrorDoc && localMirrorDoc.sessionVersion > inMemoryCoreAdminCreds.sessionVersion) {
      inMemoryCoreAdminCreds = localMirrorDoc;
    }
    return inMemoryCoreAdminCreds;
  }

  if (Date.now() < firestoreQuotaCooldownUntil && localMirrorDoc) {
    inMemoryCoreAdminCreds = localMirrorDoc;
    return inMemoryCoreAdminCreds;
  }

  // 1. Try reading from Firestore `/settings/core_admin_credentials`
  const adminDb = getFirebaseAdminDb();
  if (adminDb) {
    try {
      const snap = await adminDb.collection('settings').doc('core_admin_credentials').get();
      if (snap.exists) {
        const data = snap.data();
        if (data && typeof data.passwordHash === 'string' && data.passwordHash.startsWith('scrypt$')) {
          const fsDoc: CoreAdminCredentialsDoc = {
            passwordHash: data.passwordHash,
            sessionVersion: Number(data.sessionVersion) || 1,
            updatedAt: String(data.updatedAt || new Date().toISOString()),
          };
          if (localMirrorDoc && localMirrorDoc.sessionVersion > fsDoc.sessionVersion) {
            inMemoryCoreAdminCreds = localMirrorDoc;
            return inMemoryCoreAdminCreds;
          }
          inMemoryCoreAdminCreds = fsDoc;
          return inMemoryCoreAdminCreds;
        }
      }
    } catch {}
  }

  // 2. Try reading via Firestore REST API (`/settings/core_admin_credentials`)
  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);
  if (token || cfg.apiKey) {
    try {
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/settings/core_admin_credentials${keyParam}`;
      const res = await fetch(docUrl, { headers: authHeaders });
      if (res.status === 429) {
        firestoreQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
      } else if (res.ok) {
        const docJson: any = await res.json();
        const parsed = fromFirestoreDocument(docJson);
        if (parsed && typeof parsed.passwordHash === 'string' && parsed.passwordHash.startsWith('scrypt$')) {
          const fsDoc: CoreAdminCredentialsDoc = {
            passwordHash: parsed.passwordHash,
            sessionVersion: Number(parsed.sessionVersion) || 1,
            updatedAt: String(parsed.updatedAt || new Date().toISOString()),
          };
          if (localMirrorDoc && localMirrorDoc.sessionVersion > fsDoc.sessionVersion) {
            inMemoryCoreAdminCreds = localMirrorDoc;
            return inMemoryCoreAdminCreds;
          }
          inMemoryCoreAdminCreds = fsDoc;
          return inMemoryCoreAdminCreds;
        }
      }
    } catch {}
  }

  // 3. Fallback to local server-only file (`data/core_admin_credentials.json`)
  if (localMirrorDoc) {
    inMemoryCoreAdminCreds = localMirrorDoc;
    return inMemoryCoreAdminCreds;
  }

  return null;
}

export async function saveCoreAdminCredentialsServer(doc: CoreAdminCredentialsDoc): Promise<void> {
  inMemoryCoreAdminCreds = doc;
  const settings = getDatabaseSettings();

  // Save to local server-only mirror
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CORE_ADMIN_CREDS_FILE, JSON.stringify(doc, null, 2), 'utf-8');
  } catch {}

  // Save to Firestore `/settings/core_admin_credentials` (includes required settings schema fields for security rules)
  const payloadForFirestore = {
    passwordHash: doc.passwordHash,
    sessionVersion: doc.sessionVersion,
    updatedAt: doc.updatedAt,
    certificatePrefix: settings.certificatePrefix || 'PS/26/R',
    certificateNextSeq: Math.max(1000, Number(settings.certificateNextSeq) || 1000842),
    scrappingPrefix: settings.scrappingPrefix || 'REG-C',
    scrappingNextSeq: Math.max(1000, Number(settings.scrappingNextSeq) || 273682),
    serverWriteToken: SERVER_WRITE_TOKEN,
  };

  const adminDb = getFirebaseAdminDb();
  if (adminDb) {
    try {
      await adminDb.collection('settings').doc('core_admin_credentials').set(payloadForFirestore, { merge: true });
      return;
    } catch (err: any) {
      console.warn('[Firestore Admin Core Creds Save Notice]:', err.message);
    }
  }

  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);
  if (token || cfg.apiKey) {
    try {
      const dbRoot = `projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const commitUrl = `https://firestore.googleapis.com/v1/${dbRoot}:commit${keyParam}`;
      await fetch(commitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${dbRoot}/settings/core_admin_credentials`,
                fields: toFirestoreFields(payloadForFirestore),
              },
            },
          ],
        }),
      });
    } catch (err: any) {
      console.warn('[Firestore REST Core Creds Save Notice]:', err.message);
    }
  }
}

/**
 * Verifies the Main Core Admin password against Firestore hashed credentials.
 * If no credentials exist in Firestore yet, initializes the salted scrypt hash
 * using CORE_ADMIN_INITIAL_PASSWORD on first login. Once initialized or changed,
 * ONLY the current Firestore passwordHash is accepted (old passwords never work).
 */
export async function authenticateCoreAdminPassword(providedPassword?: string): Promise<{
  authenticated: boolean;
  sessionVersion: number;
  token?: string;
}> {
  if (!providedPassword || typeof providedPassword !== 'string') {
    return { authenticated: false, sessionVersion: 1 };
  }
  const clean = providedPassword.trim();
  if (!clean) {
    return { authenticated: false, sessionVersion: 1 };
  }

  const stored = await getCoreAdminCredentialsServer(true);
  if (stored && stored.passwordHash) {
    const matched = verifyCoreAdminHash(clean, stored.passwordHash);
    if (!matched) {
      return { authenticated: false, sessionVersion: stored.sessionVersion };
    }
    const token = createCoreAdminToken(stored.sessionVersion);
    return { authenticated: true, sessionVersion: stored.sessionVersion, token };
  }

  // First-time initialization from server-side initial Core Admin password
  if (matchesInitialCoreAdminPassword(clean)) {
    const initialDoc: CoreAdminCredentialsDoc = {
      passwordHash: hashCoreAdminPassword(clean),
      sessionVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    await saveCoreAdminCredentialsServer(initialDoc);
    const token = createCoreAdminToken(1);
    return { authenticated: true, sessionVersion: 1, token };
  }

  return { authenticated: false, sessionVersion: 1 };
}

/**
 * Changes the Main Core Admin password in Firestore:
 * - Verifies oldPassword against current stored hash (or initial password if not yet initialized)
 * - Enforces newPassword === confirmNewPassword and minimum 12 characters
 * - Stores new salted scrypt hash in Firestore
 * - Increments sessionVersion to immediately invalidate all previous Core Admin sessions
 */
export async function changeCoreAdminPasswordServer(
  oldPassword?: string,
  newPassword?: string,
  confirmNewPassword?: string
): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  sessionVersion?: number;
}> {
  const cleanOld = String(oldPassword ?? '').trim();
  const cleanNew = String(newPassword ?? '').trim();
  const cleanConfirm = String(confirmNewPassword ?? '').trim();

  if (!cleanOld || !cleanNew || !cleanConfirm) {
    return {
      success: false,
      statusCode: 400,
      message: 'Old Password, New Password, and Confirm New Password are all required.',
    };
  }

  if (cleanNew !== cleanConfirm) {
    return {
      success: false,
      statusCode: 400,
      message: 'New password and Confirm New Password do not match.',
    };
  }

  if (cleanNew.length < 12) {
    return {
      success: false,
      statusCode: 400,
      message: 'New password must be at least 12 characters long.',
    };
  }

  const authCheck = await authenticateCoreAdminPassword(cleanOld);
  if (!authCheck.authenticated) {
    return {
      success: false,
      statusCode: 401,
      message: 'Incorrect Old Password. Password change rejected.',
    };
  }

  const nextSessionVersion = (authCheck.sessionVersion || 1) + 1;
  const newDoc: CoreAdminCredentialsDoc = {
    passwordHash: hashCoreAdminPassword(cleanNew),
    sessionVersion: nextSessionVersion,
    updatedAt: new Date().toISOString(),
  };

  await saveCoreAdminCredentialsServer(newDoc);

  return {
    success: true,
    statusCode: 200,
    message: 'Main Core Admin password updated successfully. Previous Core Admin sessions have been invalidated.',
    sessionVersion: nextSessionVersion,
  };
}

let lastMakerCredsSyncAt = 0;

/**
 * Synchronizes Certificate Maker credentials (`adminPasswordHash` and `makerSessionVersion`)
 * from Firestore `/settings/maker_credentials` into local/in-memory settings so that
 * Vercel Serverless instances always validate against the latest rotated Maker session version.
 */
export async function getMakerCredentialsServer(forceRefresh = false): Promise<SystemSettings> {
  const localSettings: any = getDatabaseSettings();
  const now = Date.now();
  if (!forceRefresh && lastMakerCredsSyncAt > 0 && now - lastMakerCredsSyncAt < 30000) {
    return localSettings;
  }
  if (now < firestoreQuotaCooldownUntil) {
    return localSettings;
  }

  // 1. Try Firebase Admin SDK
  const adminDb = getFirebaseAdminDb();
  if (adminDb) {
    try {
      const snap = await adminDb.collection('settings').doc('maker_credentials').get();
      if (snap.exists) {
        const data = snap.data();
        const fsHash = typeof data?.passwordHash === 'string' ? data.passwordHash : data?.adminPasswordHash;
        const fsVer = Number(data?.makerSessionVersion) || 1;
        const localVer = Number(localSettings.makerSessionVersion) || 1;
        lastMakerCredsSyncAt = now;
        if (fsHash && fsHash.startsWith('scrypt$') && fsVer >= localVer) {
          const merged: any = {
            ...localSettings,
            adminUsername: data?.adminUsername || localSettings.adminUsername || 'pscrappers',
            adminPasswordHash: fsHash,
            makerSessionVersion: fsVer,
          };
          inMemorySettings = merged;
          setCachedMakerSessionVersion(fsVer);
          return merged;
        }
        return localSettings;
      }
    } catch {}
  }

  // 2. Try Firestore REST API (`/settings/maker_credentials`)
  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);
  if (token || cfg.apiKey) {
    try {
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/settings/maker_credentials${keyParam}`;
      const res = await fetch(docUrl, { headers: authHeaders });
      if (res.status === 429) {
        firestoreQuotaCooldownUntil = Date.now() + 15 * 60 * 1000;
      } else if (res.ok) {
        const docJson: any = await res.json();
        const parsed = fromFirestoreDocument(docJson);
        const fsHash = typeof parsed?.passwordHash === 'string' ? parsed.passwordHash : parsed?.adminPasswordHash;
        const fsVer = Number(parsed?.makerSessionVersion) || 1;
        const localVer = Number(localSettings.makerSessionVersion) || 1;
        lastMakerCredsSyncAt = now;
        if (fsHash && fsHash.startsWith('scrypt$') && fsVer >= localVer) {
          const merged: any = {
            ...localSettings,
            adminUsername: parsed?.adminUsername || localSettings.adminUsername || 'pscrappers',
            adminPasswordHash: fsHash,
            makerSessionVersion: fsVer,
          };
          inMemorySettings = merged;
          setCachedMakerSessionVersion(fsVer);
          return merged;
        }
      }
    } catch {}
  }

  return localSettings;
}

/**
 * Rotates the Certificate Maker password securely (restricted to MAIN_CORE_ADMIN):
 * - Verifies current Maker password
 * - Stores new salted scrypt hash in settings and Firestore `/settings/maker_credentials`
 * - Increments makerSessionVersion so old Maker tokens and old Maker passwords immediately stop working
 * - Preserves 100% of certificates untouched
 */
export async function changeMakerPasswordServer(
  oldPassword?: string,
  newPassword?: string,
  confirmNewPassword?: string
): Promise<{
  success: boolean;
  statusCode: number;
  message: string;
  makerSessionVersion?: number;
}> {
  const cleanOld = String(oldPassword ?? '').trim();
  const cleanNew = String(newPassword ?? '').trim();
  const cleanConfirm = String(confirmNewPassword ?? '').trim();

  if (!cleanOld || !cleanNew || !cleanConfirm) {
    return {
      success: false,
      statusCode: 400,
      message: 'Current Maker Password, New Password, and Confirm New Password are all required.',
    };
  }

  if (cleanNew !== cleanConfirm) {
    return {
      success: false,
      statusCode: 400,
      message: 'New Maker password and Confirm New Password do not match.',
    };
  }

  if (cleanNew.length < 7) {
    return {
      success: false,
      statusCode: 400,
      message: 'New Maker password must be at least 7 characters long.',
    };
  }

  const currentSettings: any = await getMakerCredentialsServer(true);
  const validOld = verifyAdminCredentials(currentSettings.adminUsername || 'pscrappers', cleanOld, currentSettings);
  if (!validOld) {
    return {
      success: false,
      statusCode: 401,
      message: 'Incorrect current Certificate Maker password. Rotation rejected.',
    };
  }

  const nextMakerSessionVersion = (Number(currentSettings.makerSessionVersion) || 1) + 1;
  const newHash = hashCoreAdminPassword(cleanNew);
  const now = new Date().toISOString();

  const updatedSettings: any = {
    ...currentSettings,
    adminPasswordHash: newHash,
    makerSessionVersion: nextMakerSessionVersion,
    updatedAt: now,
  };
  saveDatabaseSettings(updatedSettings);

  // Persist rotated Maker credentials to Firestore `/settings/maker_credentials`
  const cfg = getFirebaseServerConfig();
  const token = await getFirestoreAccessToken().catch(() => null);
  if (token || cfg.apiKey) {
    try {
      const dbRoot = `projects/${cfg.projectId}/databases/${cfg.databaseId}/documents`;
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const keyParam = !token && cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}` : '';
      const commitUrl = `https://firestore.googleapis.com/v1/${dbRoot}:commit${keyParam}`;
      await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${dbRoot}/settings/maker_credentials`,
                fields: toFirestoreFields({
                  adminUsername: currentSettings.adminUsername || 'pscrappers',
                  passwordHash: newHash,
                  makerSessionVersion: nextMakerSessionVersion,
                  updatedAt: now,
                  certificatePrefix: currentSettings.certificatePrefix || 'PS/26/R',
                  certificateNextSeq: Math.max(1000, Number(currentSettings.certificateNextSeq) || 1000842),
                  scrappingPrefix: currentSettings.scrappingPrefix || 'REG-C',
                  scrappingNextSeq: Math.max(1000, Number(currentSettings.scrappingNextSeq) || 273682),
                  serverWriteToken: SERVER_WRITE_TOKEN,
                }),
              },
            },
          ],
        }),
      });
    } catch {}
  }

  return {
    success: true,
    statusCode: 200,
    message: 'Certificate Maker password rotated successfully. Previous Maker sessions have been invalidated.',
    makerSessionVersion: nextMakerSessionVersion,
  };
}

/**
 * Checks whether an incoming HTTP request has an active, non-invalidated MAIN_CORE_ADMIN session.
 * Normal CERTIFICATE_MAKER tokens (`adm....`) NEVER satisfy this check.
 */
export async function isRequestCoreAdminAsync(req: any): Promise<boolean> {
  const tokens = extractCoreAdminTokensFromReq(req);
  if (tokens.length === 0) return false;

  const stored = await getCoreAdminCredentialsServer(false);
  const expectedVersion = stored?.sessionVersion || 1;

  for (const token of tokens) {
    if (verifyCoreAdminToken(token, expectedVersion)) {
      return true;
    }
  }
  return false;
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

    // 1. If Firebase Firestore Server Admin is configured, commit inside an atomic Firestore transaction with collision retry
    if (isFirestoreServerConfigured()) {
      let committed = false;
      let commitAttempts = 0;
      while (!committed && commitAttempts < 5) {
        try {
          await commitCertificateToFirestoreServer(
            newCertificate,
            Math.max(settings.certificateNextSeq || 1000842, seqInfo.nextCertSeq + 1),
            Math.max(settings.scrappingNextSeq || 273682, seqInfo.nextScrapSeq + 1)
          );
          committed = true;
        } catch (txErr: any) {
          commitAttempts++;
          const msg = String(txErr?.message || '');
          const isCollision =
            msg.includes('already reserved') ||
            msg.includes('ALREADY_EXISTS') ||
            msg.includes('409') ||
            msg.includes('exists');
          if (isCollision && commitAttempts < 5) {
            const freshCerts = (await fetchCertificatesFromFirestoreServer(true).catch(() => certs)) || certs;
            const retryAlloc = getNextSequentialNumbers(freshCerts, reserved, settings);
            candidateCertNo = retryAlloc.candidateCertNo;
            candidateScrapNo = retryAlloc.candidateScrapNo;
            newCertificate.certificateNumber = candidateCertNo;
            newCertificate.scrappingRegistrationNumber = candidateScrapNo;
            newCertificate.verificationUrl = `/verify?certificateNumber=${encodeURIComponent(candidateCertNo)}&token=${newCertificate.qrToken}`;
            newCertificate.dataHash = computeCanonicalHash(newCertificate);
            continue;
          }
          throw txErr;
        }
      }
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

/**
 * Persistent atomic idempotency check across serverless instances:
 * Checks Firestore collection 'idempotency_keys' (falling back gracefully if offline)
 */
export async function getPersistentIdempotencyAsync(key: string): Promise<Certificate | null> {
  if (!key || typeof key !== 'string') return null;
  const cleanKey = key.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  if (!cleanKey) return null;

  try {
    const adminDb = getFirebaseAdminDb();
    if (adminDb) {
      const snap = await adminDb.collection('idempotency_keys').doc(cleanKey).get();
      if (snap.exists) {
        const data = snap.data();
        if (data && data.certificate) return data.certificate as Certificate;
      }
    } else {
      const cfg = getFirebaseServerConfig();
      const token = await getFirestoreAccessToken().catch(() => null);
      if (token) {
        const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/idempotency_keys/${cleanKey}`;
        const res = await fetch(docUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const docData = await res.json();
          const parsed = fromFirestoreDocument(docData);
          if (parsed && parsed.certificate) {
            return typeof parsed.certificate === 'string' ? JSON.parse(parsed.certificate) : parsed.certificate;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Idempotency] Firestore lookup warning, falling back to local store:', err);
  }
  return null;
}

/**
 * Persists an idempotency key and resulting certificate to Firestore atomically
 */
export async function savePersistentIdempotencyAsync(key: string, cert: Certificate): Promise<void> {
  if (!key || !cert) return;
  const cleanKey = key.trim().replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  if (!cleanKey) return;

  try {
    const adminDb = getFirebaseAdminDb();
    const payload = {
      idempotencyKey: cleanKey,
      certificateId: cert.id,
      certificateNumber: cert.certificateNumber,
      certificate: cert,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    if (adminDb) {
      await adminDb.collection('idempotency_keys').doc(cleanKey).set(payload);
    } else {
      const cfg = getFirebaseServerConfig();
      const token = await getFirestoreAccessToken().catch(() => null);
      if (token) {
        const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/idempotency_keys/${cleanKey}`;
        await fetch(docUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: toFirestoreFields(payload),
          }),
        });
      }
    }
  } catch (err) {
    console.warn('[Idempotency] Firestore persist warning:', err);
  }
}

