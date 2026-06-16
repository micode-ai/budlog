import { API_BASE } from './api';

// In-memory only — never localStorage/sessionStorage. Persistent storage is
// readable by any injected script (stored-XSS token theft); keeping the admin
// JWT in a module-scoped variable means it lives only for the SPA session and
// is gone on hard reload (admin re-logs in). Proper long-term fix: have the API
// issue an HttpOnly+Secure+SameSite cookie and drop the bearer token entirely.
let token: string | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string): void {
  token = value;
}

export function clearToken(): void {
  token = null;
}

export async function login(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.accessToken || null;
  } catch {
    return null;
  }
}

export class Unauthorized extends Error {}

export async function adminGet<T>(path: string): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/v1/admin/${path}`, {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  });
  if (res.status === 401 || res.status === 403) throw new Unauthorized();
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return (await res.json()) as T;
}

export interface AdminStats {
  users: number;
  accounts: number;
  sites: number;
  workEntries: number;
  materialEntries: number;
  photos: number;
  reportLinks: number;
}
