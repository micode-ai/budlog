'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, setToken } from '@/lib/admin';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const token = await login(email.trim(), password);
    setBusy(false);
    if (!token) {
      setError('Invalid email or password.');
      return;
    }
    setToken(token);
    router.push('/admin/dashboard');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-2xl font-semibold text-ink">BudLog Admin</h1>
      <p className="mt-1 text-sm text-muted">Sign in with an admin account.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-bold uppercase text-muted">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-bold uppercase text-muted">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-md border border-hairline px-3 py-2 text-ink focus:border-cta focus:outline-none focus:ring-1 focus:ring-cta"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-md bg-cta font-bold text-white transition-colors duration-200 hover:bg-ctaDark disabled:opacity-60 cursor-pointer"
        >
          {busy ? '…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
