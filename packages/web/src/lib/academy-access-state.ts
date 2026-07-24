import type {
  AcademyRole,
  AuthMeResponse,
  AuthUser,
} from '@cove/shared';
import { roleHasPermission } from '@cove/shared';

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
    return `/studio/academies/${state.membership.academy.id}`;
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

export function canManageContent(role: AcademyRole | null | undefined): boolean {
  return role ? roleHasPermission(role, 'curriculum.manage') : false;
}
