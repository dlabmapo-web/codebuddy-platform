import type { AuthMeResponse } from '@cove/shared';

import type { TranslationKey } from '@/i18n';
import {
  pendingStateView,
  type PendingStateKind,
} from '@/lib/academy-access-state';

export const stateCopy: Record<
  PendingStateKind,
  {
    heading: TranslationKey<'auth'>;
    description: TranslationKey<'auth'>;
    status: `common:${TranslationKey<'common'>}` | null;
  }
> = {
  approved: {
    heading: 'pending.state.approved_heading',
    description: 'pending.state.approved_description',
    status: 'common:membership_status.ACTIVE',
  },
  suspended: {
    heading: 'pending.state.suspended_heading',
    description: 'pending.state.suspended_description',
    status: 'common:membership_status.SUSPENDED',
  },
  none: {
    heading: 'pending.state.none_heading',
    description: 'pending.state.none_description',
    status: null,
  },
  pending: {
    heading: 'pending.state.pending_heading',
    description: 'pending.state.pending_description',
    status: 'common:join_request_status.PENDING',
  },
  application_approved: {
    heading: 'pending.state.application_approved_heading',
    description: 'pending.state.application_approved_description',
    status: 'common:join_request_status.APPROVED',
  },
  rejected: {
    heading: 'pending.state.rejected_heading',
    description: 'pending.state.rejected_description',
    status: 'common:join_request_status.REJECTED',
  },
  cancelled: {
    heading: 'pending.state.cancelled_heading',
    description: 'pending.state.cancelled_description',
    status: 'common:join_request_status.CANCELLED',
  },
};

export function statusToneClass(
  tone: ReturnType<typeof pendingStateView>['statusTone'],
) {
  switch (tone) {
    case 'green':
      return 'text-success';
    case 'red':
      return 'text-danger';
    case 'slate':
      return 'text-retired';
    case 'amber':
      return 'text-amber-700';
  }
}

export function pendingIconKind(
  kind: 'active' | 'suspended' | 'welcome' | 'application',
  status?: AuthMeResponse['user']['applications'][number]['status'],
) {
  if (kind === 'active' || status === 'APPROVED') return 'approved';
  if (kind === 'suspended') return 'suspended';
  if (kind === 'welcome') return 'none';
  if (status === 'REJECTED') return 'rejected';
  return 'pending';
}
