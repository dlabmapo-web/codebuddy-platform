'use client';

import { formatDateTime } from '@cove/i18n/format';
import { ChevronDown, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import type { ProgressState } from '../_hooks/use-teacher-progress';
import { useProblemStudentsQuery } from '../_hooks/use-teacher-progress';
import { AttemptHistory } from './attempt-history';
import { AttentionReasons } from './attention-reasons';
import {
  DataGrid,
  Duration,
  Pager,
  Panel,
  RegionError,
  RegionLoading,
  StatusBadge,
  Td,
  Th,
} from './progress-primitives';

/**
 * Who is where on one problem.
 *
 * The end of the By-problem drill-down and the point where the two lenses
 * meet: selecting a student here opens the same attempt history the roster
 * opens, from the same contract. There is one history in this feature, not
 * two that look alike.
 *
 * Ordering puts students with a reason first, then unsolved before solved. A
 * teacher opened this problem to find out who is stuck on it, and a solved
 * student is the one row that cannot answer that.
 */
export function ProblemStudents({
  academyId,
  classId,
  onClose,
  state,
}: {
  academyId: string;
  classId: string;
  onClose: () => void;
  state: ProgressState;
}) {
  const { t } = useTranslation('teach');
  const locale = useLocale();
  const problem = useProblemStudentsQuery({ academyId, classId }, state.settled);
  const heading = React.useRef<HTMLHeadingElement>(null);

  const [openStudent, setOpenStudent] = React.useState<string | null>(null);
  const [attemptPage, setAttemptPage] = React.useState(1);

  // Same rule as the student panel: a selection from the previous problem is
  // cleared while rendering the new one, never after it has already painted.
  const [openFor, setOpenFor] = React.useState(state.settled.materialId);
  if (openFor !== state.settled.materialId) {
    setOpenFor(state.settled.materialId);
    setOpenStudent(null);
    setAttemptPage(1);
  }

  React.useEffect(() => {
    heading.current?.focus();
  }, [state.settled.materialId]);

  if (problem.isError && !problem.data) {
    return (
      <RegionError
        body={t('progress.error.not_found_body')}
        onRetry={() => void problem.refetch()}
        title={t('progress.error.not_found_title')}
      />
    );
  }

  const data = problem.data;

  return (
    <Panel
      actions={
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] font-semibold text-sub transition-colors hover:border-brand hover:text-brand"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
          {t('progress.problem.close')}
        </button>
      }
      title={
        data
          ? t('progress.problem.students_heading', {
              title: data.problem.title,
            })
          : t('progress.loading')
      }
      titleId="problem-students-heading"
      titleRef={heading}
      titleTabIndex={-1}
    >
      {!data ? (
        <RegionLoading rows={4} />
      ) : data.rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-sub">
          {t('progress.empty.no_students_body')}
        </p>
      ) : (
        <>
          <DataGrid
            head={
              <>
                <Th>{t('progress.problem.column_student')}</Th>
                <Th>{t('progress.problem.column_status')}</Th>
                <Th numeric>{t('progress.problem.column_score')}</Th>
                <Th numeric>{t('progress.problem.column_attempts')}</Th>
                <Th>{t('progress.problem.column_activity')}</Th>
                <Th numeric>{t('progress.problem.column_solve_time')}</Th>
                <Th>{t('progress.problem.column_attention')}</Th>
                <Th className="text-right">
                  <span className="sr-only">
                    {t('progress.student.show_attempts')}
                  </span>
                </Th>
              </>
            }
          >
            {data.rows.map((row) => {
              const open = openStudent === row.membershipId;
              return (
                <React.Fragment key={row.membershipId}>
                  <tr
                    className={cn(
                      'border-b border-border/60',
                      open && 'bg-brand-soft/40',
                    )}
                  >
                    <Td>
                      <span className="font-semibold">{row.displayName}</span>
                    </Td>
                    <Td>
                      <StatusBadge status={row.status} />
                    </Td>
                    <Td numeric>{row.bestScore}</Td>
                    <Td numeric>{row.attempts}</Td>
                    <Td>
                      {row.lastActivityAt ? (
                        <time
                          className="whitespace-nowrap text-sub"
                          dateTime={row.lastActivityAt}
                        >
                          {formatDateTime(row.lastActivityAt, locale)}
                        </time>
                      ) : (
                        <span className="text-sub">
                          {t('progress.roster.never')}
                        </span>
                      )}
                    </Td>
                    <Td numeric>
                      <Duration seconds={row.latestSolveElapsedSec} />
                    </Td>
                    <Td>
                      <AttentionReasons compact reasons={row.attentionReasons} />
                    </Td>
                    <Td className="text-right">
                      <button
                        aria-expanded={open}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1 text-[13px] font-bold text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:text-sub disabled:no-underline"
                        disabled={row.attempts === 0}
                        onClick={() => {
                          setOpenStudent(open ? null : row.membershipId);
                          setAttemptPage(1);
                        }}
                        type="button"
                      >
                        {open
                          ? t('progress.student.hide_attempts')
                          : t('progress.student.show_attempts')}
                        <ChevronDown
                          aria-hidden
                          className={cn(
                            'size-3.5 transition-transform motion-reduce:transition-none',
                            open && 'rotate-180',
                          )}
                        />
                      </button>
                    </Td>
                  </tr>
                  {open ? (
                    <tr className="border-b border-border/60">
                      <td className="bg-accent/40 p-0" colSpan={8}>
                        <AttemptHistory
                          academyId={academyId}
                          classId={classId}
                          materialId={data.problem.materialId}
                          membershipId={row.membershipId}
                          onPageChange={setAttemptPage}
                          page={attemptPage}
                          returnTo={state.returnTo}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </DataGrid>
          <Pager
            onPageChange={state.setPage}
            page={data.pagination.page}
            pageCount={data.pagination.pageCount}
          />
        </>
      )}
    </Panel>
  );
}
