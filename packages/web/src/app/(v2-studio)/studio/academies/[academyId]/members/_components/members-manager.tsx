'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { Skeleton } from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { RoleSelector } from '../../_components/role-selector';

type Member = {
  id: string;
  user: { id: string; email: string | null; displayName: string | null };
  role: AcademyRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED' | 'LEFT';
};

export function MembersManager({ academyId }: { academyId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['academy', academyId, 'members'];

  const members = useQuery({
    queryKey,
    queryFn: () => orpc.academyMembers.list({ academyId }),
    retry: false,
  });

  const update = useMutation({
    mutationFn: (
      operation:
        | { kind: 'role'; membershipId: string; role: AcademyRole }
        | { kind: 'suspend' | 'restore'; membershipId: string },
    ) => {
      if (operation.kind === 'role') {
        return orpc.academyMembers.changeRole({
          academyId,
          membershipId: operation.membershipId,
          role: operation.role,
        });
      }
      return operation.kind === 'suspend'
        ? orpc.academyMembers.suspend({
            academyId,
            membershipId: operation.membershipId,
          })
        : orpc.academyMembers.restore({
            academyId,
            membershipId: operation.membershipId,
          });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const pending = update.isPending;

  const columns = React.useMemo<ColumnDef<Member>[]>(
    () => [
      {
        id: 'member',
        accessorFn: (member) =>
          `${member.user.displayName ?? ''} ${member.user.email ?? ''}`,
        header: 'Member',
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="min-w-0">
              <p className="font-semibold">
                {member.user.displayName ?? member.user.email ?? 'Cove user'}
              </p>
              <p className="truncate text-[13px] text-sub">{member.user.email}</p>
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorFn: (member) => member.status,
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'role',
        accessorFn: (member) => member.role,
        header: 'Role',
        enableSorting: false,
        cell: ({ row }) => {
          const member = row.original;
          return (
            <div className="w-40">
              <RoleSelector
                disabled={pending || member.status !== 'ACTIVE'}
                onChange={(role) =>
                  update.mutate({ kind: 'role', membershipId: member.id, role })
                }
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
                // Calm until hover, then it admits it is a destructive action.
                className="hover:border-danger hover:text-danger"
                disabled={pending}
                onClick={() =>
                  update.mutate({ kind: 'suspend', membershipId: member.id })
                }
                size="sm"
                variant="outline"
              >
                Suspend
              </Button>
            );
          }
          if (member.status === 'SUSPENDED') {
            return (
              <Button
                disabled={pending}
                onClick={() =>
                  update.mutate({ kind: 'restore', membershipId: member.id })
                }
                size="sm"
              >
                Restore
              </Button>
            );
          }
          return <span className="text-[13px] text-sub">No actions</span>;
        },
      },
    ],
    [pending, update],
  );

  if (members.isPending) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton className="h-14 w-full" key={row} />
        ))}
      </div>
    );
  }

  if (members.isError) {
    return (
      <p className="text-[14px] font-semibold text-danger">
        You cannot view this academy&apos;s members.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={members.data.members as Member[]}
        emptyMessage="No members yet. Invite someone to get started."
        pageSize={15}
        searchPlaceholder="Search by name or email"
      />
      {update.isError ? (
        <p className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          The membership could not be updated. An academy must keep at least one
          active manager.
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: Member['status'] }) {
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
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}
