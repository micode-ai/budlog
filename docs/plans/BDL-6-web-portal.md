# BDL-6 — Web portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the authenticated client/designer/foreman **web portal** in `apps/web` — login, projects list + create, and a project page with a **Requests** tab (thread, accept/act, plan upload, run design action) and a **Designs** tab (artifacts; SVG rendered sandboxed) — consuming the BDL-3/4/5 APIs.

**Architecture:** Next.js 14 app-router, client components (same pattern as the existing `/admin` panel). A `lib/portal.ts` auth/client module mirrors `lib/admin.ts`: JWT + the user's selected `accountId` held **in memory only** (never localStorage — stored-XSS token-theft guard, same rationale as `lib/admin.ts`), with `Authorization: Bearer` + `X-Account-Id` on every call. Routes under `app/app/` (`/app/login`, `/app/projects`, `/app/projects/[id]`). i18n reuses `lib/i18n.ts` (PL/RU/UA/EN) via a new `P` portal dictionary. Tailwind tokens (`ink`/`cta`/`ctaDark`/`hairline`/`muted`/`secondary`/`canvas`) already exist.

**Tech Stack:** Next.js 14, React 18, Tailwind. **No unit-test harness exists in `apps/web`** (the report and admin pages have none) — verification per task is `npm run build` (Next type-checks + compiles), and the final task is a live click-through smoke. This matches the established web codebase; adding Jest to the web workspace is out of scope.

