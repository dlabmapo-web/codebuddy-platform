import type { InvitationDelivery } from '@cove/shared';
import { academyRoles, invitationStatuses } from '@cove/shared';
import { formatDate } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import type {
  AcademyInvitation,
  InvitationsManagerState,
} from '../_hooks/use-invitations-manager';

const statusTone: Record<string, string> = {
  PENDING: 'bg-draft-soft text-draft',
  ACCEPTED: 'bg-success/10 text-success',
  REVOKED: 'bg-danger/10 text-danger',
  EXPIRED: 'bg-retired-soft text-retired',
};

function StatusBadge({ status }: { status: AcademyInvitation['status'] }) {
  const { t } = useLayoutTranslation('common');
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${
        statusTone[status] ?? 'bg-retired-soft text-retired'
      }`}
    >
      {t(`invitation_status.${status}`)}
    </span>
  );
}

/**
 * §13 — what the provider said, and no more.
 *
 * The five states are a ladder of evidence rather than a progress bar, and the
 * colours say so: only DELIVERED is green, because it is the only one backed by
 * an authenticated event from the receiving side. SENT is deliberately blue and
 * not green — the provider accepted the message, and nobody has yet said it
 * arrived. A manager reading this column must never conclude "delivered" from
 * "sent", and a shared hue would invite exactly that.
 *
 * The title carries the sentence, so hovering explains what the badge claims.
 */
const deliveryTone: Record<InvitationDelivery['state'], string> = {
  QUEUED: 'bg-accent text-sub',
  SENT: 'bg-brand/10 text-brand',
  DELIVERED: 'bg-success/10 text-success',
  BOUNCED: 'bg-danger/10 text-danger',
  FAILED: 'bg-warning/10 text-warning',
};

function DeliveryBadge({ delivery }: { delivery: InvitationDelivery | null }) {
  const { t } = useTranslation('people-ops');
  if (!delivery) {
    return (
      <span className="whitespace-nowrap text-[12.5px] italic text-sub">
        {t('delivery.not_sent')}
      </span>
    );
  }
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span
        className={cn(
          'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold',
          deliveryTone[delivery.state],
        )}
        title={t(`delivery.state_help.${delivery.state}`)}
      >
        {t(`delivery.state.${delivery.state}`)}
      </span>
      {/* The attempt number is the resend history, in one figure. A manager
          looking at "Attempt 3 · bounced" knows the address is the problem. */}
      {delivery.attemptNumber > 1 ? (
        <span className="text-[10.5px] text-sub">
          {t('delivery.attempt', { count: delivery.attemptNumber })}
        </span>
      ) : null}
    </span>
  );
}

export function InvitationsTable({
  manager,
  toolbarActions,
}: {
  manager: InvitationsManagerState;
  toolbarActions?: ReactNode;
}) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
  const { t: tOps } = useTranslation('people-ops');
  const locale = useLocale();

  const columns = useMemo<ColumnDef<AcademyInvitation>[]>(
    () => [
      {
        id: 'email',
        accessorFn: (invitation) => invitation.email,
        header: t('column.email'),
        cell: ({ row }) => (
          <span className="font-semibold">{row.original.email}</span>
        ),
      },
      {
        id: 'status',
        accessorFn: (invitation) => invitation.status,
        header: t('column.status'),
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'role',
        accessorFn: (invitation) => invitation.role,
        header: t('column.role'),
        filterFn: 'arrIncludesSome',
        // Seniority, not alphabet: managers first, students last.
        sortingFn: (a, b) =>
          academyRoles.indexOf(b.original.role) -
          academyRoles.indexOf(a.original.role),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[14px]">
            {t(`common:role.${row.original.role}`)}
          </span>
        ),
      },
      {
        id: 'delivery',
        accessorFn: (invitation) => invitation.delivery?.state ?? '',
        header: tOps('delivery.column_delivery'),
        enableSorting: false,
        cell: ({ row }) => <DeliveryBadge delivery={row.original.delivery} />,
      },
      {
        id: 'expires',
        accessorFn: (invitation) => invitation.expiresAt,
        header: t('column.expires'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatDate(row.original.expiresAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('column.actions'),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.status === 'PENDING' ? (
            <div className="flex justify-end gap-2">
              {/* Resend rotates the token, so the old link stops working. The
                  hint says so on hover — a manager resending because they think
                  the first link went astray is relying on exactly that. */}
              <Button
                disabled={manager.resendPending || manager.revokePending}
                onClick={() => manager.resend(row.original.id)}
                size="sm"
                title={tOps('delivery.resend_hint')}
                variant="outline"
              >
                {manager.resendPending && manager.resendingId === row.original.id
                  ? tOps('delivery.resending')
                  : tOps('delivery.resend')}
              </Button>
              <Button
                className="hover:border-danger hover:text-danger"
                disabled={manager.revokePending || manager.resendPending}
                onClick={() => manager.revoke(row.original.id)}
                size="sm"
                variant="outline"
              >
                {t('revoke')}
              </Button>
            </div>
          ) : (
            <span className="flex justify-end text-[13px] text-sub">
              {t('common:state.no_actions')}
            </span>
          ),
      },
    ],
    [locale, manager, t, tOps],
  );

  const facets = useMemo(
    () => [
      {
        columnId: 'status',
        title: t('column.status'),
        options: invitationStatuses.map((status) => ({
          label: t(`common:invitation_status.${status}`),
          value: status,
        })),
      },
      {
        columnId: 'role',
        title: t('column.role'),
        options: academyRoles.map((role) => ({
          label: t(`common:role.${role}`),
          value: role,
        })),
      },
    ],
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={manager.invitations}
      emptyMessage={t('empty')}
      facets={facets}
      pageSize={15}
      searchPlaceholder={t('search_placeholder')}
      toolbarActions={toolbarActions}
    />
  );
}
