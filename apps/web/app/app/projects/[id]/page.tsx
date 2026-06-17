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
