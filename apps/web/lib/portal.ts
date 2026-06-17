import { API_BASE } from './api';

// In-memory only — never localStorage/sessionStorage (stored-XSS token theft). Same rationale as lib/admin.ts.
let token: string | null = null;
let accountId: string | null = null;

export function getToken(): string | null {
  return token;
}
export function getAccountId(): string | null {
  return accountId;
}
export function setSession(t: string, acc: string): void {
  token = t;
  accountId = acc;
}
export function clearSession(): void {
  token = null;
  accountId = null;
}

export class Unauthorized extends Error {}

/** Log in and resolve the user's first account. Returns true on success. */
export async function login(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const t: string | undefined = data.accessToken;
    if (!t) return false;
    const accRes = await fetch(`${API_BASE}/api/v1/accounts`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!accRes.ok) return false;
    const accounts = await accRes.json();
    // GET /api/v1/accounts returns a plain JSON array: [{ id, name, type, myRole, ... }, ...]
    const acc = Array.isArray(accounts) ? accounts[0] : null;
    if (!acc?.id) return false;
    setSession(t, acc.id);
    return true;
  } catch {
    return false;
  }
}

function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token ?? ''}`,
    'X-Account-Id': accountId ?? '',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) throw new Unauthorized();
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  // 204/empty → null
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function pget<T>(path: string): Promise<T> {
  return handle<T>(await fetch(`${API_BASE}/api/v1/${path}`, { headers: authHeaders(false) }));
}
export async function ppost<T>(path: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}/api/v1/${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }),
  );
}
export async function ppatch<T>(path: string, body: unknown): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}/api/v1/${path}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body) }),
  );
}
/** Multipart upload (no JSON content-type — the browser sets the multipart boundary). */
export async function pupload<T>(path: string, form: FormData): Promise<T> {
  return handle<T>(
    await fetch(`${API_BASE}/api/v1/${path}`, { method: 'POST', headers: authHeaders(false), body: form }),
  );
}

// ── Types (shapes returned by the BDL-3/4/5 APIs) ──
export type ProjectStatus = 'lead' | 'design' | 'build' | 'done' | 'archived';
export type RequestType = 'plan' | 'design' | 'change' | 'question' | 'other';
export type RequestStatus = 'open' | 'accepted' | 'in_progress' | 'done' | 'declined';
export type ProjectRole = 'foreman' | 'designer' | 'client' | 'manager';

export interface Project {
  id: string;
  name: string;
  clientName: string | null;
  address: string | null;
  status: ProjectStatus;
  createdAt: string;
}
export interface RequestItem {
  id: string;
  type: RequestType;
  title: string;
  body: string;
  status: RequestStatus;
  assigneeRole: ProjectRole | null;
  createdAt: string;
}
export interface RequestMessage {
  id: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}
export interface Attachment {
  id: string;
  kind: string;
  mimeType: string | null;
  caption: string | null;
  createdAt: string;
}
export interface RequestDetail extends RequestItem {
  messages: RequestMessage[];
  attachments: Attachment[];
}
export interface DesignArtifact {
  id: string;
  kind: 'schema' | 'svg' | 'render' | 'external3d';
  provider: string;
  data: unknown;
  requestId: string | null;
  createdAt: string;
}

/** Turn stored SVG markup into a sandboxed data-URI for an <img> (SVG scripts do NOT run in <img>). */
export function svgToDataUri(svg: string): string {
  let b64: string;
  if (typeof window === 'undefined') {
    // SSR (Next renders client components on the server first) — Node Buffer is available here.
    b64 = Buffer.from(svg, 'utf-8').toString('base64');
  } else {
    const bytes = new TextEncoder().encode(svg);
    let bin = '';
    for (const byte of bytes) bin += String.fromCharCode(byte);
    b64 = window.btoa(bin);
  }
  return `data:image/svg+xml;base64,${b64}`;
}
