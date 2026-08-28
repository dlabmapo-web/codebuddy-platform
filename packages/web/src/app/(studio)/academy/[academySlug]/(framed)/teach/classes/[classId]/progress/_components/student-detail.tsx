'use client';

import { formatDateTime } from '@cove/i18n/format';
import { ChevronDown, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { useStudentDetailQuery } from '../_hooks/use-teacher-progress';
import type { ProgressState } from '../_hooks/use-teacher-progress';
import { outlineLabel } from '../_lib/progress-view';
import { AttemptHistory } from './attempt-history';
import { AttentionChip, AttentionReasons } from './attention-reasons';
import {
  DataGrid,
  EmptyState,
  Pager,
  Panel,
  RegionError,
  RegionLoading,
  StatusBadge,
  Td,
  Th,
} from './progress-primitives';

/**
 * One student, opened beside the roster that named them.
 *
 * The roster stays exactly as it was — same filters, same page, same scroll —
 * because a teacher comparing two students should not have to rebuild the list
 * between them. Focus moves in here on open and returns to the originating row
 * on close, which is the whole reason this is a labelled region rather than a
 * card that merely appears.
 *
 * Selecting an exercise expands its attempt history in place. The selection is
 * component state rather than URL state: it is a glance inside an already
 * shared screen, not a destination worth addressing.
 */
export function StudentDetail({
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
  const { settled } = state;
  const detail = useStudentDetailQuery({ academyId, classId }, settled);
  const heading = React.useRef<HTMLHeadingElement>(null);

  const [openExercise, setOpenExercise] = React.useState<string | null>(null);
  const [attemptPage, setAttemptPage] = React.useState(1);

  // Changing student clears the exercise and attempt selection: a row number
  // from the previous student means nothing here. Adjusted during render
  // rather than in an effect, so the new student never paints for one frame
  // with the previous student's row expanded.
  const [openFor, setOpenFor] = React.useState(settled.membershipId);
  if (openFor !== settled.membershipId) {
    setOpenFor(settled.membershipId);
    setOpenExercise(null);
    setAttemptPage(1);
  }

  // Focus moves into the region that just opened, and §18 asks for it here
  // rather than at the top of the page.
  React.useEffect(() => {
    heading.current?.focus();
  }, [settled.membershipId]);

  if (detail.isError && !detail.data) {
    return (
      <RegionError
        body={t('progress.error.not_found_body')}
        onRetry={() => void detail.refetch()}
        title={t('progress.error.not_found_title')}
      />
    );
  }

  const data = detail.data;
  const attentionRows = data?.rows.filter(
    (row) => row.attentionReasons.length > 0,
  );

  return (
    <Panel
      actions={
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-[12.5px] font-semibold text-sub transition-colors hover:border-brand hover:text-brand"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden className="size-3.5" />
          {t('progress.student.close')}
        </button>
      }
      title={data ? data.student.displayName : t('progress.loading')}
      titleId="student-detail-heading"
      titleRef={heading}
      titleTabIndex={-1}
    >
      {!data ? (
        <RegionLoading rows={4} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-border px-4 py-3 sm:grid-cols-4">
            <Fact
              label={t('progress.roster.column_progress')}
              value={t('progress.roster.progress_value', {
                solved: data.student.solvedProblems,
                total: data.student.eligibleProblems,
              })}
            />
            <Fact
              label={t('progress.roster.column_attempts')}
              value={String(data.student.attempts)}
            />
            <Fact
              label={t('progress.roster.column_accepted')}
              value={`${data.student.acceptedPercent}%`}
            />
            <Fact
              label={t('progress.roster.column_activity')}
              value={
                data.student.lastActivityAt
                  ? formatDateTime(data.student.lastActivityAt, locale)
                  : t('progress.roster.never')
              }
            />
          </dl>

          {attentionRows && attentionRows.length > 0 ? (
            <section className="border-b border-border bg-warning/[0.04] px-4 py-3">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.05em] text-sub">
                {t('progress.student.attention_heading')}
              </h3>
              <ul className="mt-2 flex flex-col gap-2">
                {attentionRows.map((row) => (
                  <li
                    className="flex flex-wrap items-center gap-2"
                    key={row.materialId}
                  >
                    <button
                      className="rounded-sm text-[13px] font-semibold underline-offset-2 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand/40"
                      onClick={() => {
                        setOpenExercise(row.materialId);
                        setAttemptPage(1);
                      }}
                      type="button"
                    >
                      {outlineLabel(row.outlineNumber, row.title)}
                    </button>
                    {row.attentionReasons.map((reason) => (
                      <AttentionChip key={reason.kind} reason={reason} />
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {data.rows.length === 0 ? (
            <EmptyState
              body={t('progress.empty.no_results_body')}
              title={t('progress.empty.no_results_title')}
            />
          ) : (
            <DataGrid
              head={
                <>
                  <Th>{t('progress.student.column_problem')}</Th>
                  <Th>{t('progress.student.column_status')}</Th>
                  <Th numeric>{t('progress.student.column_score')}</Th>
                  <Th numeric>{t('progress.student.column_attempts')}</Th>
                  <Th>{t('progress.student.column_last')}</Th>
                  <Th>{t('progress.student.column_attention')}</Th>
                  <Th className="text-right">
                    <span className="sr-only">
                      {t('progress.student.show_attempts')}
                    </span>
                  </Th>
                </>
              }
            >
              {data.rows.map((row) => {
                const open = openExercise === row.materialId;
                return (
                  <React.Fragment key={row.materialId}>
                    <tr
                      className={cn(
                        'border-b border-border/60',
                        open && 'bg-brand-soft/40',
                      )}
                    >
                      <Td>
                        <span className="flex min-w-0 flex-col">
                          <span className="font-semibold">
                            {row.outlineNumber ? (
                              <span className="mr-1.5 font-mono text-[12.5px] text-sub">
                                {row.outlineNumber}
                              </span>
                            ) : null}
                            {row.title}
                          </span>
                          <span className="flex items-center gap-1.5 text-[12px] text-sub">
                            {row.courseTitle}
                            {!row.isRequired ? (
                              <span className="rounded bg-accent px-1.5 py-px text-[11px] font-semibold">
                                {t('progress.student.optional')}
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={row.status} />
                      </Td>
                      <Td numeric>{row.bestScore}</Td>
                      <Td numeric>{row.attempts}</Td>
                      <Td>
                        {row.lastAttemptAt ? (
                          <time
                            className="whitespace-nowrap text-sub"
                            dateTime={row.lastAttemptAt}
                          >
                            {formatDateTime(row.lastAttemptAt, locale)}
                          </time>
                        ) : (
                          <span className="text-sub">
                            {t('progress.roster.never')}
                          </span>
                        )}
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
                            setOpenExercise(open ? null : row.materialId);
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
                    {open && settled.membershipId ? (
                      <tr className="border-b border-border/60">
                        <td className="bg-accent/40 p-0" colSpan={7}>
                          <AttemptHistory
                            academyId={academyId}
                            classId={classId}
                            materialId={row.materialId}
                            membershipId={settled.membershipId}
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
          )}

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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold uppercase tracking-[0.05em] text-sub">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[14px] font-semibold tabular-nums">
        {value}
      </dd>
    </div>
  );
}
