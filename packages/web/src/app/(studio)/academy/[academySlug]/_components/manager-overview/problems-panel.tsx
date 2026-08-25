'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { AuditSummary, DifficultProblem } from '@cove/shared';
import { isAcademyAuditAction } from '@cove/shared';
import { CircleCheckBig, Flame, History } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { meterWidth } from '../../_lib/overview-view';
import { solutionStatusPath } from '../../_lib/overview-url';
import { EmptyState, Panel } from '../overview-ui/panel';

/**
 * The exercises the academy is stuck on.
 *
 * Red, because this is the one section that names something blocking students
 * right now. It is also the section where colour is most likely to be
 * misapplied, so the rule is exact: the hue belongs to the *problem*, never to
 * the students who attempted it. There is no row here about a child.
 *
 * The solve rate is drawn as a bar and stated as a fraction of students, not of
 * submissions. §9.7 — one child retrying twenty times raises the attempt count
 * and nothing else, and a rate over submissions would make a problem look hard
 * because one determined student would not give up on it.
 */
export function ProblemsPanel({
  academyId,
  isStale,
  problems,
}: {
  academyId: string;
  isStale: boolean;
  problems: DifficultProblem[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('manager');

  return (
    <Panel
      description={t('problems.description')}
      icon={Flame}
      id="manager-problems"
      meta={
        problems.length > 0
          ? t('problems.meta', { count: problems.length })
          : undefined
      }
      testId="manager-problems"
      title={t('problems.title')}
      tone="danger"
    >
      {problems.length === 0 ? (
        <EmptyState
          body={t('problems.empty_body')}
          icon={CircleCheckBig}
          title={t('problems.empty_title')}
          tone="success"
        />
      ) : (
        <ul className="divide-y divide-border">
          {problems.map((problem) => {
            const href = solutionStatusPath({
              academySlug,
              classId: problem.classId,
              materialId: problem.materialId,
              view: 'problems',
            });
            return (
              <li
                className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5"
                key={problem.materialId}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    {problem.outlineNumber ? (
                      <span className="font-mono text-[11px] font-bold text-danger">
                        {problem.outlineNumber}
                      </span>
                    ) : null}
                    <span className="truncate text-[13.5px] font-bold">
                      {problem.title}
                    </span>
                  </p>
                  {/* The curriculum path, so a manager who does not teach can
                      still say where the problem lives when they raise it. */}
                  <p className="mt-0.5 truncate text-[11.5px] text-sub">
                    {problem.courseTitle} · {problem.moduleTitle} ·{' '}
                    {problem.lectureTitle}
                  </p>
                </div>

                <div className="flex w-full shrink-0 items-center gap-3 sm:w-auto">
                  <div className="min-w-0 flex-1 sm:w-44">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[15px] font-extrabold tabular-nums text-danger">
                        {t('percent', { value: problem.solveRate })}
                      </span>
                      <span className="truncate text-[11px] text-sub">
                        {t('problems.solve_rate', {
                          attempting: problem.attemptingStudents,
                          solved: problem.solvedStudents,
                        })}
                      </span>
                    </p>
                    <span
                      aria-hidden
                      className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-accent"
                    >
                      <span
                        className="block h-full rounded-full bg-danger"
                        style={{ width: meterWidth(problem.solveRate) }}
                      />
                    </span>
                    <p className="mt-1 text-[10.5px] text-sub">
                      {t('problems.submissions', { count: problem.submissions })}
                    </p>
                  </div>

                  {href ? (
                    <Link
                      className={cn(
                        'shrink-0 rounded-lg border border-danger/30 px-2.5 py-1.5 text-[12px] font-bold text-danger',
                        'transition-colors hover:bg-danger/10',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        isStale && 'pointer-events-none opacity-50',
                      )}
                      href={href}
                      tabIndex={isStale ? -1 : undefined}
                    >
                      {t('problems.open')}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/**
 * What changed in the academy, as a timeline.
 *
 * Slate, and deliberately the quietest section on the page. It is history
 * rather than work: nothing here needs a decision, and a coloured audit trail
 * would compete with the queue at the top for a manager's attention while
 * asking for none of it.
 *
 * §9.9 — an entry is an actor, a verb, a target label, and a time. The before
 * and after values stay in the audit record and are never fetched: this
 * dashboard sits open on a staffroom screen all day, and a diff of a member's
 * details is not something to leave there.
 */
export function ChangesPanel({ changes }: { changes: AuditSummary[] }) {
  const { t, i18n } = useTranslation('manager');
  // The action vocabulary is its own namespace: it mirrors a server-side list
  // that grows with every feature that writes an audit record.
  const { t: tAudit } = useTranslation('audit');

  return (
    <Panel
      description={t('changes.description')}
      icon={History}
      id="manager-changes"
      testId="manager-changes"
      title={t('changes.title')}
      tone="brand"
    >
      {changes.length === 0 ? (
        <EmptyState
          body={t('changes.empty_body')}
          icon={History}
          title={t('changes.empty_title')}
          tone="brand"
        />
      ) : (
        <ol className="flex flex-col px-4 py-3.5">
          {changes.map((change, index) => (
            <li className="flex gap-3" key={change.id}>
              {/* The rail, drawn per row rather than as one absolute line: the
                  rows are different heights, and an absolutely positioned line
                  would either overshoot the last entry or stop short of it. */}
              <div className="flex flex-col items-center">
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-retired"
                />
                {index < changes.length - 1 ? (
                  <span aria-hidden className="w-px flex-1 bg-border" />
                ) : null}
              </div>

              <div className={cn('min-w-0 flex-1', index < changes.length - 1 && 'pb-3.5')}>
                <p className="text-[13px] font-bold leading-snug">
                  {/* An unrecognised action still prints, as its stable code.
                      A change that happened and cannot be named is still a
                      change a manager should see, and a silently dropped row
                      would make the history quietly incomplete. */}
                  {isAcademyAuditAction(change.action)
                    ? tAudit(`action.${change.action}`)
                    : tAudit('action.fallback', { action: change.action })}
                  {change.targetLabel ? (
                    <span className="font-extrabold"> · {change.targetLabel}</span>
                  ) : namesOneRecord(change.targetType) ? (
                    // The record existed and has since been deleted. Worth
                    // saying: the change is still part of the academy's
                    // history even though what it changed is gone.
                    <span className="font-normal italic text-sub">
                      {' '}
                      · {t('changes.unknown_target')}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-sub">
                  <span>
                    {t('changes.by', {
                      actor: change.actorName ?? t('changes.system'),
                    })}
                  </span>
                  <span className="font-mono tabular-nums">
                    {new Intl.DateTimeFormat(i18n.language, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(change.createdAt))}
                  </span>
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/**
 * Whether this entry is about one record, or about an operation.
 *
 * A bulk suspension and an import are not *about* a member or a class — they
 * are about forty of them — so they carry no target label by design. Without
 * this they inherited the deleted-record fallback and reported "Suspended
 * members in bulk · a removed record", which is alarming and untrue.
 */
function namesOneRecord(targetType: string): boolean {
  return targetType !== 'PeopleBulkOperation' && targetType !== 'PeopleImportSession';
}
