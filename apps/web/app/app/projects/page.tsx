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
