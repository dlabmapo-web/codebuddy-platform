'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { orpc } from '@/lib/orpc';

export function AccountBootstrap() {
  const account = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => orpc.auth.bootstrap({}),
    retry: false,
  });

  if (account.isPending) return <p className="text-sm text-slate-600">Preparing your Cove account…</p>;
  if (account.isError) return <p className="text-sm text-red-600">We could not prepare your Cove profile. Check that the API and database migration are running.</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">Signed in as <strong>{account.data.user.email ?? account.data.user.displayName ?? 'Cove user'}</strong>.</p>
      {account.data.user.memberships.length === 0 ? (
        <p className="rounded-lg bg-amber-50 p-4 text-sm leading-6 text-amber-900">Your account is ready, but you do not belong to an academy yet. Ask your academy manager for an invitation or submit a join request when that feature is enabled.</p>
      ) : (
        <ul className="space-y-2">{account.data.user.memberships.map((membership) => <li className="rounded-lg border border-slate-200 p-3 text-sm" key={membership.academy.id}>{membership.academy.name} · {membership.role}</li>)}</ul>
      )}
      <Link className="inline-block text-sm font-medium text-blue-700" href="/">Return to Cove</Link>
    </div>
  );
}
