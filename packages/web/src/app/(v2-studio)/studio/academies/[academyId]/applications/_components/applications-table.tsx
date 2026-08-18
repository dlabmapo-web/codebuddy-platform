import { joinRequestStatuses } from '@cove/shared';
import { formatDate } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation, useLocale } from '@/i18n';

import type {
  ApplicationRequest,
  ApplicationsManagerState,
} from '../_hooks/use-applications-manager';

const statusTone: Record<string, string> = {
  PENDING: 'bg-draft-soft text-draft',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
  CANCELLED: 'bg-retired-soft text-retired',
};

function StatusBadge({ status }: { status: ApplicationRequest['status'] }) {
  const { t } = useLayoutTranslation('common');
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${
        statusTone[status] ?? 'bg-retired-soft text-retired'
      }`}
    >
      {t(`join_request_status.${status}`)}
    </span>
  );
}

export function ApplicationsTable({
  manager,
  onReview,
}: {
  manager: ApplicationsManagerState;
  onReview: (request: ApplicationRequest) => void;
}) {
  const { t } = useLayoutTranslation(['applications', 'common']);
  const locale = useLocale();

  const columns = useMemo<ColumnDef<ApplicationRequest>[]>(
    () => [
      {
        id: 'applicant',
        accessorFn: (request) =>
          `${request.user.displayName ?? ''} ${request.user.email ?? ''}`,
        header: t('column.applicant'),
        cell: ({ row }) => {
          const { user } = row.original;
          const name =
            user.displayName ?? user.email ?? t('common:fallback.user');
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              {/* An applicant is not a member yet, so only their own account
                  photo exists to show — the chain falls through to the
                  placeholder, which is the honest picture of somebody the
                  academy has not met. */}
              <ProfileAvatar
                externalAvatarUrl={user.externalAvatarUrl}
                globalImageUrl={user.globalImageUrl}
                name={name}
                size="sm"
              />
              <div className="min-w-0">
                <p className="truncate font-semibold">{name}</p>
                <p className="truncate text-[13px] text-sub">{user.email}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'message',
        accessorFn: (request) => request.message ?? '',
        header: t('column.message'),
        enableSorting: false,
        cell: ({ row }) => (
          <p className="line-clamp-2 max-w-sm text-[13.5px] text-sub">
            {row.original.message || t('no_message')}
          </p>
        ),
      },
      {
        id: 'status',
        accessorFn: (request) => request.status,
        header: t('column.status'),
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'applied',
        accessorFn: (request) => request.createdAt,
        header: t('column.applied'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatDate(row.original.createdAt, locale)}
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
                disabled={manager.reviewPending}
                onClick={() => onReview(row.original)}
                size="sm"
              >
                {t('review')}
              </Button>
            </div>
          ) : (
            <span className="flex justify-end text-[13px] text-sub">
              {t('common:state.no_actions')}
            </span>
          ),
      },
    ],
    [locale, manager.reviewPending, onReview, t],
  );

  const facets = useMemo(
    () => [
      {
        columnId: 'status',
        title: t('column.status'),
        options: joinRequestStatuses.map((status) => ({
          label: t(`common:join_request_status.${status}`),
          value: status,
        })),
      },
    ],
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={manager.requests}
      emptyMessage={t('empty')}
      facets={facets}
      pageSize={15}
      searchPlaceholder={t('search_placeholder')}
    />
  );
}
