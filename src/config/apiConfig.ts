/**
 * API Configuration Module for Multi-Environment Deployment (AI Studio / Vercel / Custom Node Backend)
 */
export const API_BASE_URL: string =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '';

/**
 * Returns the fully qualified URL for an API endpoint based on environment configuration.
 * When VITE_API_URL is set, routes requests to the persistent remote backend.
 * Otherwise, falls back to same-origin relative paths (/api/...).
 */
export function getApiUrl(endpoint: string): string {
  if (!endpoint) return '';
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }
  const clean = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${clean}`;
}

/**
 * Returns authentication headers including Certificate Maker token and Main Core Admin session token.
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof window === 'undefined') return headers;
  const coreToken = sessionStorage.getItem('ps_core_admin_token') || '';
  const adminToken =
    localStorage.getItem('ps_admin_token') ||
    localStorage.getItem('pscrappers_admin_token') ||
    '';
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
    headers['Authorization'] = `Bearer ${adminToken}`;
  }
  if (coreToken) {
    headers['x-main-admin-token'] = coreToken;
  }
  return headers;
}
