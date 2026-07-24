import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { useLayoutTranslation } from '@/i18n';
import { RoleSelector } from '../../_components/role-selector';

import type {
  AcademyMember,
  MembersManagerState,
} from '../_hooks/use-members-manager';

export function MembersTable({
  manager,
}: {
  manager: MembersManagerState;
}) {
  const { t } = useLayoutTranslation(['members', 'common']);
  const columns = useMemo<ColumnDef<AcademyMember>[]>(
    () => [
      {
        id: 'member',
        accessorFn: (member) =>
          `${member.user.displayName ?? ''} ${member.user.email ?? ''}`,
        header: t('column.member'),
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="min-w-0">
              <p className="font-semibold">
                {member.user.displayName ??
                  member.user.email ??
                  t('common:fallback.user')}
              </p>
              <p className="truncate text-[13px] text-sub">
                {member.user.email}
              </p>
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorFn: (member) => member.status,
        header: t('column.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'role',
        accessorFn: (member) => member.role,
        header: t('column.role'),
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="w-40">
              <RoleSelector
                disabled={
                  manager.updatePending || member.status !== 'ACTIVE'
                }
                onChange={(role) => manager.changeRole(member.id, role)}
                value={member.role}
              />
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          if (member.status === 'ACTIVE') {
            return (
              <Button
                className="hover:border-danger hover:text-danger"
                disabled={manager.updatePending}
                onClick={() => manager.suspend(member.id)}
                size="sm"
                variant="outline"
              >
                {t('action.suspend')}
              </Button>
            );
          }
          if (member.status === 'SUSPENDED') {
            return (
              <Button
                disabled={manager.updatePending}
                onClick={() => manager.restore(member.id)}
                size="sm"
              >
                {t('action.restore')}
              </Button>
            );
          }
          return (
            <span className="text-[13px] text-sub">
              {t('common:state.no_actions')}
            </span>
          );
        },
      },
    ],
    [manager, t],
  );

  return (
    <DataTable
      columns={columns}
      data={manager.members}
      emptyMessage={t('empty')}
      pageSize={15}
      searchPlaceholder={t('search_placeholder')}
    />
  );
}

function StatusBadge({ status }: { status: AcademyMember['status'] }) {
  const { t } = useLayoutTranslation('common');
  const tone =
    status === 'ACTIVE'
      ? 'bg-brand-soft text-brand'
      : status === 'SUSPENDED'
        ? 'bg-draft-soft text-draft'
        : 'bg-retired-soft text-retired';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-bold ${tone}`}
    >
      {t(`membership_status.${status}`)}
    </span>
  );
}
