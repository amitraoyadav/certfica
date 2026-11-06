import crypto from 'crypto';

function cleanEnvValue(val: string | undefined, fallback = ''): string {
  if (!val) return fallback;
  const trimmed = val.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed || trimmed.startsWith('REPLACE_WITH_')) return fallback;
  return trimmed;
}

export const SESSION_SECRET = cleanEnvValue(
  process.env.SESSION_SECRET || process.env.MAIN_ADMIN_PASSWORD,
  'ps_hmac_v3_signing_key_2026_parivahan'
);

// Precomputed SHA-256 digests for initial fallback credentials when environment variables are unset
const INITIAL_CORE_ADMIN_SHA256 = '9beb173a0e14226236f519da8519cc069043c0bbf224349ab1c522ea44131526';
const INITIAL_MAKER_PASS_SHA256 = '00596dd462240b8de219a287d7244c9a839f002fba7eb4fb8795282cfd205c3d';
const INITIAL_MAKER_PASS_LOWER_SHA256 = '34ea9cd8326e854302c430bf1613bafed98fca0e7f274a1ed2e3212997eeefe2';
const INITIAL_DELETE_PASS_SHA256 = 'e6fe636511f4e52b3d29fe549355fb71e76fa0ec3d394d3dd5b15303dfbf53c0';
const INITIAL_DELETE_PASS_LOWER_SHA256 = '006657998771eb1ef75d0a26f8824af99da8bf4f7261d3a4d896708286a618eb';
const INITIAL_PROTECTED_PASS_SHA256 = 'c226cdcdca90c468a2481cb0fa502cafa16ace83391ae545afebfd1c93832023';
const INITIAL_PROTECTED_PASS_LOWER_SHA256 = '2e260ab9e1f8afdacf61358325703c9bac61766e5bee84e0a7ccebbe4dbcdc24';

export const CORE_ADMIN_INITIAL_PASSWORD = cleanEnvValue(
  process.env.CORE_ADMIN_INITIAL_PASSWORD || process.env.MAIN_ADMIN_PASSWORD,
  ''
);

export const MAIN_ADMIN_PASSWORD = CORE_ADMIN_INITIAL_PASSWORD;
export const ADMIN_USERNAME = cleanEnvValue(process.env.ADMIN_USERNAME, 'pscrappers');
export const ADMIN_PASSWORD = cleanEnvValue(process.env.ADMIN_PASSWORD, '');
export const ADMIN_DELETE_PASSWORD = cleanEnvValue(process.env.ADMIN_DELETE_PASSWORD, '');
export const ADMIN_PROTECTED_PASSWORD = cleanEnvValue(
  process.env.ADMIN_PROTECTED_PASSWORD || process.env.ADMIN_DELETE_PASSWORD,
  ''
);

export const ADMIN_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAIN_ADMIN_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours
export const LEGACY_ADMIN_SESSION_TOKEN = 'ps_admin_session_token_secure_2026';

export type UserRole = 'CERTIFICATE_MAKER' | 'MAIN_CORE_ADMIN';

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Strong salted scrypt password hashing for credentials stored in Firestore
 */
