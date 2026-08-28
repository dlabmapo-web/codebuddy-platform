'use client';

import type { ManagerOverview, ManagerOverviewSection, OverviewRange } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  useManagerOverviewQuery,
  useManagerOverviewState,
} from '../../_hooks/use-manager-overview';
import {
  SkeletonColumn,
  SkeletonRegion,
} from '@/components/studio/skeletons';
import { Panel } from '../overview-ui/panel';
import { OverviewRankingCard } from '../overview-ranking/overview-ranking-card';
import { AcademyPlate } from './academy-plate';
import { AcademyProfileDialog } from './academy-profile-dialog';
import { AttentionQueue } from './attention-queue';
import { GrowthPanel } from './growth-panel';
import { LearningHealth } from './learning-health';
import { ChangesPanel, ProblemsPanel } from './problems-panel';
import { QuickActions } from './quick-actions';

/**
 * The manager's control tower.
 *
 * One column, full width, top to bottom, in the order of §9.1's argument: the
 * academy says where and who it is, the queue says what needs deciding, growth
 * and learning say whether it is working, the hardest problems and the recent
 * changes say why, and the quick actions say what to start. Two sections side
 * by side would ask a manager to read both at once and imply they are
 * alternatives, and none of these are — each is the evidence for the one above.
 *
 * A period change keeps the previous numbers on screen, marked as updating, and
 * disables drill-downs until the new window lands: a link opened from stale
 * data would land on the previous period's rows.
 *
 * §14 — a section whose aggregate could not be computed says so in its own
 * space while the rest of the page stands. The one exception is the academy's
 * identity and totals: those are the page's own claim, and if they are missing
 * there is no narrower page to render, so the whole thing becomes a retryable
 * error instead.
 */
export function ManagerOverviewWorkspace({
  academyId,
  hasLeaderboard,
  initialData,
  initialRange,
}: {
  academyId: string;
  hasLeaderboard: boolean;
  initialData: ManagerOverview | null;
  initialRange: OverviewRange;
}) {
  const { t } = useTranslation('manager');
  const { range, setRange } = useManagerOverviewState(academyId);
  const overview = useManagerOverviewQuery(
    academyId,
    range,
    initialData,
    initialRange,
  );
  const [editingProfile, setEditingProfile] = React.useState(false);

  if (overview.isError && !overview.data) {
    return (
      <Panel title={t('unavailable.page_title')} tone="danger">
        <div className="p-4">
          <p className="text-[13px] leading-[1.6] text-sub">
            {t('unavailable.page_body')}
          </p>
          <button
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90"
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
    id: ManagerOverviewSection,
    title: string,
    node: React.ReactNode,
  ) =>
    unavailable.has(id) ? (
      <SectionUnavailable onRetry={() => void overview.refetch()} title={title} />
    ) : (
      node
    );

  return (
    <div className="flex flex-col gap-4">
      <AcademyPlate
        academy={data.academy}
        completion={data.completion}
        generatedAt={data.generatedAt}
        isStale={isStale}
        onEditProfile={() => setEditingProfile(true)}
        onRangeChange={setRange}
        period={data.period}
        range={range}
        scale={data.scale}
      />

      {/*
       * The whole column dims rather than individual panels disappearing, so a
       * manager keeps their place on the page while a new period loads. The
       * plate above stays at full opacity: the academy's name and address do
       * not change with the period, and dimming them would say they might.
       */}
      <div
        className={
          isStale
            ? 'flex flex-col gap-4 opacity-60 transition-opacity motion-reduce:transition-none'
            : 'flex flex-col gap-4 transition-opacity motion-reduce:transition-none'
        }
      >
        {section(
          'attention',
          t('queue.title'),
          <AttentionQueue
            academyId={academyId}
            isStale={isStale}
            queue={data.queue}
          />,
        )}

        {section(
          'growth',
          t('growth.title'),
          <GrowthPanel
            growth={data.growth}
            isStale={isStale}
            periodDays={data.period.days}
            recentJoins={data.recentJoins}
          />,
        )}

        {section(
          'learning',
          t('learning.title'),
          <LearningHealth
            academyId={academyId}
            classes={data.classes}
            highlightClassId={data.highlightClassId}
            isStale={isStale}
            rate={data.activeLearnerRate}
            truncated={data.classesTruncated}
          />,
        )}

        {hasLeaderboard ? (
          <OverviewRankingCard academyId={academyId} audience="staff" />
        ) : null}

        {section(
          'problems',
          t('problems.title'),
          <ProblemsPanel
            academyId={academyId}
            isStale={isStale}
            problems={data.problems}
          />,
        )}

        {section(
          'activity',
          t('changes.title'),
          <ChangesPanel changes={data.recentChanges} />,
        )}

        <QuickActions
          academyId={academyId}
          onEditProfile={() => setEditingProfile(true)}
          profileIncomplete={!data.completion.isComplete}
        />
      </div>

      <AcademyProfileDialog
        academy={data.academy}
        onClose={() => setEditingProfile(false)}
        open={editingProfile}
      />
    </div>
  );
}

/**
 * One section that could not be computed.
 *
 * Named as an outage, in the panel's own space, with the rest of the page
 * intact. §14 — a failure rendered as an empty academy is worse than an error,
 * because a manager would believe it and act on it.
 */
function SectionUnavailable({
  onRetry,
  title,
}: {
  onRetry: () => void;
  title: string;
}) {
  const { t } = useTranslation('manager');
  return (
    <Panel title={title} tone="danger">
      <div className="m-4 rounded-lg border border-danger/25 bg-danger/5 p-4" role="alert">
        <p className="text-[13px] font-bold text-danger">
          {t('unavailable.title')}
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-sub">
          {t('unavailable.body')}
        </p>
        <button
          className="mt-3 inline-flex h-8 items-center rounded-md border border-danger/30 px-2.5 text-[12.5px] font-bold text-danger transition-colors hover:bg-danger/10"
          onClick={onRetry}
          type="button"
        >
          {t('retry')}
        </button>
      </div>
    </Panel>
  );
}

/** The page's shape, held while the first response lands. */
function OverviewSkeleton() {
  const { t } = useTranslation('manager');
  return (
    <SkeletonRegion className="flex flex-col gap-4" label={t('loading')}>
      <SkeletonColumn heights={[15, 18, 20, 26, 16, 14, 10]} />
    </SkeletonRegion>
  );
}
