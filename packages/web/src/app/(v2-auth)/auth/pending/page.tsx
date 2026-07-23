import { AuthCard } from '../_components/auth-card';
import { SignOutControl } from '../_components/sign-out-control';
import { PendingApproval } from './_components/pending-approval';
import { createServerORPCClient } from '@/lib/orpc-server';

export default async function PendingApprovalPage() {
  let account;
  try {
    account = await createServerORPCClient().auth.me({});
  } catch {
    return (
      <AuthCard
        description="We could not load your academy access."
        title="Academy approval"
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

  return (
    <AuthCard
      description="Your Cove account is ready. Academy features become available after a manager reviews your application."
      title="Academy approval"
    >
      <PendingApproval initialAccount={account} />
    </AuthCard>
  );
}
