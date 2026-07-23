import { redirect } from 'next/navigation';

import { AuthCard } from '../_components/auth-card';
import { SignOutControl } from '../_components/sign-out-control';
import { authDestination } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

export default async function WelcomePage() {
  let account;
  try {
    account = await createServerORPCClient().auth.bootstrap({});
  } catch {
    return (
      <AuthCard
        description="We could not load your Cove account."
        title="Account unavailable"
      >
        <p className="text-sm text-danger">
          Check your connection and try signing in again.
        </p>
        <div className="mt-5">
          <SignOutControl />
        </div>
      </AuthCard>
    );
  }

  const destination = authDestination(account);
  if (destination !== '/auth/welcome') {
    redirect(destination);
  }

  return (
    <AuthCard
      description="Your account is ready. Your identity stays separate from the roles each academy gives you."
      title="You're all set"
    >
      <div className="space-y-5">
        <p className="text-sm text-sub">
          Signed in as{' '}
          <strong className="text-ink">
            {account.user.email ?? account.user.displayName ?? 'Cove user'}
          </strong>.
        </p>
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          You do not belong to an academy yet. Choose an academy during signup
          or ask an academy manager for an invitation.
        </p>
        <SignOutControl />
      </div>
    </AuthCard>
  );
}
