import type {
  AcademyRole,
  AuthMeResponse,
  AuthUser,
} from '@cove/shared';
import { roleCanMonitor, roleHasPermission } from '@cove/shared';

type Membership = AuthUser['memberships'][number];
type Application = AuthUser['applications'][number];

export type AcademyAccessState =
  | { kind: 'active'; membership: Membership }
  | { kind: 'suspended'; membership: Membership }
  | { kind: 'application'; application: Application }
  | { kind: 'welcome' };

/**
 * Which of the pending screen's seven states applies. This resolves the state
 * only — the copy for each lives in the `auth` namespace and is looked up by
 * the component, so this module stays free of user-visible strings and the
 * lookups stay literal enough for i18next's typed keys to check them.
 */
export type PendingStateKind =
  | 'approved'
  | 'suspended'
  | 'none'
  | 'pending'
  | 'application_approved'
  | 'rejected'
  | 'cancelled';

export type PendingStateView = {
  state: PendingStateKind;
  /** Interpolated into the heading/description copy. */
  academyName?: string;
  role?: AcademyRole;
  statusTone: 'amber' | 'green' | 'red' | 'slate';
  canCancel: boolean;
  canReapply: boolean;
};

export function resolveAcademyAccessState(
  account: AuthMeResponse,
): AcademyAccessState {
  const activeMembership = account.user.memberships.find(
    (membership) => membership.status === 'ACTIVE',
  );
  if (activeMembership) {
    return { kind: 'active', membership: activeMembership };
  }

  const suspendedMembership = account.user.memberships.find(
    (membership) => membership.status === 'SUSPENDED',
  );
  if (suspendedMembership) {
    return { kind: 'suspended', membership: suspendedMembership };
  }

  const application = account.user.applications[0];
  if (application) {
    return { kind: 'application', application };
  }

  return { kind: 'welcome' };
}

export function authDestination(account: AuthMeResponse): string {
  const state = resolveAcademyAccessState(account);
  if (state.kind === 'active') {
    const { academy } = state.membership;
    // Every role lands on the academy root, which answers to each of them
    // differently: a teaching overview, a control tower, or — since the
    // student overview shipped — the work that student left open. Sending a
    // student past it to the catalog would skip the one section that knows
    // which problem they were in the middle of.
    return `/studio/academies/${academy.id}`;
  }
  // A platform operator belongs to no academy — that is the design, not an
  // incomplete signup — so every screen below this line would tell them to ask
  // a manager for an invitation they do not need. They have somewhere to be.
  //
  // Checked after the active membership rather than before it: an operator who
  // is also a real member of a real academy is arriving as that member, and the
  // console is one click away from My Page either way.
  if (account.user.platformRole === 'ADMIN') {
    return '/platform';
  }
  if (state.kind === 'welcome') {
    return '/auth/welcome';
  }
  return '/auth/pending';
}

export function pendingStateView(
  state: AcademyAccessState,
): PendingStateView {
  if (state.kind === 'active') {
    return {
      state: 'approved',
      academyName: state.membership.academy.name,
      role: state.membership.role,
      statusTone: 'green',
      canCancel: false,
      canReapply: false,
    };
  }

  if (state.kind === 'suspended') {
    return {
      state: 'suspended',
      academyName: state.membership.academy.name,
      statusTone: 'slate',
      canCancel: false,
      canReapply: false,
    };
  }

  if (state.kind === 'welcome') {
    return {
      state: 'none',
      statusTone: 'slate',
      canCancel: false,
      canReapply: false,
    };
  }

  const academyName = state.application.academy.name;
  switch (state.application.status) {
    case 'PENDING':
      return {
        state: 'pending',
        academyName,
        statusTone: 'amber',
        canCancel: true,
        canReapply: false,
      };
    case 'APPROVED':
      return {
        state: 'application_approved',
        academyName,
        statusTone: 'green',
        canCancel: false,
        canReapply: false,
      };
    case 'REJECTED':
      return {
        state: 'rejected',
        academyName,
        statusTone: 'red',
        canCancel: false,
        canReapply: true,
      };
    case 'CANCELLED':
      return {
        state: 'cancelled',
        academyName,
        statusTone: 'slate',
        canCancel: false,
        canReapply: true,
      };
  }
}

export function canManageAcademy(role: AcademyRole | null | undefined): boolean {
  return role === 'MANAGER';
}

/**
 * Every role holds `curriculum.read`, so the Learning group is always shown —
 * a Team Lead can walk their own curriculum exactly as a student sees it. A
 * Student holds nothing else, so the People and Content gates below already
 * hide those groups without any role check specific to students.
 */
export function canLearn(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.read') : false;
}

/**
 * Who sees the student class pages.
 *
 * Deliberately the effective academy role rather than `curriculum.read`. Every
 * role holds that permission so staff can preview the curriculum they wrote,
 * and a class is a delivery relationship a Team Lead simply does not have. The
 * server refuses them either way; this keeps the nav from offering a page that
 * would only turn them away.
 */
export function isStudent(role: AcademyRole | null | undefined): boolean {
  return role === 'STUDENT';
}

export function canManageContent(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.manage') : false;
}

export function canReviewContent(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.review') : false;
}

/**
 * Class structure and enrollment are deliberately separate gates: a Team Lead
 * arranges what a class learns, but only a Manager decides who sits in it,
 * because that changes a student's access.
 */
export function canManageClasses(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'classes.manage') : false;
}

export function canManageEnrollment(
  role: AcademyRole | null | undefined,
): boolean {
  return role ? roleHasPermission(role, 'class-enrollments.manage') : false;
}

/**
 * Who may say when a class meets.
 *
 * `MANAGER` alone. §5.1 and §8.1 of the student points design: the schedule
 * decides who is paid for turning up, which makes it a setting rather than a
 * piece of curriculum — a team lead who runs the content has no reason to move
 * a class's hours.
 */
export function canManageClassSchedule(
  role: AcademyRole | null | undefined,
): boolean {
  return role ? roleHasPermission(role, 'class-schedule.manage') : false;
}

/**
 * Who may put a teacher in charge of a class. A Teacher is deliberately not on
 * this list: they hold `classes.assigned.manage`, which is about what they do
 * with their own classes, never about choosing who runs one.
 */
export function canManageClassTeachers(
  role: AcademyRole | null | undefined,
): boolean {
  return role ? roleHasPermission(role, 'class-teachers.manage') : false;
}

/**
 * Who sees the teacher's own monitoring surface.
 *
 * Deliberately not `classes.assigned.manage` on its own: a Team Lead holds
 * that permission for later operational reasons, and the shared predicate is
 * what keeps the nav in step with what the server will actually allow. Seeing
 * the link still proves nothing — every page and every socket event
 * re-checks the assignment itself.
 */
export function canMonitorClasses(
  role: AcademyRole | null | undefined,
): boolean {
  return role ? roleCanMonitor(role) : false;
}

export function canManageExercises(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'exercises.manage') : false;
}

export function canPublishContent(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.publish') : false;
}

export function academyRoleFor(
  account: AuthMeResponse,
  academyId: string,
): AcademyRole | null {
  return account.user.memberships.find(
    (membership) =>
      membership.status === 'ACTIVE' && membership.academy.id === academyId,
  )?.role ?? null;
}
