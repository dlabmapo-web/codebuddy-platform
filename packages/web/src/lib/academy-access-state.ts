import type {
  AcademyRole,
  AuthMeResponse,
  AuthUser,
} from '@cove/shared';

type Membership = AuthUser['memberships'][number];
type Application = AuthUser['applications'][number];

export type AcademyAccessState =
  | { kind: 'active'; membership: Membership }
  | { kind: 'suspended'; membership: Membership }
  | { kind: 'application'; application: Application }
  | { kind: 'welcome' };

export type PendingStateView = {
  heading: string;
  description: string;
  statusLabel: string | null;
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
      heading: "You're approved",
      description: `${state.membership.academy.name} approved you as ${formatRole(state.membership.role)}. Your current session already has access.`,
      statusLabel: 'Active',
      statusTone: 'green',
      canCancel: false,
      canReapply: false,
    };
  }

  if (state.kind === 'suspended') {
    return {
      heading: 'Academy access suspended',
      description: `Your access to ${state.membership.academy.name} is suspended. Contact an academy manager if you believe this is a mistake.`,
      statusLabel: 'Suspended',
      statusTone: 'slate',
      canCancel: false,
      canReapply: false,
    };
  }

  if (state.kind === 'welcome') {
    return {
      heading: 'No academy application',
      description: 'No academy membership or application is associated with this account.',
      statusLabel: null,
      statusTone: 'slate',
      canCancel: false,
      canReapply: false,
    };
  }

  const academyName = state.application.academy.name;
  switch (state.application.status) {
    case 'PENDING':
      return {
        heading: 'Waiting for academy approval',
        description: `${academyName} is reviewing your application. Student is the default role, but the manager may select another academy role.`,
        statusLabel: 'Pending',
        statusTone: 'amber',
        canCancel: true,
        canReapply: false,
      };
    case 'APPROVED':
      return {
        heading: 'Application approved',
        description: `${academyName} approved your application. Your academy membership is being prepared.`,
        statusLabel: 'Approved',
        statusTone: 'green',
        canCancel: false,
        canReapply: false,
      };
    case 'REJECTED':
      return {
        heading: 'Application not approved',
        description: `${academyName} did not approve your application. You may apply again if your circumstances change.`,
        statusLabel: 'Rejected',
        statusTone: 'red',
        canCancel: false,
        canReapply: true,
      };
    case 'CANCELLED':
      return {
        heading: 'Application cancelled',
        description: `Your application to ${academyName} was cancelled. You may apply again.`,
        statusLabel: 'Cancelled',
        statusTone: 'slate',
        canCancel: false,
        canReapply: true,
      };
  }
}

export function canManageAcademy(role: AcademyRole | null | undefined): boolean {
  return role === 'MANAGER';
}

function formatRole(role: Membership['role']): string {
  return role.replace('_', ' ');
}
