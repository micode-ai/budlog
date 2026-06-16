'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminGet, AdminStats, clearToken, getToken, Unauthorized } from '@/lib/admin';

interface UserRow {
  id: string;
  email: string;
  name: string;
  language: string;
  isVerified: boolean;
  createdAt: string;
  _count: { accountMembers: number };
}
interface AccountRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  owner: { email: string; name: string };
  _count: { members: number; sites: number };
}
interface SiteRow {
  id: string;
  name: string;
  status: string;
  clientName: string | null;
  account: { name: string };
  _count: { workEntries: number; materialEntries: number; photos: number };
}

const STAT_LABELS: Record<keyof AdminStats, string> = {
  users: 'Users',
  accounts: 'Accounts',
  sites: 'Sites',
  workEntries: 'Work entries',
  materialEntries: 'Materials',
  photos: 'Photos',
  reportLinks: 'Report links',
};

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [tab, setTab] = useState<'users' | 'accounts' | 'sites'>('users');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/admin');
      return;
    }
    Promise.all([
      adminGet<AdminStats>('stats'),
      adminGet<UserRow[]>('users'),
      adminGet<AccountRow[]>('accounts'),
      adminGet<SiteRow[]>('sites'),
    ])
      .then(([s, u, a, si]) => {
        setStats(s);
        setUsers(u);
        setAccounts(a);
        setSites(si);
      })
      .catch((err) => {
        if (err instanceof Unauthorized) {
          clearToken();
          router.replace('/admin');
        } else {
          setError('Failed to load admin data.');
        }
      });
  }, [router]);

  function logout() {
    clearToken();
    router.replace('/admin');
  }

  const fmtDate = (iso: string) => new Date(iso).toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-5xl px-5 py-6 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink">BudLog Admin</h1>
        <button
          onClick={logout}
          className="rounded-md border border-hairline px-3 py-1.5 text-sm text-secondary transition-colors hover:bg-white cursor-pointer"
        >
          Sign out
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(STAT_LABELS) as (keyof AdminStats)[]).map((k) => (
            <div key={k} className="rounded-lg border border-hairline bg-white p-3">
              <div className="text-2xl font-bold text-ink">{stats[k]}</div>
              <div className="text-xs text-muted">{STAT_LABELS[k]}</div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-2 border-b border-hairline">
        {(['users', 'accounts', 'sites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-bold capitalize transition-colors cursor-pointer ${
              tab === t ? 'border-cta text-cta' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        {tab === 'users' && (
          <Table head={['Email', 'Name', 'Lang', 'Verified', 'Accounts', 'Joined']}>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-hairline">
                <Td>{u.email}</Td>
                <Td>{u.name}</Td>
                <Td>{u.language}</Td>
                <Td>{u.isVerified ? '✓' : '—'}</Td>
                <Td>{u._count.accountMembers}</Td>
                <Td>{fmtDate(u.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'accounts' && (
          <Table head={['Name', 'Type', 'Owner', 'Members', 'Sites', 'Created']}>
            {accounts.map((a) => (
              <tr key={a.id} className="border-b border-hairline">
                <Td>{a.name}</Td>
                <Td>{a.type}</Td>
                <Td>{a.owner?.email}</Td>
                <Td>{a._count.members}</Td>
                <Td>{a._count.sites}</Td>
                <Td>{fmtDate(a.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
        {tab === 'sites' && (
          <Table head={['Site', 'Account', 'Client', 'Status', 'Work', 'Mat.', 'Photos']}>
            {sites.map((s) => (
              <tr key={s.id} className="border-b border-hairline">
                <Td>{s.name}</Td>
                <Td>{s.account?.name}</Td>
                <Td>{s.clientName || '—'}</Td>
                <Td>{s.status}</Td>
                <Td>{s._count.workEntries}</Td>
                <Td>{s._count.materialEntries}</Td>
                <Td>{s._count.photos}</Td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </main>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead>
        <tr className="border-b border-hairline">
          {head.map((h) => (
            <th key={h} className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2 text-ink">{children}</td>;
}