**Spec:** `docs/specs/2026-06-16-collaboration-foundation-design.md` §8 · **Issue:** BDL-6 (#6) · **Depends on:** BDL-3/4/5 APIs (Project, Request, Attachment, Design).

**Security (carry-over from BDL-5 review — non-negotiable):** the stored design **SVG must be rendered sandboxed** — as `<img src="data:image/svg+xml;base64,…">` (SVG scripts don't execute in `<img>`). NEVER `dangerouslySetInnerHTML` or inline `<svg>{markup}</svg>`.

**API base & CORS:** `API_BASE` from `lib/api.ts` (env `NEXT_PUBLIC_API_URL`, default `http://localhost:3000`). The API already CORS-allows `http://localhost:3001` and reflects custom request headers (so `X-Account-Id` works). All portal endpoints are under `${API_BASE}/api/v1`.

**Run commands** from `apps/web/`: `npm run build` (type-check + compile), `npm run dev` (serves on :3001). The API must be running on :3000 for the live smoke.

---

### Task 1: `lib/portal.ts` — auth + API client + types

**Files:** Create `apps/web/lib/portal.ts`

- [ ] **Step 1: Write the module:**

```ts
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
  const b64 = typeof window !== 'undefined' ? window.btoa(unescape(encodeURIComponent(svg))) : '';
  return `data:image/svg+xml;base64,${b64}`;
}
```

- [ ] **Step 2: Build to type-check**

Run (from `apps/web/`): `npm run build`
Expected: compiles (the new module is unused so far — no route consumes it yet; build still type-checks it).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/portal.ts
git commit -m "feat(web): BDL-6 portal auth + API client + types

Refs #6"
```

---

### Task 2: Portal i18n strings

**Files:** Modify `apps/web/lib/i18n.ts`

- [ ] **Step 1:** Append a portal dictionary (`P`) keyed by `Lang`, after the existing `T` export. Add this block (keep the existing `T`, `LANGS`, `normalizeLang`, `Lang` as-is):

```ts
interface PortalDict {
  signIn: string;
  email: string;
  password: string;
  invalidLogin: string;
  projects: string;
  newProject: string;
  projectName: string;
  noProjects: string;
  requests: string;
  designs: string;
  journal: string;
  newRequest: string;
  title: string;
  description: string;
  type: string;
  assignTo: string;
  send: string;
  accept: string;
  decline: string;
  start: string;
  done: string;
  thread: string;
  writeMessage: string;
  attachments: string;
  uploadPlan: string;
  runDesign: string;
  noRequests: string;
  noDesigns: string;
  schema: string;
  signOut: string;
  openReport: string;
  status: string;
  loadFailed: string;
}

export const P: Record<Lang, PortalDict> = {
  en: {
    signIn: 'Sign in', email: 'Email', password: 'Password', invalidLogin: 'Invalid email or password.',
    projects: 'Projects', newProject: 'New project', projectName: 'Project name', noProjects: 'No projects yet.',
    requests: 'Requests', designs: 'Designs', journal: 'Journal', newRequest: 'New request',
    title: 'Title', description: 'Description', type: 'Type', assignTo: 'Assign to', send: 'Send',
    accept: 'Accept', decline: 'Decline', start: 'Start', done: 'Mark done', thread: 'Thread',
    writeMessage: 'Write a message…', attachments: 'Attachments', uploadPlan: 'Upload plan',
    runDesign: 'Run design', noRequests: 'No requests yet.', noDesigns: 'No designs yet.',
    schema: 'Schema', signOut: 'Sign out', openReport: 'Open report', status: 'Status', loadFailed: 'Failed to load.',
  },
  pl: {
    signIn: 'Zaloguj się', email: 'E-mail', password: 'Hasło', invalidLogin: 'Nieprawidłowy e-mail lub hasło.',
    projects: 'Projekty', newProject: 'Nowy projekt', projectName: 'Nazwa projektu', noProjects: 'Brak projektów.',
    requests: 'Zgłoszenia', designs: 'Projekty graficzne', journal: 'Dziennik', newRequest: 'Nowe zgłoszenie',
    title: 'Tytuł', description: 'Opis', type: 'Typ', assignTo: 'Przypisz do', send: 'Wyślij',
    accept: 'Przyjmij', decline: 'Odrzuć', start: 'Rozpocznij', done: 'Zakończ', thread: 'Wątek',
    writeMessage: 'Napisz wiadomość…', attachments: 'Załączniki', uploadPlan: 'Wgraj plan',
    runDesign: 'Generuj projekt', noRequests: 'Brak zgłoszeń.', noDesigns: 'Brak projektów graficznych.',
    schema: 'Schemat', signOut: 'Wyloguj', openReport: 'Otwórz raport', status: 'Status', loadFailed: 'Błąd ładowania.',
  },
  ru: {
    signIn: 'Войти', email: 'E-mail', password: 'Пароль', invalidLogin: 'Неверный e-mail или пароль.',
    projects: 'Проекты', newProject: 'Новый проект', projectName: 'Название проекта', noProjects: 'Проектов пока нет.',
    requests: 'Заявки', designs: 'Дизайны', journal: 'Журнал', newRequest: 'Новая заявка',
    title: 'Заголовок', description: 'Описание', type: 'Тип', assignTo: 'Назначить', send: 'Отправить',
    accept: 'Принять', decline: 'Отклонить', start: 'В работу', done: 'Завершить', thread: 'Переписка',
    writeMessage: 'Написать сообщение…', attachments: 'Вложения', uploadPlan: 'Загрузить план',
    runDesign: 'Сгенерировать дизайн', noRequests: 'Заявок пока нет.', noDesigns: 'Дизайнов пока нет.',
    schema: 'Схема', signOut: 'Выйти', openReport: 'Открыть отчёт', status: 'Статус', loadFailed: 'Ошибка загрузки.',
  },
  ua: {
    signIn: 'Увійти', email: 'E-mail', password: 'Пароль', invalidLogin: 'Невірний e-mail або пароль.',
    projects: 'Проєкти', newProject: 'Новий проєкт', projectName: 'Назва проєкту', noProjects: 'Проєктів поки немає.',
    requests: 'Заявки', designs: 'Дизайни', journal: 'Журнал', newRequest: 'Нова заявка',
    title: 'Заголовок', description: 'Опис', type: 'Тип', assignTo: 'Призначити', send: 'Надіслати',
    accept: 'Прийняти', decline: 'Відхилити', start: 'У роботу', done: 'Завершити', thread: 'Листування',
    writeMessage: 'Написати повідомлення…', attachments: 'Вкладення', uploadPlan: 'Завантажити план',
    runDesign: 'Згенерувати дизайн', noRequests: 'Заявок поки немає.', noDesigns: 'Дизайнів поки немає.',
    schema: 'Схема', signOut: 'Вийти', openReport: 'Відкрити звіт', status: 'Статус', loadFailed: 'Помилка завантаження.',
  },
};
```

- [ ] **Step 2: Build** — Run `npm run build`; expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/i18n.ts
git commit -m "feat(web): BDL-6 portal i18n strings (PL/RU/UA/EN)

Refs #6"
```

---

### Task 3: `/app/login` page

**Files:** Create `apps/web/app/app/login/page.tsx`

- [ ] **Step 1: Write the page** (adapts the admin login; uses `P.en` for labels — language switching in the portal is a later nicety, English labels are fine for login):

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/portal';
import { P } from '@/lib/i18n';

export default function PortalLoginPage() {
  const router = useRouter();
  const t = P.en;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await login(email.trim(), password);
    setBusy(false);
    if (!ok) {
      setError(t.invalidLogin);
      return;
    }
    router.push('/app/projects');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-2xl font-semibold text-ink">BudLog</h1>
      <p className="mt-1 text-sm text-muted">{t.signIn}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-bold uppercase text-muted">{t.email}</label>
          <input
            id="email" type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-bold uppercase text-muted">{t.password}</label>
          <input
            id="password" type="password" autoComplete="current-password" value={password}
            onChange={(e) => setPassword(e.target.value)} required
            className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="h-11 w-full rounded-md bg-cta font-bold text-white transition-colors duration-200 hover:bg-ctaDark disabled:opacity-60 cursor-pointer"
        >
          {busy ? '…' : t.signIn}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Build** — `npm run build`; expected compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app/login/page.tsx
git commit -m "feat(web): BDL-6 portal login page

Refs #6"
```

---

### Task 4: `/app/projects` — list + create

**Files:** Create `apps/web/app/app/projects/page.tsx`

- [ ] **Step 1: Write the page:**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { pget, ppost, getToken, clearSession, Unauthorized, Project } from '@/lib/portal';
import { P } from '@/lib/i18n';

export default function ProjectsPage() {
  const router = useRouter();
  const t = P.en;
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function gate(err: unknown) {
    if (err instanceof Unauthorized) {
      clearSession();
      router.replace('/app/login');
    } else {
      setError(t.loadFailed);
    }
  }

  async function load() {
    try {
      setProjects(await pget<Project[]>('projects'));
    } catch (err) {
      gate(err);
    }
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/app/login');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await ppost<Project>('projects', { name: name.trim() });
      setName('');
      await load();
    } catch (err) {
      gate(err);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    router.replace('/app/login');
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink">{t.projects}</h1>
        <button onClick={logout} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-white cursor-pointer">
          {t.signOut}
        </button>
      </div>

      <form onSubmit={create} className="mt-6 flex gap-2">
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder={t.projectName}
          className="flex-1 rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
        />
        <button type="submit" disabled={busy} className="rounded-md bg-cta px-4 font-bold text-white hover:bg-ctaDark disabled:opacity-60 cursor-pointer">
          {t.newProject}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ul className="mt-6 space-y-2">
        {projects.length === 0 && <li className="text-sm text-muted">{t.noProjects}</li>}
        {projects.map((p) => (
          <li key={p.id}>
            <Link href={`/app/projects/${p.id}`} className="block rounded-lg border border-hairline bg-white p-4 transition-colors hover:border-cta">
              <div className="font-bold text-ink">{p.name}</div>
              <div className="text-xs text-muted">
                {t.status}: {p.status}{p.clientName ? ` · ${p.clientName}` : ''}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Build** — `npm run build`; expected compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/app/projects/page.tsx
git commit -m "feat(web): BDL-6 projects list + create

Refs #6"
```

---

### Task 5: `/app/projects/[id]` — Requests tab + request detail

**Files:**
- Create: `apps/web/app/app/projects/[id]/page.tsx` (tab shell)
- Create: `apps/web/components/portal/RequestsTab.tsx`
- Create: `apps/web/components/portal/RequestDetail.tsx`

- [ ] **Step 1: Tab shell** (`app/app/projects/[id]/page.tsx`):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getToken, clearSession } from '@/lib/portal';
import { P } from '@/lib/i18n';
import RequestsTab from '@/components/portal/RequestsTab';
import DesignsTab from '@/components/portal/DesignsTab';

type Tab = 'requests' | 'designs' | 'journal';

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = String(params.id);
  const t = P.en;
  const [tab, setTab] = useState<Tab>('requests');

  useEffect(() => {
    if (!getToken()) router.replace('/app/login');
  }, [router]);

  function logout() {
    clearSession();
    router.replace('/app/login');
  }

  const tabs: Tab[] = ['requests', 'designs', 'journal'];
  const label: Record<Tab, string> = { requests: t.requests, designs: t.designs, journal: t.journal };

  return (
    <main className="mx-auto max-w-3xl px-5 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/app/projects" className="text-sm text-cta hover:underline">← {t.projects}</Link>
        <button onClick={logout} className="rounded-md border border-hairline px-3 py-1.5 text-sm text-secondary hover:bg-white cursor-pointer">
          {t.signOut}
        </button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-hairline">
        {tabs.map((tb) => (
          <button
            key={tb} onClick={() => setTab(tb)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold transition-colors cursor-pointer ${
              tab === tb ? 'border-cta text-cta' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {label[tb]}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'requests' && <RequestsTab projectId={projectId} />}
        {tab === 'designs' && <DesignsTab projectId={projectId} />}
        {tab === 'journal' && (
          <p className="text-sm text-muted">
            {t.journal}: {t.openReport} — the read-only site report is shared via its own link from Telegram (<code>/report</code>).
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: RequestsTab** (`components/portal/RequestsTab.tsx`) — list + create + drill into detail:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pget, ppost, clearSession, Unauthorized, RequestItem, RequestType, ProjectRole } from '@/lib/portal';
import { P } from '@/lib/i18n';
import RequestDetail from './RequestDetail';

const TYPES: RequestType[] = ['plan', 'design', 'change', 'question', 'other'];
const ASSIGNEES: ProjectRole[] = ['foreman', 'designer'];

export default function RequestsTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const t = P.en;
  const [items, setItems] = useState<RequestItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', body: '', type: 'plan' as RequestType, assigneeRole: 'designer' as ProjectRole });
  const [busy, setBusy] = useState(false);

  function gate(err: unknown) {
    if (err instanceof Unauthorized) {
      clearSession();
      router.replace('/app/login');
    } else {
      setError(t.loadFailed);
    }
  }

  async function load() {
    try {
      setItems(await pget<RequestItem[]>(`projects/${projectId}/requests`));
    } catch (err) {
      gate(err);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setBusy(true);
    setError('');
    try {
      await ppost(`projects/${projectId}/requests`, {
        title: form.title.trim(), body: form.body.trim(), type: form.type, assigneeRole: form.assigneeRole,
      });
      setForm({ title: '', body: '', type: 'plan', assigneeRole: 'designer' });
      await load();
    } catch (err) {
      gate(err);
    } finally {
      setBusy(false);
    }
  }

  if (openId) {
    return <RequestDetail projectId={projectId} requestId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div>
      <form onSubmit={create} className="space-y-2 rounded-lg border border-hairline bg-white p-4">
        <div className="text-sm font-bold text-ink">{t.newRequest}</div>
        <input
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t.title}
          className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
        />
        <textarea
          value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={t.description} rows={2}
          className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
        />
        <div className="flex gap-2">
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RequestType })} className="rounded-md border border-hairline px-2 py-2 text-sm text-ink cursor-pointer">
            {TYPES.map((ty) => <option key={ty} value={ty}>{ty}</option>)}
          </select>
          <select value={form.assigneeRole} onChange={(e) => setForm({ ...form, assigneeRole: e.target.value as ProjectRole })} className="rounded-md border border-hairline px-2 py-2 text-sm text-ink cursor-pointer">
            {ASSIGNEES.map((r) => <option key={r} value={r}>{t.assignTo}: {r}</option>)}
          </select>
          <button type="submit" disabled={busy} className="ml-auto rounded-md bg-cta px-4 font-bold text-white hover:bg-ctaDark disabled:opacity-60 cursor-pointer">
            {t.send}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <ul className="mt-4 space-y-2">
        {items.length === 0 && <li className="text-sm text-muted">{t.noRequests}</li>}
        {items.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpenId(r.id)} className="block w-full rounded-lg border border-hairline bg-white p-3 text-left transition-colors hover:border-cta cursor-pointer">
              <div className="flex items-center justify-between">
                <span className="font-bold text-ink">{r.title}</span>
                <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-secondary">{r.status}</span>
              </div>
              <div className="text-xs text-muted">{r.type}{r.assigneeRole ? ` → ${r.assigneeRole}` : ''}</div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: RequestDetail** (`components/portal/RequestDetail.tsx`) — thread, transitions, plan upload, run design:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pget, ppost, ppatch, pupload, clearSession, Unauthorized, RequestDetail as RD } from '@/lib/portal';
import { P } from '@/lib/i18n';

const ACTIONS = ['accept', 'decline', 'start', 'done'] as const;

export default function RequestDetail({ projectId, requestId, onBack }: { projectId: string; requestId: string; onBack: () => void }) {
  const router = useRouter();
  const t = P.en;
  const [req, setReq] = useState<RD | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function gate(err: unknown) {
    if (err instanceof Unauthorized) {
      clearSession();
      router.replace('/app/login');
    } else {
      setError(t.loadFailed);
    }
  }

  async function load() {
    try {
      setReq(await pget<RD>(`projects/${projectId}/requests/${requestId}`));
    } catch (err) {
      gate(err);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  async function act(action: string) {
    setBusy(true); setError('');
    try { await ppatch(`projects/${projectId}/requests/${requestId}`, { action }); await load(); }
    catch (err) { gate(err); } finally { setBusy(false); }
  }

  async function sendMsg(e: React.FormEvent) {
    e.preventDefault();
    if (!msg.trim()) return;
    setBusy(true); setError('');
    try { await ppost(`projects/${projectId}/requests/${requestId}/messages`, { body: msg.trim() }); setMsg(''); await load(); }
    catch (err) { gate(err); } finally { setBusy(false); }
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('kind', 'plan');
      await pupload(`projects/${projectId}/requests/${requestId}/attachments`, form);
      await load();
    } catch (err) { gate(err); } finally { setBusy(false); e.target.value = ''; }
  }

  async function runDesign(planAttachmentId: string) {
    setBusy(true); setError('');
    try { await ppost(`projects/${projectId}/requests/${requestId}/design`, { planAttachmentId }); }
    catch (err) { gate(err); } finally { setBusy(false); }
  }

  if (!req) return <p className="text-sm text-muted">…</p>;

  return (
    <div>
      <button onClick={onBack} className="text-sm text-cta hover:underline cursor-pointer">← {t.requests}</button>
      <div className="mt-3 rounded-lg border border-hairline bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-ink">{req.title}</h2>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-secondary">{req.status}</span>
        </div>
        <p className="mt-1 text-sm text-secondary">{req.body}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {ACTIONS.map((a) => (
            <button key={a} onClick={() => act(a)} disabled={busy}
              className="rounded-md border border-hairline px-3 py-1.5 text-sm text-secondary hover:border-cta hover:text-cta disabled:opacity-50 cursor-pointer">
              {t[a]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-hairline bg-white p-4">
        <div className="text-sm font-bold text-ink">{t.attachments}</div>
        <ul className="mt-2 space-y-1">
          {req.attachments.length === 0 && <li className="text-xs text-muted">—</li>}
          {req.attachments.map((a) => (
            <li key={a.id} className="flex items-center justify-between text-sm">
              <span className="text-secondary">{a.kind} · {a.mimeType ?? ''} {a.caption ? `· ${a.caption}` : ''}</span>
              <button onClick={() => runDesign(a.id)} disabled={busy} className="rounded-md bg-material px-2 py-1 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer">
                {t.runDesign}
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 inline-block cursor-pointer rounded-md border border-hairline px-3 py-1.5 text-sm text-secondary hover:border-cta">
          {t.uploadPlan}
          <input type="file" className="hidden" onChange={upload} disabled={busy} />
        </label>
      </div>

      <div className="mt-4 rounded-lg border border-hairline bg-white p-4">
        <div className="text-sm font-bold text-ink">{t.thread}</div>
        <ul className="mt-2 space-y-2">
          {req.messages.map((m) => (
            <li key={m.id} className="rounded-md bg-canvas px-3 py-2 text-sm text-ink">{m.body}</li>
          ))}
        </ul>
        <form onSubmit={sendMsg} className="mt-3 flex gap-2">
          <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={t.writeMessage}
            className="flex-1 rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta" />
          <button type="submit" disabled={busy} className="rounded-md bg-cta px-4 font-bold text-white hover:bg-ctaDark disabled:opacity-60 cursor-pointer">{t.send}</button>
        </form>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Build** — `npm run build`. Note: this references `@/components/portal/DesignsTab`, created in Task 6. Create a temporary minimal stub `components/portal/DesignsTab.tsx` (`export default function DesignsTab(_: { projectId: string }) { return null; }`) so this task builds, OR implement Tasks 5 and 6 back-to-back and build once after Task 6. Recommended: create the stub now, replace it in Task 6.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/app/projects/[id]/page.tsx apps/web/components/portal/RequestsTab.tsx apps/web/components/portal/RequestDetail.tsx apps/web/components/portal/DesignsTab.tsx
git commit -m "feat(web): BDL-6 project page — Requests tab + request detail (thread, transitions, plan upload, run design)

Refs #6"
```

---

### Task 6: Designs tab (sandboxed SVG + schema JSON)

**Files:** Create/replace `apps/web/components/portal/DesignsTab.tsx`

- [ ] **Step 1: Implement** — render the SVG artifact **sandboxed** via `svgToDataUri` in an `<img>` (NEVER inline/`dangerouslySetInnerHTML`); show the schema as pretty JSON:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pget, clearSession, Unauthorized, DesignArtifact, svgToDataUri } from '@/lib/portal';
import { P } from '@/lib/i18n';

export default function DesignsTab({ projectId }: { projectId: string }) {
  const router = useRouter();
  const t = P.en;
  const [items, setItems] = useState<DesignArtifact[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    pget<DesignArtifact[]>(`projects/${projectId}/designs`)
      .then(setItems)
      .catch((err) => {
        if (err instanceof Unauthorized) {
          clearSession();
          router.replace('/app/login');
        } else {
          setError(t.loadFailed);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {items.length === 0 && !error && <p className="text-sm text-muted">{t.noDesigns}</p>}
      <ul className="space-y-3">
        {items.map((d) => (
          <li key={d.id} className="rounded-lg border border-hairline bg-white p-4">
            <div className="mb-2 flex items-center gap-2 text-xs">
              <span className="rounded-full bg-canvas px-2 py-0.5 font-bold text-secondary">{d.kind}</span>
              <span className="text-muted">{d.provider} · {new Date(d.createdAt).toISOString().slice(0, 10)}</span>
            </div>
            {d.kind === 'svg' && isSvg(d.data) ? (
              // Sandboxed: SVG scripts do NOT execute inside <img>. Never inline this markup.
              <img src={svgToDataUri((d.data as { svg: string }).svg)} alt="floor plan" className="max-w-full rounded border border-hairline" />
            ) : (
              <pre className="overflow-x-auto rounded bg-canvas p-3 text-xs text-ink">{t.schema}: {JSON.stringify(d.data, null, 2)}</pre>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function isSvg(data: unknown): data is { svg: string } {
  return !!data && typeof (data as { svg?: unknown }).svg === 'string';
}
```

- [ ] **Step 2: Build** — `npm run build`; expected: compiles, no type errors. (This replaces the Task 5 stub.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/portal/DesignsTab.tsx
git commit -m "feat(web): BDL-6 Designs tab — sandboxed SVG (data-URI img) + schema JSON

Refs #6"
```

---

### Task 7: Live smoke + close BDL-6

**Files:** none

- [ ] **Step 1: Start both servers.** API (from `apps/api/`): `npm run dev` → :3000. Web (from `apps/web/`): `npm run dev` → :3001. (Use a seeded admin account; `alice@test.com` / `TestPass123` exists and owns an account.)

- [ ] **Step 2: Click-through** at `http://localhost:3001/app/login`:
  1. Log in as `alice@test.com` / `TestPass123` → lands on `/app/projects`.
  2. Create a project → it appears in the list → open it.
  3. **Requests tab:** create a request (title/body, type=plan, assignee=designer) → it lists → open it.
  4. In the request: post a message (appears in thread); click **Accept** (status → accepted); **Upload plan** (pick any PNG/JPG) → attachment appears.
  5. Click **Run design** on the uploaded attachment (one real GPT-4o call).
  6. **Designs tab:** the `svg` artifact renders as an image and the `schema` artifact shows as JSON. Confirm in devtools the SVG is an `<img src="data:image/svg+xml;base64,…">` (sandboxed), not inline.
  7. Reload the page → redirected to `/app/login` (in-memory token gone — expected).

- [ ] **Step 3: Verify** `npm run build` is clean (from `apps/web/`), then stop both dev servers.

- [ ] **Step 4: Final commit + close**

```bash
git commit --allow-empty -m "chore(web): BDL-6 web portal verified live (login → projects → requests → designs)

Closes #6"
git push origin main
```

---

## Definition of done
- `apps/web` portal: `/app/login`, `/app/projects` (list+create), `/app/projects/[id]` with Requests (list/create + detail thread, accept/decline/start/done, plan upload, run design) and Designs (sandboxed SVG + schema JSON) tabs; Journal tab links to the report.
- In-memory JWT + `X-Account-Id` on every call; 401/403 → redirect to login.
- Design SVG rendered **sandboxed** via data-URI `<img>` (verified in devtools) — never inline.
- i18n strings present for PL/RU/UA/EN; `npm run build` clean; live click-through passes.
- BDL-6 closed; commits reference `#6`. After this, BDL-2 (#2) umbrella can be closed.

## Out of scope (future BDL)
- Rich in-portal Journal embed of the site report; in-portal language switcher for the portal chrome.
- In-portal notifications / unread badges (`ProjectNotifier`) and realtime updates.
- Project member management UI (manager add/remove participants) — API exists (BDL-3); UI later.
