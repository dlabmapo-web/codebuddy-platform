import { StudentPresenceProvider } from '@/lib/monitoring/student-presence';
import { createServerORPCClient } from '@/lib/orpc-server';

/**
 * Holds the student's presence for as long as they are inside this academy.
 *
 * A layout rather than something inside `StudioShell`: the shell is composed
 * per page, so it would unmount on every navigation and take the socket with
 * it — a student clicking between their courses would flicker through
 * Reconnecting on the teacher's roster. This persists across every page under
 * the academy, which is the lifetime presence actually has.
 *
 * Only students publish. A teacher's signals would be dropped by the gateway
 * anyway, but a heartbeat every fifteen seconds per teacher, sent to be
 * discarded, is noise nobody needs.
 */
export default async function AcademyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;

  let isStudent = false;
  try {
    const account = await createServerORPCClient().auth.me({});
    isStudent = account.user.memberships.some(
      (membership) =>
        membership.academy.id === academyId &&
        membership.status === 'ACTIVE' &&
        membership.role === 'STUDENT',
    );
  } catch {
    // Presence is not what this page is for. A failed lookup costs the student
    // their row on a roster; it must not cost them their coursework.
    isStudent = false;
  }

  if (!isStudent) return children;

  return (
    <StudentPresenceProvider academyId={academyId}>
      {children}
    </StudentPresenceProvider>
  );
}
