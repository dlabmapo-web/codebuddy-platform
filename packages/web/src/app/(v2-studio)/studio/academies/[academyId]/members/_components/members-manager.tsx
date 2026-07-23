'use client';

import type { AcademyRole } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { orpc } from '@/lib/orpc';

const roles: AcademyRole[] = ['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER'];

export function MembersManager({ academyId }: { academyId: string }) {
  const queryClient = useQueryClient();
  const members = useQuery({
    queryKey: ['academy', academyId, 'members'],
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
        ? orpc.academyMembers.suspend({ academyId, membershipId: operation.membershipId })
        : orpc.academyMembers.restore({ academyId, membershipId: operation.membershipId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academy', academyId, 'members'] });
    },
  });

  if (members.isPending) return <p className="text-sm text-sub">Loading members…</p>;
  if (members.isError) return <p className="text-sm text-danger">You cannot view this academy&apos;s members.</p>;

  return (
    <div className="space-y-3">
      {members.data.members.map((membership) => (
        <article className="grid gap-3 rounded-xl border border-border p-4 md:grid-cols-[1fr_180px_auto]" key={membership.id}>
          <div>
            <h2 className="font-bold">{membership.user.displayName ?? membership.user.email ?? 'Cove user'}</h2>
            <p className="text-sm text-sub">{membership.user.email} · {membership.status}</p>
          </div>
          <select
            className="h-11 rounded-lg border border-border bg-white px-3 text-sm disabled:opacity-60"
            disabled={update.isPending || membership.status !== 'ACTIVE'}
            onChange={(event) => update.mutate({
              kind: 'role',
              membershipId: membership.id,
              role: event.target.value as AcademyRole,
            })}
            value={membership.role}
          >
            {roles.map((role) => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
          </select>
          {membership.status === 'ACTIVE' ? (
            <button
              className="h-11 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 disabled:opacity-50"
              disabled={update.isPending}
              onClick={() => update.mutate({ kind: 'suspend', membershipId: membership.id })}
              type="button"
            >
              Suspend
            </button>
          ) : membership.status === 'SUSPENDED' ? (
            <button
              className="h-11 rounded-lg bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
              disabled={update.isPending}
              onClick={() => update.mutate({ kind: 'restore', membershipId: membership.id })}
              type="button"
            >
              Restore
            </button>
          ) : <span className="text-sm text-sub">No actions</span>}
        </article>
      ))}
      {update.isError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          The membership could not be updated. The academy must retain one active manager.
        </p>
      ) : null}
    </div>
  );
}