export function hashCoreAdminPassword(password: string): string {
  const clean = String(password).trim();
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt$${salt}$${derivedKey}`;
}

/**
 * Verifies a plaintext password against a stored salted scrypt hash
 */
export function verifyCoreAdminHash(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  const clean = password.trim();
  if (!clean) return false;

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, expectedHex] = parts;
    if (!salt || !expectedHex) return false;
    try {
      const derivedHex = crypto.scryptSync(clean, salt, 64).toString('hex');
      return safeCompare(derivedHex, expectedHex);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Verifies whether a candidate password matches the initial Core Admin password
 * (from environment variable if configured, or initial SHA-256 digest fallback).
 */
export function matchesInitialCoreAdminPassword(candidate: string): boolean {
  const clean = String(candidate || '').trim();
  if (!clean) return false;
  if (CORE_ADMIN_INITIAL_PASSWORD) {
    return safeCompare(clean, CORE_ADMIN_INITIAL_PASSWORD);
  }
  const sha = crypto.createHash('sha256').update(clean).digest('hex');
  return safeCompare(sha, INITIAL_CORE_ADMIN_SHA256);
}

/**
 * Validates normal Certificate Maker login username and password on the server.
 * Supports rotation via Firestore/settings salted scrypt hash or ADMIN_PASSWORD environment variable.
 * Normal login grants ONLY CERTIFICATE_MAKER permissions.
 */
export function verifyAdminCredentials(
  username?: string,
  password?: string,
  customSettings?: {
    adminUsername?: string;
    adminPasswordHash?: string;
    makerSessionVersion?: number;
  }
): boolean {
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return false;
  }
  const cleanUser = username.trim().replace(/^["']|["']$/g, '').trim().toLowerCase();
  const cleanPass = password.trim().replace(/^["']|["']$/g, '').trim();
  if (!cleanUser || !cleanPass) return false;

  const allowedUsers = [
    ADMIN_USERNAME.toLowerCase(),
    'pscrappers',
    'admin',
    'administrator',
    'parivahanscrappers',
    'parivahan-scrappers',
    'raoamityadavak123@gmail.com',
    (customSettings?.adminUsername || '').toLowerCase().trim(),
  ].filter(Boolean);

  const userMatched = allowedUsers.some((u) => safeCompare(cleanUser, u));
  if (!userMatched) return false;

  const storedHash = (customSettings?.adminPasswordHash || '').trim();
  const makerVer = Number(customSettings?.makerSessionVersion) || 1;

  // 1. If Maker password has been explicitly rotated in Firestore/settings (makerSessionVersion > 1),
  // enforce ONLY the rotated scrypt hash so the old password is immediately invalidated.
  if (storedHash.startsWith('scrypt$') && makerVer > 1) {
    return verifyCoreAdminHash(cleanPass, storedHash);
  }

  // 2. If ADMIN_PASSWORD environment variable is explicitly set on the server, enforce it (or stored scrypt hash).
  if (ADMIN_PASSWORD) {
    if (safeCompare(cleanPass, ADMIN_PASSWORD) || safeCompare(cleanPass.toLowerCase(), ADMIN_PASSWORD.toLowerCase())) {
      return true;
    }
    if (storedHash.startsWith('scrypt$') && verifyCoreAdminHash(cleanPass, storedHash)) {
      return true;
    }
    return false;
  }

  // 3. Verify against stored scrypt hash if present
  if (storedHash.startsWith('scrypt$') && verifyCoreAdminHash(cleanPass, storedHash)) {
    return true;
  }

  // 4. Verify against precomputed SHA-256 digests of initial Maker credentials
  const passSha256 = crypto.createHash('sha256').update(cleanPass).digest('hex');
  return (
    safeCompare(passSha256, INITIAL_MAKER_PASS_SHA256) ||
    safeCompare(passSha256, INITIAL_MAKER_PASS_LOWER_SHA256) ||
    safeCompare(passSha256, INITIAL_PROTECTED_PASS_SHA256) ||
    safeCompare(passSha256, INITIAL_PROTECTED_PASS_LOWER_SHA256)
  );
}

/**
 * Creates a cryptographically signed HMAC session token for a Certificate Maker
 */
export function createAdminSessionToken(username = 'pscrappers', sessionVersion = 1): string {
  const timestamp = Date.now();
  const ver = Math.max(1, Number(sessionVersion) || 1);
  const userLower = username.toLowerCase();
  if (ver > 1) {
    const payload = `admin:v${ver}:${userLower}:${timestamp}`;
    const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    return `adm.v${ver}.${Buffer.from(userLower).toString('base64url')}.${timestamp}.${sig}`;
  }
  const payload = `admin:${userLower}:${timestamp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `adm.${Buffer.from(userLower).toString('base64url')}.${timestamp}.${sig}`;
}

/**
 * Validates a Certificate Maker session token against expected sessionVersion
 */
export function isAdminTokenValid(token?: string, expectedSessionVersion = 1): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean) return false;

  if (clean.startsWith('adm.v')) {
    const parts = clean.split('.');
    if (parts.length === 5) {
      try {
        const ver = parseInt(parts[1].replace(/^v/, ''), 10);
        const username = Buffer.from(parts[2], 'base64url').toString('utf-8');
        const timestamp = parseInt(parts[3], 10);
        const providedSig = parts[4];
        if (isNaN(ver) || isNaN(timestamp)) return false;
        if (ver !== expectedSessionVersion) return false;
        if (Date.now() - timestamp > ADMIN_SESSION_TIMEOUT_MS) return false;
        const payload = `admin:v${ver}:${username}:${timestamp}`;
        const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
        return safeCompare(providedSig, expectedSig);
      } catch {
        return false;
      }
    }
    return false;
  }

  if (clean.startsWith('adm.')) {
    if (expectedSessionVersion > 1) return false;
    const parts = clean.split('.');
    if (parts.length === 4) {
      try {
        const username = Buffer.from(parts[1], 'base64url').toString('utf-8');
        const timestamp = parseInt(parts[2], 10);
        const providedSig = parts[3];
        if (isNaN(timestamp)) return false;
        if (Date.now() - timestamp > ADMIN_SESSION_TIMEOUT_MS) return false;
        const payload = `admin:${username}:${timestamp}`;
        const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
        return safeCompare(providedSig, expectedSig);
      } catch {
        return false;
      }
    }
    return false;
  }

  if (expectedSessionVersion === 1 && safeCompare(clean, LEGACY_ADMIN_SESSION_TOKEN)) {
    return true;
  }

  return false;
}

/**
 * Creates a versioned HMAC session token for Main Core Admin (MAIN_CORE_ADMIN role).
 * Whenever the Core Admin password is changed, sessionVersion increments in Firestore,
 * immediately invalidating all previously issued Core Admin tokens.
 */
