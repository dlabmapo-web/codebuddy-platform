import { academyRoles, invitationStatuses } from '@cove/shared';
import { formatDate } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, type ReactNode } from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { useLayoutTranslation, useLocale } from '@/i18n';

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

export function InvitationsTable({
  manager,
  toolbarActions,
}: {
  manager: InvitationsManagerState;
  toolbarActions?: ReactNode;
}) {
  const { t } = useLayoutTranslation(['invitations', 'common']);
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
            <div className="flex justify-end">
              <Button
                className="hover:border-danger hover:text-danger"
                disabled={manager.revokePending}
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
    [locale, manager, t],
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
