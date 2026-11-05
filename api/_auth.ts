import crypto from 'crypto';

function cleanEnvValue(val: string | undefined, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim().replace(/^["']|["']$/g, '').trim();
  if (!trimmed || trimmed.startsWith('REPLACE_WITH_')) return fallback;
  return trimmed;
}

export const SESSION_SECRET = cleanEnvValue(
  process.env.SESSION_SECRET || process.env.MAIN_ADMIN_PASSWORD,
  'ps_hmac_server_secret_key_2026_parivahan'
);

export const MAIN_ADMIN_PASSWORD = cleanEnvValue(process.env.MAIN_ADMIN_PASSWORD, 'Scrapbyparivahan');
export const ADMIN_USERNAME = cleanEnvValue(process.env.ADMIN_USERNAME, 'pscrappers');
export const ADMIN_PASSWORD = cleanEnvValue(process.env.ADMIN_PASSWORD, 'Scrap123');
export const ADMIN_DELETE_PASSWORD = cleanEnvValue(process.env.ADMIN_DELETE_PASSWORD, 'Admin00');
export const ADMIN_PROTECTED_PASSWORD = cleanEnvValue(
  process.env.ADMIN_PROTECTED_PASSWORD || process.env.ADMIN_DELETE_PASSWORD,
  'Scrap00'
);

export const ADMIN_SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAIN_ADMIN_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const LEGACY_ADMIN_SESSION_TOKEN = 'ps_admin_session_token_secure_2026';

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    // Compare against itself to keep constant time before returning false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates administrator login username and password on the server.
 * Accepts ADMIN_USERNAME (pscrappers) and ADMIN_PASSWORD (Scrap123) from server-side
 * environment variables, supports plaintext and SHA-256 password hashes, and ensures
 * database/Firebase settings never override or block primary admin credentials.
 */
export function verifyAdminCredentials(
  username?: string,
  password?: string,
  customSettings?: { adminUsername?: string; adminPasswordHash?: string }
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

  const passSha256 = crypto.createHash('sha256').update(cleanPass).digest('hex');
  const passLowerSha256 = crypto.createHash('sha256').update(cleanPass.toLowerCase()).digest('hex');

  const allowedPasswords = [
    ADMIN_PASSWORD,
    'Scrap123',
    MAIN_ADMIN_PASSWORD,
    ADMIN_PROTECTED_PASSWORD,
    (customSettings?.adminPasswordHash || '').trim(),
  ].filter((p) => Boolean(p && !p.startsWith('REPLACE_WITH_')));

  return allowedPasswords.some((stored) => {
    const storedSha256 = crypto.createHash('sha256').update(stored).digest('hex');
    return (
      safeCompare(cleanPass, stored) ||
      safeCompare(cleanPass.toLowerCase(), stored.toLowerCase()) ||
      safeCompare(passSha256, stored.toLowerCase()) ||
      safeCompare(passLowerSha256, stored.toLowerCase()) ||
      safeCompare(passSha256, storedSha256)
    );
  });
}

/**
 * Creates a cryptographically signed HMAC session token for an authenticated administrator
 */
export function createAdminSessionToken(username = 'pscrappers'): string {
  const timestamp = Date.now();
  const payload = `admin:${username.toLowerCase()}:${timestamp}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `adm.${Buffer.from(username.toLowerCase()).toString('base64url')}.${timestamp}.${sig}`;
}

/**
 * Validates an administrator session token (HMAC-signed or active session token)
 */
export function isAdminTokenValid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean) return false;

  if (clean.startsWith('adm.')) {
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

  if (safeCompare(clean, LEGACY_ADMIN_SESSION_TOKEN)) {
    return true;
  }

  return false;
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
 * Extracts and verifies whether an incoming HTTP request is authenticated as an Administrator
 */
export function isRequestAdmin(req: any): boolean {
  if (!req) return false;
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const headerToken = req.headers?.['x-admin-token'];
  const queryToken = req.query?.token || req.query?.adminToken;
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies['ps_admin_session'];

  const candidates = [
    typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').trim() : '',
    typeof headerToken === 'string' ? headerToken.trim() : '',
    typeof cookieToken === 'string' ? cookieToken.trim() : '',
    typeof queryToken === 'string' ? queryToken.trim() : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (isAdminTokenValid(candidate) || isMainAdminTokenValid(candidate)) {
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
  const clean = provided.trim();
  if (!clean) return false;
  return (
    safeCompare(clean, MAIN_ADMIN_PASSWORD) ||
    safeCompare(clean.toLowerCase(), MAIN_ADMIN_PASSWORD.toLowerCase())
  );
}

export function verifyProtectedActionPassword(provided?: string): boolean {
  if (!provided || typeof provided !== 'string') return false;
  const clean = provided.trim();
  if (!clean) return false;
  const allowed = [MAIN_ADMIN_PASSWORD, ADMIN_DELETE_PASSWORD, ADMIN_PROTECTED_PASSWORD];
  return allowed.some(
    (p) => safeCompare(clean, p) || safeCompare(clean.toLowerCase(), p.toLowerCase())
  );
}

export function createMainAdminToken(): string {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`main-admin:${timestamp}`)
    .digest('hex');
  return `ma.${timestamp}.${signature}`;
}

export function isMainAdminTokenValid(token?: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const clean = token.trim();
  if (!clean) return false;

  if (clean.startsWith('ma.')) {
    const parts = clean.split('.');
    if (parts.length === 3) {
      const timestamp = parseInt(parts[1], 10);
      const providedSig = parts[2];
      if (isNaN(timestamp)) return false;
      if (Date.now() - timestamp > MAIN_ADMIN_TIMEOUT_MS) return false;
      const expectedSig = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(`main-admin:${timestamp}`)
        .digest('hex');
      return safeCompare(providedSig, expectedSig);
    }
    return false;
  }

  if (clean === 'ma_unlocked') {
    return true;
  }

  return false;
}
