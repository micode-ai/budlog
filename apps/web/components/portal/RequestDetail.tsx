'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { pget, ppost, ppatch, pupload, clearSession, Unauthorized, RequestDetail as RD } from '@/lib/portal';
import { P } from '@/lib/i18n';

const ACTIONS = ['accept', 'decline', 'start', 'done'] as const;

const ALLOWED_ACTIONS: Record<string, string[]> = {
  open: ['accept', 'decline'],
  accepted: ['start', 'decline', 'done'],
  in_progress: ['done', 'decline'],
  done: [],
  declined: [],
};

export default function RequestDetail({ projectId, requestId, onBack }: { projectId: string; requestId: string; onBack: () => void }) {
  const router = useRouter();
  const t = P.en;
  const [req, setReq] = useState<RD | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [designMsg, setDesignMsg] = useState('');

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
    setBusy(true); setError(''); setDesignMsg('');
    try {
      await ppost(`projects/${projectId}/requests/${requestId}/design`, { planAttachmentId });
      setDesignMsg(t.designReady);
      await load();
    } catch (err) { gate(err); } finally { setBusy(false); }
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
          {ACTIONS.filter((a) => (ALLOWED_ACTIONS[req.status] ?? []).includes(a)).map((a) => (
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
        {designMsg && <p className="mt-2 text-xs font-bold text-material">{designMsg}</p>}
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