export function createCoreAdminToken(sessionVersion = 1): string {
  const timestamp = Date.now();
  const ver = Math.max(1, Number(sessionVersion) || 1);
  const payload = `core-admin:v${ver}:${timestamp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `ca.${ver}.${timestamp}.${sig}`;
}

/**
 * Verifies a Main Core Admin token against the current expected sessionVersion
 */
export function verifyCoreAdminToken(token: string | undefined, expectedSessionVersion = 1): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean.startsWith('ca.')) return false;

  const parts = clean.split('.');
  if (parts.length !== 4) return false;

  const ver = parseInt(parts[1], 10);
  const timestamp = parseInt(parts[2], 10);
  const providedSig = parts[3];

  if (isNaN(ver) || isNaN(timestamp)) return false;
  if (ver !== expectedSessionVersion) return false;
  if (Date.now() - timestamp > MAIN_ADMIN_TIMEOUT_MS) return false;

  const payload = `core-admin:v${ver}:${timestamp}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return safeCompare(providedSig, expectedSig);
}

/**
 * Parses cookies from a raw Cookie header string
 */
export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) {
      const val = parts.join('=').trim();
      try {
        list[key] = decodeURIComponent(val);
      } catch {
        list[key] = val;
      }
    }
  });
  return list;
}

/**
 * Extracts Core Admin candidate tokens from headers, cookies, or query
 */
export function extractCoreAdminTokensFromReq(req: any): string[] {
  if (!req) return [];
  const headerCore = req.headers?.['x-main-admin-token'] || req.headers?.['x-core-admin-token'];
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const queryCore = req.query?.mainAdminToken || req.query?.coreAdminToken;
  const cookies = parseCookies(req.headers?.cookie);
  const cookieCore = cookies['ps_core_admin_session'] || cookies['ps_main_admin_session'];

  return [
    typeof headerCore === 'string' ? headerCore.trim() : '',
    typeof cookieCore === 'string' ? cookieCore.trim() : '',
    typeof queryCore === 'string' ? queryCore.trim() : '',
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '',
  ].filter((t) => Boolean(t && t.startsWith('ca.')));
}

/**
 * Extracts and verifies whether an incoming HTTP request is authenticated as at least a Certificate Maker
 */
export function isRequestAdmin(req: any, expectedMakerSessionVersion = 1): boolean {
  if (!req) return false;
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const headerToken = req.headers?.['x-admin-token'];
  const coreHeaderToken = req.headers?.['x-main-admin-token'] || req.headers?.['x-core-admin-token'];
  const queryToken = req.query?.token || req.query?.adminToken;
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies['ps_admin_session'];
  const coreCookieToken = cookies['ps_core_admin_session'] || cookies['ps_main_admin_session'];

  const candidates = [
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '',
    typeof headerToken === 'string' ? headerToken.trim() : '',
    typeof coreHeaderToken === 'string' ? coreHeaderToken.trim() : '',
    typeof cookieToken === 'string' ? cookieToken.trim() : '',
    typeof coreCookieToken === 'string' ? coreCookieToken.trim() : '',
    typeof queryToken === 'string' ? queryToken.trim() : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isAdminTokenValid(candidate, expectedMakerSessionVersion) || isMainAdminTokenValid(candidate)) {
      return true;
    }
  }
  return false;
}

/**
 * Builds a Set-Cookie header string for secure HttpOnly session cookies
 */
export function buildSessionCookie(name: string, value: string, maxAgeMs: number): string {
  const maxAgeSec = Math.floor(maxAgeMs / 1000);
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const securePart = isProd ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${securePart}`;
}

export function verifyMainAdminPassword(provided?: string): boolean {
  if (!provided || typeof provided !== 'string') return false;
  return matchesInitialCoreAdminPassword(provided);
}

export function verifyProtectedActionPassword(provided?: string): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const clean = provided.trim();
  if (!clean) return false;

  const envAllowed = [
    CORE_ADMIN_INITIAL_PASSWORD,
    MAIN_ADMIN_PASSWORD,
    ADMIN_DELETE_PASSWORD,
    ADMIN_PROTECTED_PASSWORD,
  ].filter(Boolean);

  if (envAllowed.some((p) => safeCompare(clean, p) || safeCompare(clean.toLowerCase(), p.toLowerCase()))) {
    return true;
  }

  const sha = crypto.createHash('sha256').update(clean).digest('hex');
  return (
    safeCompare(sha, INITIAL_CORE_ADMIN_SHA256) ||
    safeCompare(sha, INITIAL_DELETE_PASS_SHA256) ||
    safeCompare(sha, INITIAL_DELETE_PASS_LOWER_SHA256) ||
    safeCompare(sha, INITIAL_PROTECTED_PASS_SHA256) ||
    safeCompare(sha, INITIAL_PROTECTED_PASS_LOWER_SHA256)
  );
}

export function createMainAdminToken(sessionVersion = 1): string {
  return createCoreAdminToken(sessionVersion);
}

/**
 * Structural/HMAC check for Core Admin token (version check is enforced via isRequestCoreAdminAsync in _db.ts)
 */
export function isMainAdminTokenValid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean.startsWith('ca.')) return false;
  const parts = clean.split('.');
  if (parts.length !== 4) return false;
  const ver = parseInt(parts[1], 10);
  if (isNaN(ver) || ver < 1) return false;
  return verifyCoreAdminToken(clean, ver);
}
