'use client';

import type {
  TeacherClassProgressSummary,
  TeacherStudentsResult,
} from '@cove/shared';
import { AlertTriangle, ChevronLeft, Radio, Search, Users } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  useCurriculumQuery,
  useProgressState,
  useStudentsQuery,
} from '../_hooks/use-teacher-progress';
import { progressPath, type ProgressView } from '../_lib/progress-url';
import { CurriculumOverview } from './curriculum-overview';
import { ProblemStudents } from './problem-students';
import {
  Meter,
  RegionError,
  RegionLoading,
} from './progress-primitives';
import { StudentDetail } from './student-detail';
import { StudentOverview } from './student-overview';

/**
 * One class, two lenses.
 *
 * The composition boundary and nothing else: it owns the URL-backed state, the
 * lens switch, and which region is mounted. Every region fetches its own data
 * and renders its own loading, empty, and failure states, so opening a lecture
 * never blanks a roster and a failed drill-down never takes the page with it.
 *
 * The lens switch is a pair of links rather than tabs, because switching does
 * change the address — Back should return a teacher to the lens they came
 * from, and tab semantics would promise that it does not.
 *
 * See §13.5 of the teacher solution status design.
 */
export function ProgressWorkspace({
  academyId,
  classId,
  className,
  initialData,
  initialKey,
}: {
  academyId: string;
  classId: string;
  className: string;
  initialData: TeacherStudentsResult | null;
  initialKey: string;
}) {
  const { t } = useTranslation('teach');
  const state = useProgressState({ academyId, classId });
  const { settled } = state;

  const students = useStudentsQuery(
    { academyId, classId },
    settled,
    initialData,
    initialKey,
  );
  const curriculum = useCurriculumQuery({ academyId, classId }, settled);

  const summary: TeacherClassProgressSummary | null =
    (settled.view === 'students'
      ? students.data?.summary
      : curriculum.data?.summary) ??
    students.data?.summary ??
    curriculum.data?.summary ??
    null;

  // The first load of the active lens failed with nothing to fall back on.
  const failedOutright =
    settled.view === 'students'
      ? students.isError && !students.data
      : curriculum.isError && !curriculum.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-1 text-[13.5px] font-semibold text-sub transition-colors hover:text-ink"
          href={`/studio/academies/${academyId}/teach/classes`}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t('progress.back_to_classes')}
        </Link>
        {/* The class's other destination. Peers, not a hierarchy: one is what
            is happening now, the other is what has happened. */}
        <Link
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-brand hover:text-brand"
          href={`/studio/academies/${academyId}/teach/classes/${classId}`}
        >
          <Radio aria-hidden className="size-3.5" />
          {t('progress.live_roster')}
        </Link>
      </div>

      <ClassStrip className={className} summary={summary} />

      <ViewSwitch
        academyId={academyId}
        classId={classId}
        current={settled.view}
        state={state}
      />

      {failedOutright ? (
        <RegionError
          body={t('progress.error.body')}
          onRetry={() =>
            void (settled.view === 'students'
              ? students.refetch()
              : curriculum.refetch())
          }
          title={t('progress.error.title')}
        />
      ) : settled.view === 'students' ? (
        <>
          {students.data ? (
            <StudentOverview
              data={students.data}
              failed={students.isError}
              onRetry={() => void students.refetch()}
              pending={students.isFetching}
              state={state}
            />
          ) : (
            <RegionLoading rows={5} />
          )}

          {settled.membershipId ? (
            <StudentDetail
              academyId={academyId}
              classId={classId}
              onClose={() => {
                state.change({ membershipId: null });
                // Focus returns to the row that opened the panel, so a
                // keyboard reader is not dropped at the top of the page.
                requestAnimationFrame(() => {
                  document
                    .querySelector<HTMLButtonElement>(
                      `[data-student-open="${settled.membershipId}"]`,
                    )
                    ?.focus();
                });
              }}
              state={state}
            />
          ) : null}
        </>
      ) : (
        <>
          <CurriculumSearch state={state} />

          {curriculum.data ? (
            <CurriculumOverview
              academyId={academyId}
              classId={classId}
              data={curriculum.data}
              failed={curriculum.isError}
              onRetry={() => void curriculum.refetch()}
              state={state}
            />
          ) : (
            <RegionLoading rows={4} />
          )}

          {settled.materialId ? (
            <ProblemStudents
              academyId={academyId}
              classId={classId}
              onClose={() => state.change({ materialId: null })}
              state={state}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The three class facts, kept quiet.
 *
 * They sit above both lenses and never move, because they are the one thing
 * that stays true while a teacher changes how they are reading the class. Two
 * are counts and one is a proportion, so only the proportion carries a meter —
 * rendering all three identically would hide which one has a denominator.
 */
function ClassStrip({
  className,
  summary,
}: {
  className: string;
  summary: TeacherClassProgressSummary | null;
}) {
  const { t } = useTranslation('teach');

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <Fact
        icon={Users}
        label={t('progress.summary.students')}
        meaning={t('progress.summary.students_caption')}
        testId="progress-students"
        value={summary ? String(summary.activeStudents) : '—'}
      />
      <div className="flex flex-col rounded-card border border-border bg-card px-4 py-3.5">
        <dt className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-sub">
          {t('progress.summary.completion')}
        </dt>
        <dd className="mt-2 flex flex-1 flex-col justify-between gap-2.5">
          <span
            className="block text-[1.75rem] font-extrabold leading-none tabular-nums"
            data-testid="progress-completion"
          >
            {summary ? `${summary.completionPercent}%` : '—'}
          </span>
          <Meter
            label={t('progress.summary.completion_label', {
              percent: `${summary?.completionPercent ?? 0}%`,
            })}
            percent={summary?.completionPercent ?? 0}
          />
          <span className="block text-[12px] leading-[1.45] text-sub">
            {t('progress.summary.completion_caption', {
              solved: summary?.solvedPairs ?? 0,
              total: summary?.eligiblePairs ?? 0,
            })}
          </span>
        </dd>
      </div>
      <Fact
        icon={AlertTriangle}
        label={t('progress.summary.attention')}
        meaning={t('progress.summary.attention_caption')}
        testId="progress-attention"
        tone={summary && summary.studentsNeedingAttention > 0 ? 'warning' : 'quiet'}
        value={summary ? String(summary.studentsNeedingAttention) : '—'}
      />
      <span className="sr-only">{className}</span>
    </dl>
  );
}

function Fact({
  icon: Icon,
  label,
  meaning,
  testId,
  tone = 'quiet',
  value,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  label: string;
  meaning: string;
  testId: string;
  tone?: 'quiet' | 'warning';
  value: string;
}) {
  return (
    <div className="flex flex-col rounded-card border border-border bg-card px-4 py-3.5">
      <dt className="flex items-center gap-2">
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg',
            tone === 'warning'
              ? 'bg-warning/10 text-warning'
              : 'bg-accent text-sub',
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <span className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-sub">
          {label}
        </span>
      </dt>
      <dd className="mt-2.5 flex flex-1 flex-col justify-between gap-2.5">
        <span
          className="block text-[1.75rem] font-extrabold leading-none tabular-nums"
          data-testid={testId}
        >
          {value}
        </span>
        <span className="block text-[12px] leading-[1.45] text-sub">
          {meaning}
        </span>
      </dd>
    </div>
  );
}

/** Two links styled as one control. The address is what actually changes. */
function ViewSwitch({
  academyId,
  classId,
  current,
  state,
}: {
  academyId: string;
  classId: string;
  current: ProgressView;
  state: ReturnType<typeof useProgressState>;
}) {
  const { t } = useTranslation('teach');
  const views: { view: ProgressView; label: string }[] = [
    { view: 'students', label: t('progress.view_students') },
    { view: 'problems', label: t('progress.view_problems') },
  ];

  return (
    <nav aria-label={t('progress.view_label')}>
      <ul className="inline-flex rounded-lg border border-border bg-card p-1">
        {views.map(({ view, label }) => {
          const active = current === view;
          return (
            <li key={view}>
              <Link
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 items-center rounded-md px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40',
                  active
                    ? 'bg-brand text-on-brand'
                    : 'text-sub hover:text-ink',
                )}
                href={progressPath(academyId, classId, {
                  ...state.settled,
                  view,
                  membershipId: null,
                  materialId: null,
                  sort: null,
                  direction: 'desc',
                  page: 1,
                })}
                scroll={false}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The By-problem search box.
 *
 * Separate from the roster's toolbar because it searches something else —
 * course, lecture, and problem titles rather than student names — and one box
 * that quietly changed meaning between lenses would be worse than two.
 */
function CurriculumSearch({
  state,
}: {
  state: ReturnType<typeof useProgressState>;
}) {
  const { t } = useTranslation('teach');
  return (
    <div className="relative w-full sm:w-80">
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub"
      />
      <input
        aria-label={t('progress.search_curriculum')}
        className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[14px] outline-none transition-colors placeholder:text-sub/60 focus:border-brand focus:ring-2 focus:ring-brand/20"
        onChange={(event) => state.change({ q: event.target.value })}
        placeholder={t('progress.search_curriculum')}
        type="search"
        value={state.query.q}
      />
    </div>
  );
}
