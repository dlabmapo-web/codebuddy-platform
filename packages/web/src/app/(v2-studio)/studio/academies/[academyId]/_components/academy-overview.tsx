import { createServerORPCClient } from '@/lib/orpc-server';

export async function AcademyOverview({ academyId }: { academyId: string }) {
  let membership;
  try {
    const account = await createServerORPCClient().auth.me({});
    membership = account.user.memberships.find(
      (item) => item.academy.id === academyId && item.status === 'ACTIVE',
    );
  } catch {
    membership = undefined;
  }
  if (!membership) return <p className="text-sm text-danger">You do not have active access to this academy.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sub">
        Signed in to <strong className="text-ink">{membership.academy.name}</strong> as{' '}
        <strong className="text-ink">{membership.role.replace('_', ' ')}</strong>.
      </p>
      {membership.role === 'MANAGER' ? (
        <p className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900">
          Use Applications, Members, and Invitations above to manage academy access.
        </p>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          Role-specific learning features will appear here as Cove Studio development continues.
        </p>
      )}
    </div>
  );
}
