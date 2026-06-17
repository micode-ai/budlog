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
