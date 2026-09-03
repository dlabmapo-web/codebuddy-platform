'use client';

import { Plus, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  academyRoles,
  canCombineAcademyRoles,
  isStudentRoleSet,
  type AcademyRole,
} from '@cove/shared';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * Every role one member holds in this academy, and the way to change the set.
 *
 * Separate from the roster's inline role dropdown, which replaces the single
 * primary role. That control answers "what is this person"; this one answers
 * "what else are they" — the director who also teaches a class and also writes
 * the curriculum, who before this had to be given the widest role and lost the
 * surfaces of the others.
 *
 * Grants are offered rather than assumed: a role that cannot be combined is
 * never rendered as a choice, so the API's refusal is a backstop rather than
 * the way a manager discovers the rule.
 */
export function MemberRolesPanel({
  academyId,
  membershipId,
  initialRoles,
}: {
  academyId: string;
  membershipId: string;
  initialRoles: readonly AcademyRole[];
}) {
  const { t } = useTranslation('profile');
  const { t: tCommon } = useLayoutTranslation('common');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [roles, setRoles] = useState<readonly AcademyRole[]>(initialRoles);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function applied(next: readonly AcademyRole[]) {
    setRoles(next);
    setError(null);
    setAdding(false);
    // Both readers of this member's roles, by the keys they actually use:
    // the paginated roster and the members list the applications flow shares.
    // React Query matches a key by prefix, so these have to be the real
    // prefixes — a near-miss invalidates nothing and fails silently.
    void queryClient.invalidateQueries({
      queryKey: ['academy-people', academyId],
    });
    void queryClient.invalidateQueries({
      queryKey: ['academy', academyId, 'members'],
    });
  }

  const grant = useMutation({
    mutationFn: (role: AcademyRole) =>
      orpc.academyMembers.grantRole({ academyId, membershipId, role }),
    onSuccess: (member) => applied(member.roles),
    onError: (cause) => setError(errorText(cause)),
  });

  const revoke = useMutation({
    mutationFn: (role: AcademyRole) =>
      orpc.academyMembers.revokeRole({ academyId, membershipId, role }),
    onSuccess: (member) => applied(member.roles),
    onError: (cause) => setError(errorText(cause)),
  });

  const busy = grant.isPending || revoke.isPending;
  const isStudent = isStudentRoleSet(roles);
  // Only roles that may actually join this set. A student is offered nothing,
  // because STUDENT combines with no staff role in either direction.
  const grantable = academyRoles.filter(
    (role) => !roles.includes(role) && canCombineAcademyRoles([...roles, role]),
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="size-5 text-sub" strokeWidth={1.75} />
        <h2 className="text-[16px] font-bold text-ink">{t('roles.title')}</h2>
      </div>
      <p className="mb-4 text-[13px] leading-5 text-sub">{t('roles.hint')}</p>

      <ul className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <li
            className="flex items-center gap-1.5 rounded-lg border border-border bg-canvas py-1.5 pl-3 pr-1.5 text-[14px] font-semibold text-ink"
            key={role}
          >
            {tCommon(`role.${role}`)}
            {/*
              A member with one role has no remove button. Removing the last
              one would leave a membership that grants nothing, which is not a
              membership — the action for that is removing the member, and it
              lives on the roster with its own confirmation.
            */}
            {roles.length > 1 ? (
              <button
                aria-label={t('roles.remove_role', {
                  role: tCommon(`role.${role}`),
                })}
                className="rounded p-1 text-sub transition-colors hover:bg-surface hover:text-danger disabled:opacity-40"
                disabled={busy}
                onClick={() => revoke.mutate(role)}
                type="button"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {isStudent ? (
        <p className="mt-3 text-[13px] leading-5 text-sub">
          {t('roles.student_exclusive')}
        </p>
      ) : adding ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {grantable.map((role) => (
            <button
              className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-1.5 text-[14px] font-semibold text-brand transition-colors hover:bg-brand/10 disabled:opacity-40"
              disabled={busy}
              key={role}
              onClick={() => grant.mutate(role)}
              type="button"
            >
              {tCommon(`role.${role}`)}
            </button>
          ))}
          <button
            className="rounded-lg px-3 py-1.5 text-[14px] font-semibold text-sub transition-colors hover:text-ink"
            onClick={() => setAdding(false)}
            type="button"
          >
            {t('roles.cancel')}
          </button>
        </div>
      ) : grantable.length > 0 ? (
        <button
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[14px] font-semibold text-sub transition-colors hover:border-ink/25 hover:text-ink disabled:opacity-40"
          disabled={busy}
          onClick={() => setAdding(true)}
          type="button"
        >
          <Plus className="size-4" />
          {t('roles.add')}
        </button>
      ) : null}

      {error ? (
        <p aria-live="polite" className="mt-3 text-[14px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
