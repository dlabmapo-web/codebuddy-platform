'use client';

import type {
  StudentAcademyOverview,
  StudentOverviewSection,
} from '@cove/shared';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import {
  useStudentOverviewQuery,
  useStudentOverviewState,
} from '../../_hooks/use-student-overview';
import { ActivityChart } from './activity-chart';
import { ClassStandingPanel } from './class-standing';
import { CourseProgress } from './course-progress';
import { LearningLedger } from './learning-ledger';
import { PointsCard } from './points-card';
import { OverviewHeader } from './overview-header';
import { PracticeList } from './practice-list';
import { RecentAttempts } from './recent-attempts';
import { ResumePlate } from './resume-plate';
import { EmptyState, Panel, SectionUnavailable } from './student-primitives';
import { TeacherMessages } from './teacher-messages';

/**
 * The student's academy overview.
 *
 * One column, full width, top to bottom, and no two sections ever side by
 * side — the same rule the teacher's overview and the manager's control tower
 * follow, so the three read as one product.
 *
 * The order is an argument. Resume says what to open, because that is the
 * question a child arrives with. The ledger gives the rest of the page its
 * denominators. Course progress says where that work sits. The activity chart
 * shows the shape of it. The teacher's messages are the one thing on the page
 * another person wrote. Practice is what is unfinished. Standing is where that
 * puts them among the people doing the same work. Recent attempts is the
 * receipt. Each section is the evidence for the one above it, which is why
 * none of them sit beside each other as alternatives.
 *
 * A period change keeps the previous numbers on screen, marked as updating,
 * and disables drill-downs until the new window lands: a link opened from
 * stale data would land on the previous period's rows.
 *
 * §10.3 — a section whose aggregate could not be computed says so in its own
 * space while the rest of the page stands. The header is the exception: it is
 * the page's own claim about whose page this is, and without it there is no
 * narrower page to render, so that failure is a retryable error instead.
 */
export function StudentOverviewWorkspace({
  academyId,
  initialData,
  initialKey,
}: {
  academyId: string;
  initialData: StudentAcademyOverview | null;
  initialKey: string;
}) {
  const { t } = useTranslation('learning');
  const { query, change } = useStudentOverviewState(academyId);
  const overview = useStudentOverviewQuery(
    academyId,
    query,
    initialData,
    initialKey,
  );

  if (overview.isError && !overview.data) {
    return (
      <Panel title={t('unavailable.page_title')} tone="danger">
        <div className="p-4">
          <p className="text-[13px] leading-[1.6] text-sub">
            {t('unavailable.page_body')}
          </p>
          <button
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => void overview.refetch()}
            type="button"
          >
            {t('retry')}
          </button>
        </div>
      </Panel>
    );
  }

  if (!overview.data) return <OverviewSkeleton />;

  const data = overview.data;
  const isStale = overview.isFetching || overview.isPlaceholderData;
  const unavailable = new Set(data.unavailable);

  /** A section, or the fact that its aggregate could not be computed. */
  const section = (
    id: StudentOverviewSection,
    title: string,
    node: React.ReactNode,
  ) =>
    unavailable.has(id) ? (
      <Panel title={title} tone="danger">
        <SectionUnavailable onRetry={() => void overview.refetch()} />
      </Panel>
    ) : (
      node
    );

  return (
    <div className="flex flex-col gap-5">
      <OverviewHeader
        academyId={academyId}
        classes={data.scope.classes}
        displayName={data.scope.displayName}
        isStale={isStale}
        onRangeChange={(range) => change({ range })}
        period={data.scope.period}
        range={query.range}
      />

      {data.scope.courseCount === 0 ? (
        <NoCourses academyId={academyId} />
      ) : (
        <div
          // The whole column dims rather than individual panels disappearing,
          // so a student keeps their place on the page while a new period
          // loads.
          className={cn(
            'flex flex-col gap-4 transition-opacity motion-reduce:transition-none',
            isStale && 'opacity-60',
          )}
        >
          {section(
            'continue',
            t('resume.title'),
            <ResumePlate
              academyId={academyId}
              isStale={isStale}
              targets={data.continueTargets}
            />,
          )}

          {section(
            'ledger',
            t('ledger.title'),
            <LearningLedger
              // Counted time only exists once heartbeats have been recorded.
              // Absent is not zero, and the ledger says which it is.
              activityTracked={data.scope.activityTrackedSince !== null}
              ledger={data.ledger}
            />,
          )}

          {/*
           * §6.1 — one compact card, immediately after the ledger, and the
           * only thing about points on this page. Absent entirely when the
           * academy does not run a point economy: a disabled section is
           * silent, not an explanation of a feature this student's school
           * chose not to use.
           */}
          {data.points
            ? section(
                'points',
                t('points.title'),
                <PointsCard academyId={academyId} points={data.points} />,
              )
            : null}

          {section(
            'courses',
            t('courses.title'),
            <CourseProgress
              academyId={academyId}
              courses={data.courses}
              isStale={isStale}
            />,
          )}

          {section(
            'activity',
            t('activity.title'),
            <ActivityChart activity={data.activity} scope={data.scope} />,
          )}

          {section(
            'messages',
            t('messages.title'),
            <TeacherMessages
              academyId={academyId}
              isStale={isStale}
              messages={data.messages}
              unread={data.unreadMessages}
            />,
          )}

          {section(
            'practice',
            t('practice.title'),
            <PracticeList
              academyId={academyId}
              isStale={isStale}
              rows={data.practice}
            />,
          )}

          {/*
           * Absent entirely when the academy has not enabled it. §9.7 — a
           * disabled section is silent, not an explanation of a feature this
           * student's school chose not to use.
           */}
          {data.standing
            ? section(
                'standing',
                t('standing.title'),
                <ClassStandingPanel
                  classes={data.standingClasses}
                  isStale={isStale}
                  onClassChange={(standingClassId) => change({ standingClassId })}
                  standing={data.standing}
                />,
              )
            : null}

          {section(
            'records',
            t('records.title'),
            <RecentAttempts
              academyId={academyId}
              isStale={isStale}
              records={data.records}
            />,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A student with no course to open.
 *
 * The catalog's own explanation rather than eight empty panels: every
 * measurement below would be an honest zero, and eight honest zeros read as a
 * broken page.
 */
function NoCourses({ academyId }: { academyId: string }) {
  const { t } = useTranslation('learning');
  return (
    <Panel icon={BookOpen} title={t('empty.no_courses_title')} tone="brand">
      <EmptyState
        action={
          <Link
            className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            href={`/studio/academies/${academyId}/learn/classes`}
          >
            {t('empty.no_courses_action')}
          </Link>
        }
        body={t('empty.no_courses_body')}
        icon={BookOpen}
        title={t('empty.no_courses_title')}
        tone="brand"
      />
    </Panel>
  );
}

/** The page's shape before its numbers, so the layout does not jump. */
function OverviewSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse flex-col gap-4">
      <div className="h-16 rounded-card bg-accent" />
      <div className="h-32 rounded-card bg-accent" />
      <div className="h-28 rounded-card bg-accent" />
      <div className="h-56 rounded-card bg-accent" />
    </div>
  );
}
