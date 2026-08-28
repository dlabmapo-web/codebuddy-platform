'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { AcademyTeacherOverview, OverviewSection } from '@cove/shared';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  Skeleton,
  SkeletonColumn,
  SkeletonRegion,
} from '@/components/studio/skeletons';

import {
  useOverviewState,
  useTeacherOverviewQuery,
} from '../../_hooks/use-teacher-overview';
import { OverviewRankingCard } from '../overview-ranking/overview-ranking-card';
import { CurriculumReadiness, DifficultProblems } from './curriculum-sections';
import { MetricsLedger } from './metrics-ledger';
import { OverviewFilters } from './overview-filters';
import { EmptyState, Panel, SectionUnavailable } from './overview-primitives';
import { StudentParticipation } from './student-participation';
import { ActiveLearningPreview, ScoreOrderPreview } from './student-previews';
import { TeachingQueue } from './teaching-queue';

/**
 * The teacher's academy overview.
 *
 * One column, full width, top to bottom, and no two sections ever side by side.
 * The order is the order of the argument: the queue says who to check, the
 * ledger gives it a denominator, participation shows the work behind it, the
 * two previews name the students at either end, and readiness and difficulty
 * say what to teach next. Two sections in a row would ask a teacher to read
 * both at once and imply they are alternatives, and none of these are — each
 * one is the evidence for the one above it.
 *
 * A filter change keeps the previous numbers on screen, marked as updating, and
 * disables drill-downs until the new scope lands: a link opened from stale data
 * would land on the previous scope's rows.
 *
 * See §6 of the teacher overview and student analytics redesign.
 */
export function TeacherOverviewWorkspace({
  academyId,
  hasLeaderboard,
  initialData,
  initialKey,
}: {
  academyId: string;
  hasLeaderboard: boolean;
  initialData: AcademyTeacherOverview | null;
  initialKey: string;
}) {
  const { t } = useTranslation('teaching');
  const { query, change } = useOverviewState(academyId);
  const overview = useTeacherOverviewQuery(
    academyId,
    query,
    initialData,
    initialKey,
  );

  if (overview.isError && !overview.data) {
    return (
      <Panel title={t('title')}>
        <SectionUnavailable onRetry={() => void overview.refetch()} />
      </Panel>
    );
  }

  if (!overview.data) {
    return <OverviewSkeleton />;
  }

  const data = overview.data;
  const isStale = overview.isFetching || overview.isPlaceholderData;
  const unavailable = new Set(data.unavailable);

  /** A section, or the fact that its aggregate could not be computed. */
  const section = (id: OverviewSection, title: string, node: React.ReactNode) =>
    unavailable.has(id) ? (
      <Panel title={title}>
        <SectionUnavailable onRetry={() => void overview.refetch()} />
      </Panel>
    ) : (
      node
    );

  return (
    <div className="flex flex-col gap-4">
      <OverviewFilters
        filters={data.filters}
        isFetching={isStale}
        onChange={(partial) => change(partial, data.filters.courses)}
        query={query}
        scope={data.scope}
      />

      {data.scope.classCount === 0 ? (
        <NoAssignedClasses academyId={academyId} />
      ) : data.scope.enrolledStudents === 0 ? (
        <Panel title={t('title')}>
          <EmptyState
            body={t('empty.no_students_body')}
            title={t('empty.no_students_title')}
          />
        </Panel>
      ) : (
        <div
          // The whole column dims rather than individual panels disappearing,
          // so a teacher keeps their place on the page while a new scope loads.
          className={
            isStale
              ? 'flex flex-col gap-4 opacity-60 transition-opacity motion-reduce:transition-none'
              : 'flex flex-col gap-4 transition-opacity motion-reduce:transition-none'
          }
        >
          {section(
            'queue',
            t('queue.title'),
            <TeachingQueue
              academyId={academyId}
              isStale={isStale}
              query={query}
              rows={data.queue}
              total={data.queueTotal}
            />,
          )}

          {section(
            'ledger',
            t('ledger.title'),
            <MetricsLedger ledger={data.ledger} />,
          )}

          {hasLeaderboard ? (
            <OverviewRankingCard
              academyId={academyId}
              audience="staff"
              preferredClassId={query.classId}
            />
          ) : null}

          {section(
            'participation',
            t('participation.title'),
            <StudentParticipation
              academyId={academyId}
              isStale={isStale}
              query={query}
              rows={data.participation}
              truncated={data.participationTruncated}
            />,
          )}

          {section(
            'scores',
            t('scores.title'),
            <ScoreOrderPreview
              academyId={academyId}
              isStale={isStale}
              query={query}
              rows={data.scorePreview}
            />,
          )}

          {section(
            'activity',
            t('activity.title'),
            <ActiveLearningPreview
              academyId={academyId}
              isStale={isStale}
              leastActive={data.leastActive}
              mostActive={data.mostActive}
              query={query}
            />,
          )}

          {section(
            'readiness',
            t('curriculum.title'),
            <CurriculumReadiness
              academyId={academyId}
              isStale={isStale}
              rows={data.readiness}
            />,
          )}

          {section(
            'problems',
            t('problems.title'),
            <DifficultProblems
              academyId={academyId}
              isStale={isStale}
              rows={data.problems}
            />,
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A teacher who runs no class yet.
 *
 * Not zeros. A page of empty sections would describe a class that is performing
 * badly, and there is no class — so it says that, and points at where classes
 * come from.
 */
function NoAssignedClasses({ academyId }: { academyId: string }) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('teaching');
  return (
    <Panel title={t('title')}>
      <EmptyState
        action={
          <Link
            className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90"
            href={`${routes.academy(academySlug)}/teach/classes`}
          >
            {t('empty.no_classes_action')}
          </Link>
        }
        body={t('empty.no_classes_body')}
        title={t('empty.no_classes_title')}
      />
    </Panel>
  );
}

/**
 * The page's shape, held while the first response lands.
 *
 * Every block is roughly the height of what replaces it and they are stacked in
 * the same single column, so the page does not reflow as the data arrives.
 */
function OverviewSkeleton() {
  const { t } = useTranslation('teaching');
  return (
    <SkeletonRegion className="flex flex-col gap-4" label={t('loading')}>
      <Skeleton className="h-9 w-72 rounded-lg" />
      <SkeletonColumn heights={[22, 11, 24, 14, 14]} />
    </SkeletonRegion>
  );
}
