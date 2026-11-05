import type { Certificate } from '../types';
import { AUTHORITATIVE_PRESERVED_CERTIFICATES } from '../data/authoritativePreservedCertificates';

const VAULT_KEY = 'ps_local_vault_certs';
const WORKING_CACHE_KEY = 'ps_certificates_cache';
const SYNC_QUEUE_KEY = 'ps_pending_sync_queue';

/**
 * Normalizes an object into a valid Certificate structure
 */
export function normalizeCertificateObject(raw: any): Certificate | null {
  if (!raw || typeof raw !== 'object') return null;

  // Reject settings or user session objects or metadata objects
  if (
    raw.adminUsername ||
    raw.adminPasswordHash ||
    raw.website ||
    raw.signatoryTitle ||
    raw.role === 'administrator' ||
    raw.username ||
    raw.user
  ) {
    return null;
  }

  const certNo = String(
    raw.certificateNumber ||
      raw['Certificate Number'] ||
      raw.certNo ||
      raw.cert_no ||
      raw.certificate_no ||
      ''
  ).trim();

  const ownerName = String(
    raw.ownerName ||
      raw['Owner Name'] ||
      raw.owner ||
      raw.name ||
      raw.customerName ||
      ''
  ).trim();

  const vehicleNo = String(
    raw.vehicleRegistrationNumber ||
      raw['Vehicle Registration Number'] ||
      raw.rcNumber ||
      ''
  ).trim();

  // A genuine certificate MUST have a valid certificate number
  if (!certNo) return null;

  // Reject malformed placeholder strings
  if (
    certNo === 'PS/26/R' ||
    certNo === '[OBJECT OBJECT]' ||
    certNo.toLowerCase() === 'undefined' ||
    certNo.toLowerCase() === 'null' ||
    certNo === '-' ||
    certNo === 'NOT PROVIDED'
  ) {
    return null;
  }

  const safeCertNo = certNo.toUpperCase();
  const safeOwner = ownerName || 'Valued Customer';
  const qrToken = raw.qrToken || `tok_${Math.random().toString(36).slice(2, 12)}`;

  return {
    id: raw.id || `cert-vault-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    certificateNumber: safeCertNo,
    scrappingRegistrationNumber:
      String(raw.scrappingRegistrationNumber ||
      raw['Scrapping Registration Number'] ||
      raw.scrapNo ||
      'REG-C272829').toUpperCase(),
    ownerName: safeOwner,
    address: String(raw.address || raw.Address || 'Not Provided').trim(),
    idProofNumber: String(raw.idProofNumber || raw['ID Proof'] || 'Not Provided').trim(),
    vehicleRegistrationNumber: String(
      raw.vehicleRegistrationNumber ||
        raw['Vehicle Registration Number'] ||
        raw.rcNumber ||
        'Not Provided'
    ).trim(),
    chassisNumber: String(raw.chassisNumber || raw['Chassis Number'] || 'Not Provided').trim(),
    engineNumber: String(raw.engineNumber || raw['Engine Number'] || 'Not Provided').trim(),
    showFullChassisEngine: Boolean(raw.showFullChassisEngine),
    isLocked: true,
    lockedAt: raw.lockedAt || raw.createdAt || new Date().toISOString(),
    make: String(raw.make || raw.Make || raw.brand || 'Two Wheeler').trim(),
    model: String(raw.model || raw.Model || 'Standard').trim(),
    location: 'Delhi NCR',
    yearOfManufacture: String(raw.yearOfManufacture || raw.year || '2012').trim(),
    dateOfHandover: String(
      raw.dateOfHandover || raw.handoverDate || new Date().toISOString().split('T')[0]
    ).trim(),
    dateOfIssue: String(
      raw.dateOfIssue || raw.issueDate || new Date().toISOString().split('T')[0]
    ).trim(),
    qrToken,
    verificationUrl:
      raw.verificationUrl ||
      `/verify?certificateNumber=${encodeURIComponent(safeCertNo)}&token=${qrToken}`,
    status: raw.status === 'REVOKED' || raw.status === 'CANCELLED' ? raw.status : 'VALID',
    statusReason: raw.statusReason || undefined,
    companySnapshot: raw.companySnapshot || {
      companyName: 'PARIVAHAN SCRAPPERS',
      companySubtitle: 'A Unit OF Scrapping Yard Ltd.',
      address: 'B12, Dwarka, New Delhi.',
      phone: '8506925495',
      website: 'https://parivahan-scrappers.netlify.app/',
      signatoryTitle: 'Authorised Signatory',
    },
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

/**
 * Safely sets an item in localStorage with automatic QuotaExceededError recovery and pruning.
 * Guarantees zero crashes when browser storage reaches its 5MB capacity limit.
 */
export function safeSetLocalStorage(key: string, value: string): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    localStorage.setItem(key, value);
    return true;
  } catch (err: any) {
    const isQuota =
      err?.name === 'QuotaExceededError' ||
      err?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err?.code === 22 ||
      err?.code === 1014;

    if (isQuota) {
      console.warn('[Storage Quota Exceeded] Browser 5MB storage limit reached. Pruning non-critical cache keys to protect state...');
      try {
        // Remove redundant temporary cache keys to free up space
        const expendableKeys = [
          'ps_pending_sync_queue',
          'ps_temp_sync_logs',
          'ps_certificates_cache', // Vault is authoritative; cache is redundant
        ];
        expendableKeys.forEach((k) => {
          if (k !== key) {
            try {
              localStorage.removeItem(k);
            } catch {}
          }
        });

        // Retry saving after pruning
        localStorage.setItem(key, value);
        return true;
      } catch {
        console.warn('[Storage Quota Exceeded] Unable to persist key after cleanup. Skipping key to prevent crash:', key);
        return false;
      }
    }
    return false;
  }
}

/**
 * Permanently save a certificate to the local vault (never deleted on server fetch)
 */
export function saveToLocalVault(cert: Certificate): void {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    const vault: Certificate[] = raw ? JSON.parse(raw) : [];
    const index = vault.findIndex(
      (c) => c.certificateNumber.toUpperCase() === cert.certificateNumber.toUpperCase()
    );
    if (index >= 0) {
      vault[index] = { ...vault[index], ...cert };
    } else {
      vault.unshift(cert);
    }
    safeSetLocalStorage(VAULT_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn('Could not save certificate to browser storage:', err);
  }
}

/**
 * Loads cached certificates safely from local storage
 */
export function loadWorkingCache(): Certificate[] {
  try {
    const map = new Map<string, Certificate>();

    // Seed with authoritative preserved certificates (all 920)
    AUTHORITATIVE_PRESERVED_CERTIFICATES.forEach((c) => {
      if (c && c.certificateNumber) {
        map.set(c.certificateNumber.toUpperCase(), { ...c, isLocked: true });
      }
    });

    if (typeof window !== 'undefined') {
      const raw =
        localStorage.getItem(VAULT_KEY) ||
        localStorage.getItem(WORKING_CACHE_KEY) ||
        sessionStorage.getItem('ps_recent_5_certs');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((c) => {
            if (c && c.certificateNumber) {
              const key = c.certificateNumber.toUpperCase();
              const existing = map.get(key);
              map.set(key, { ...(existing || {}), ...c, isLocked: true });
            }
          });
        }
      }
    }
    return Array.from(map.values());
  } catch {}
  return [];
}

/**
 * Saves cached certificates safely to local storage
 */
export function saveWorkingCache(certs: Certificate[]): void {
  try {
    if (typeof window === 'undefined') return;
    const raw = localStorage.getItem(VAULT_KEY);
    const existingVault: Certificate[] = raw ? JSON.parse(raw) : [];
    const map = new Map<string, Certificate>();
    existingVault.forEach((c) => {
      if (c && c.certificateNumber) map.set(c.certificateNumber.toUpperCase(), c);
    });
    certs.forEach((c) => {
      if (c && c.certificateNumber) map.set(c.certificateNumber.toUpperCase(), { ...c, isLocked: true });
    });
    const merged = Array.from(map.values());
    safeSetLocalStorage(VAULT_KEY, JSON.stringify(merged));
  } catch {}
}

/**
 * Deep scan across all keys in localStorage and sessionStorage to recover any certificates
 */
export function scanAllStorageForCertificates(): Certificate[] {
  const discoveredMap = new Map<string, Certificate>();

  const scanStore = (store: Storage) => {
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;

        try {
          const val = store.getItem(key);
          if (!val || (!val.startsWith('[') && !val.startsWith('{'))) continue;

          const parsed = JSON.parse(val);

          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              const cert = normalizeCertificateObject(item);
              if (cert && cert.certificateNumber) {
                discoveredMap.set(cert.certificateNumber.toUpperCase(), cert);
              }
            }
          } else if (parsed && typeof parsed === 'object') {
            // Check if it is a single certificate
            const cert = normalizeCertificateObject(parsed);
            if (cert && cert.certificateNumber) {
              discoveredMap.set(cert.certificateNumber.toUpperCase(), cert);
            }
            // Or if it contains a list property
            const candidateLists = [
              parsed.certificates,
              parsed.data,
              parsed.records,
              parsed.items,
              parsed.allCertificates,
              parsed.allCerts,
              parsed.vault,
              parsed.certs,
              parsed.list,
              parsed.history,
              parsed.backup,
            ];
            for (const list of candidateLists) {
              if (Array.isArray(list)) {
                for (const item of list) {
                  const c = normalizeCertificateObject(item);
                  if (c && c.certificateNumber) {
                    discoveredMap.set(c.certificateNumber.toUpperCase(), c);
                  }
                }
              }
            }
          }
        } catch {
          // Ignore parse errors on arbitrary non-JSON values
        }
      }
    } catch (e) {
      console.warn('Store scan exception:', e);
    }
  };

  if (typeof window !== 'undefined') {
    if (window.localStorage) scanStore(window.localStorage);
    if (window.sessionStorage) scanStore(window.sessionStorage);
  }

  return Array.from(discoveredMap.values());
}

/**
 * Scans IndexedDB databases for any certificates that may have been saved by previous versions
 */
export async function scanIndexedDbForCertificates(): Promise<Certificate[]> {
  if (typeof window === 'undefined' || !window.indexedDB) return [];
  const discoveredMap = new Map<string, Certificate>();

  try {
    const dbs = (await window.indexedDB.databases?.()) || [];
    for (const dbInfo of dbs) {
      if (!dbInfo.name) continue;
      await new Promise<void>((resolve) => {
        try {
          const req = window.indexedDB.open(dbInfo.name!);
          req.onsuccess = () => {
            const db = req.result;
            const storeNames = Array.from(db.objectStoreNames);
            let storesPending = storeNames.length;
            if (storesPending === 0) {
              db.close();
              return resolve();
            }

            for (const storeName of storeNames) {
              try {
                const tx = db.transaction(storeName, 'readonly');
                const store = tx.objectStore(storeName);
                const getAllReq = store.getAll();
                getAllReq.onsuccess = () => {
                  const records = getAllReq.result || [];
                  for (const rec of records) {
                    if (Array.isArray(rec)) {
                      for (const sub of rec) {
                        const c = normalizeCertificateObject(sub);
                        if (c?.certificateNumber) discoveredMap.set(c.certificateNumber.toUpperCase(), c);
                      }
                    } else if (rec && typeof rec === 'object') {
                      const c = normalizeCertificateObject(rec);
                      if (c?.certificateNumber) discoveredMap.set(c.certificateNumber.toUpperCase(), c);
                    }
                  }
                  storesPending--;
                  if (storesPending <= 0) {
                    db.close();
                    resolve();
                  }
                };
                getAllReq.onerror = () => {
                  storesPending--;
                  if (storesPending <= 0) {
                    db.close();
                    resolve();
                  }
                };
              } catch {
                storesPending--;
                if (storesPending <= 0) {
                  db.close();
                  resolve();
                }
              }
            }
          };
          req.onerror = () => resolve();
        } catch {
          resolve();
        }
      });
    }
  } catch (err) {
    console.warn('IndexedDB scan warning:', err);
  }

  return Array.from(discoveredMap.values());
}

/**
 * Flexible smart matcher for finding a certificate in a local list
 */
export function findCertificateInList(
  query: string,
  certs: Certificate[]
): Certificate | undefined {
  if (!query || !certs || certs.length === 0) return undefined;

  let q = String(query).trim();
  try {
    q = decodeURIComponent(q).trim();
  } catch {}

  // If user pasted a verification URL
  if (q.includes('?') && (q.toLowerCase().includes('certificatenumber=') || q.toLowerCase().includes('cert='))) {
    try {
      const urlObj = new URL(q, 'https://dummy.local');
      const paramCert =
        urlObj.searchParams.get('certificateNumber') ||
        urlObj.searchParams.get('certNumber') ||
        urlObj.searchParams.get('cert') ||
        urlObj.searchParams.get('q');
      if (paramCert) q = paramCert.trim();
    } catch {}
  } else if (q.toUpperCase().includes('/VERIFY/')) {
    const parts = q.toUpperCase().split('/VERIFY/');
    if (parts[1]) {
      q = parts[1].split('?')[0].trim();
      try {
        q = decodeURIComponent(q).trim();
      } catch {}
    }
  }

  const upperQ = q.toUpperCase();
  const cleanQ = upperQ.replace(/[^A-Z0-9]/g, '');

  // 1. Direct exact match
  const exact = certs.find((c) => c.certificateNumber.trim().toUpperCase() === upperQ);
  if (exact) return exact;

  // 2. Normalized alphanumeric match
  const norm = certs.find(
    (c) => c.certificateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanQ
  );
  if (norm) return norm;

  // 3. Numeric Suffix match (e.g. "1010" matches "PS/26/R1010")
  if (cleanQ.length >= 3) {
    const suffix = certs.find((c) => {
      const cleanCert = c.certificateNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return cleanCert.endsWith(cleanQ);
    });
    if (suffix) return suffix;
  }

  // 4. Vehicle Registration Number match
  if (cleanQ.length >= 4) {
    const veh = certs.find((c) => {
      const cleanVeh = (c.vehicleRegistrationNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return cleanVeh === cleanQ || (cleanVeh.length > 4 && cleanVeh.includes(cleanQ));
    });
    if (veh) return veh;
  }

  // 5. Scrapping Registration Number match
  if (cleanQ.length >= 4) {
    const scrap = certs.find((c) => {
      const cleanScrap = (c.scrappingRegistrationNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      return cleanScrap === cleanQ || cleanScrap.endsWith(cleanQ);
    });
    if (scrap) return scrap;
  }

  // 6. Owner Name match (exact case-insensitive)
  const owner = certs.find((c) => c.ownerName.trim().toUpperCase() === upperQ);
  if (owner) return owner;

  return undefined;
}

/**
 * Searches local vault and cache for a certificate
 */
export function findInLocalVault(query: string): Certificate | undefined {
  const discovered = scanAllStorageForCertificates();
  return findCertificateInList(query, discovered);
}

/**
 * Synchronize local storage vault with backend database
 * Unifies records bidirectionally so any device or phone with new/missing certificates
 * immediately uploads them to the central server and receives the complete authoritative list.
 */
export async function syncStorageWithBackend(
  backendCerts: Certificate[],
  authHeaders: Record<string, string> = {}
): Promise<{
  syncedCount: number;
  allCertificates: Certificate[];
}> {
  // 0. Always fetch latest authoritative certificates from live server database first
  let liveServerList: Certificate[] = Array.isArray(backendCerts) && backendCerts.length > 0 ? [...backendCerts] : [];
  try {
    const liveRes = await fetch(`/api/certificates?_t=${Date.now()}`, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...authHeaders,
      },
    });
    if (liveRes.ok) {
      const data = await liveRes.json();
      if (Array.isArray(data) && data.length > 0) {
        liveServerList = data;
      }
    }
  } catch (liveFetchErr) {
    console.warn('Live server database fetch notice:', liveFetchErr);
  }

  // 1. Gather all local certificates from device storage & IndexedDB
  const localCerts = scanAllStorageForCertificates();
  const idbCerts = await scanIndexedDbForCertificates();
  const combinedLocalMap = new Map<string, Certificate>();
  [...AUTHORITATIVE_PRESERVED_CERTIFICATES, ...localCerts, ...idbCerts].forEach((c) => {
    if (c?.certificateNumber) combinedLocalMap.set(c.certificateNumber.toUpperCase(), c);
  });
  const allLocalDiscovered = Array.from(combinedLocalMap.values());

  // 2. Map existing backend certificate numbers
  const backendSet = new Set(
    liveServerList.map((c) => c.certificateNumber.trim().toUpperCase())
  );

  // 3. Identify certificates that exist locally on this device but NOT in backend
  const missingInBackend = allLocalDiscovered.filter(
    (lc) => !backendSet.has(lc.certificateNumber.trim().toUpperCase())
  );

  let updatedBackendList = [...liveServerList];
  let syncedCount = 0;

  // 4. If any are missing in backend (or to ensure full synchronization), sync to central server
  if (missingInBackend.length > 0) {
    try {
      const res = await fetch('/api/certificates/sync-all', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ certificates: missingInBackend }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.allCertificates && Array.isArray(data.allCertificates)) {
          updatedBackendList = data.allCertificates;
          syncedCount = data.importedCount || missingInBackend.length;
        }
      } else {
        // Fallback to bulk-import endpoint
        const fallbackRes = await fetch('/api/certificates/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ certificates: missingInBackend }),
        });
        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          if (fbData.allCertificates && Array.isArray(fbData.allCertificates)) {
            updatedBackendList = fbData.allCertificates;
          }
          syncedCount = missingInBackend.length;
        }
      }
    } catch (err) {
      console.warn('Backend sync request failed:', err);
    }
  }

  // 5. Update local storage working cache & vault with the authoritative deduplicated set
  const mergedMap = new Map<string, Certificate>();
  // Seed with preserved master copy
  AUTHORITATIVE_PRESERVED_CERTIFICATES.forEach((c) => {
    if (c?.certificateNumber) {
      mergedMap.set(c.certificateNumber.toUpperCase(), {
        ...c,
        isLocked: true,
        lockedAt: c.lockedAt || c.createdAt || new Date().toISOString(),
      });
    }
  });

  updatedBackendList.forEach((c) =>
    mergedMap.set(c.certificateNumber.toUpperCase(), {
      ...c,
      isLocked: true,
      lockedAt: c.lockedAt || c.createdAt || new Date().toISOString(),
    })
  );
  allLocalDiscovered.forEach((c) => {
    if (!mergedMap.has(c.certificateNumber.toUpperCase())) {
      mergedMap.set(c.certificateNumber.toUpperCase(), {
        ...c,
        isLocked: true,
        lockedAt: c.lockedAt || c.createdAt || new Date().toISOString(),
      });
    }
  });

  const finalMerged = Array.from(mergedMap.values());
  try {
    localStorage.setItem(WORKING_CACHE_KEY, JSON.stringify(finalMerged));
    localStorage.setItem(VAULT_KEY, JSON.stringify(finalMerged));
  } catch {}

  return {
    syncedCount,
    allCertificates: finalMerged,
  };
}
