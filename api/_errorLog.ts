import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface SystemErrorEntry {
  id: string;
  timestamp: string;
  category:
    | 'AUTH'
    | 'CERT_CREATE'
    | 'DB_WRITE'
    | 'PDF_GEN'
    | 'QR_VERIFY'
    | 'BACKUP'
    | 'DRIVE_SYNC'
    | 'API_ERROR'
    | 'FRONTEND_RENDER';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  route?: string;
  message: string;
  details?: Record<string, any>;
}

export interface HealthCheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  latencyMs: number;
  message: string;
  details?: Record<string, any>;
}

const MAX_ERROR_LOGS = 200;
const inMemoryErrorLogs: SystemErrorEntry[] = [];

const SENSITIVE_KEYS = new Set([
  'password',
  'oldpassword',
  'newpassword',
  'confirmnewpassword',
  'token',
  'adminpassword',
  'privatekey',
  'clientsecret',
  'apikey',
  'secret',
  'credential',
]);

/**
 * Recursively sanitize diagnostic objects to prevent recording passwords or tokens
 */
export function sanitizeLogDetails(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogDetails);

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase().replace(/[^a-z]/g, '');
    if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret')) {
      clean[k] = '[REDACTED_PROTECTED_SECRET]';
    } else if (typeof v === 'object' && v !== null) {
      clean[k] = sanitizeLogDetails(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Record a system event or error
 */
export function recordSystemError(
  category: SystemErrorEntry['category'],
  message: string,
  severity: SystemErrorEntry['severity'] = 'ERROR',
  route?: string,
  details?: Record<string, any>
): SystemErrorEntry {
  const entry: SystemErrorEntry = {
    id: `err_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    timestamp: new Date().toISOString(),
    category,
    severity,
    route,
    message: String(message || 'Unknown error'),
    details: details ? sanitizeLogDetails(details) : undefined,
  };

  inMemoryErrorLogs.unshift(entry);
  if (inMemoryErrorLogs.length > MAX_ERROR_LOGS) {
    inMemoryErrorLogs.pop();
  }

  // 1. Asynchronously persist to persistent Firestore collection system_errors (works on Vercel serverless)
  import('./_db.js')
    .then(async (dbMod) => {
      try {
        const adminDb = dbMod.getFirebaseAdminDb();
        if (adminDb) {
          await adminDb.collection('system_errors').doc(entry.id).set(entry);
        } else {
          const cfg = dbMod.getFirebaseServerConfig();
          const token = await dbMod.getFirestoreAccessToken().catch(() => null);
          if (token) {
            const docUrl = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.databaseId}/documents/system_errors/${entry.id}`;
            await fetch(docUrl, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                fields: dbMod.toFirestoreFields(entry),
              }),
            });
          }
        }
      } catch {}
    })
    .catch(() => {});

  // 2. Persist to local disk if storage is writable (development fallback)
  try {
    const errorFile = path.join(process.cwd(), 'data', 'error_logs.json');
    fs.writeFileSync(errorFile, JSON.stringify(inMemoryErrorLogs.slice(0, 100), null, 2), 'utf-8');
  } catch {}

  return entry;
}

/**
 * Get recent system errors
 */
export function getRecentSystemErrors(limit = 50): SystemErrorEntry[] {
  if (inMemoryErrorLogs.length === 0) {
    try {
      const errorFile = path.join(process.cwd(), 'data', 'error_logs.json');
      if (fs.existsSync(errorFile)) {
        const raw = fs.readFileSync(errorFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          inMemoryErrorLogs.push(...parsed.slice(0, MAX_ERROR_LOGS));
        }
      }
    } catch {}
  }
  return inMemoryErrorLogs.slice(0, limit);
}
