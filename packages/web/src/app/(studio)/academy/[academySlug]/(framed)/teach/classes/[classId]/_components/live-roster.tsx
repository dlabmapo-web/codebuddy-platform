'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { MonitoringClassRoster } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';
import { claimServerRead } from '@/lib/server-read';
import { StudioPage } from '../../../../_components/studio-page';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import {
  countRoster,
  matchesFilter,
  mergeRoster,
  sortRoster,
  type RosterFilter,
} from '@/lib/monitoring/roster';
import { cn } from '@/lib/utils';

import { ConnectionBadge } from '../../../_components/live-badges';
import { ClassPointsBoard } from '../../../../_components/class-points/class-points-board';
import { RosterTable } from './roster-table';
import { ClassCourses } from './class-courses';

const filters: RosterFilter[] = ['all', 'online', 'solving', 'idle', 'offline'];

/**
 * One class's students, live.
 *
 * Two sources, kept apart: enrollment comes from the query and decides who is
 * on the list, presence comes from the class room and decides how each row
 * reads. A realtime outage therefore leaves a complete roster of offline-
 * looking rows *and* a banner saying live updates are unavailable — never a
 * silently empty class.
 */
export function LiveRoster({
  academyId,
  initialRoster,
  serverReadToken,
  actions,
  back,
}: {
  academyId: string;
  initialRoster: MonitoringClassRoster;
  serverReadToken?: string;
  actions?: React.ReactNode;
  back?: React.ReactNode;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const classId = initialRoster.class.classId;
  const [seed] = React.useState(() => claimServerRead(serverReadToken) ? initialRoster : undefined);
  const [filter, setFilter] = React.useState<RosterFilter>('all');

  const rosterQuery = useQuery({
    queryKey: ['academy', academyId, 'teaching-roster', classId],
    queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }),
    initialData: seed,
    retry: false,
  });
  const roster = rosterQuery.data ?? initialRoster;
  const { entries, state, denied } = useClassPresence({ academyId, classId });

  const rows = React.useMemo(
    () => sortRoster(mergeRoster(roster.students, entries, roster.exercises)),
    [entries, roster.exercises, roster.students],
  );
  const counts = React.useMemo(() => countRoster(rows), [rows]);
  // The pills decide which rows the table receives; the table owns text
  // search. Splitting them this way keeps `online` meaning "any live
  // connection", which a per-column filter could not express.
  const visible = React.useMemo(
    () => rows.filter((row) => matchesFilter(row, filter)),
    [filter, rows],
  );

  return (
    <StudioPage
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Link
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[14px] font-semibold text-sub transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            href={routes.academyTeachProgress(academySlug, classId)}
          >
            <ClipboardList aria-hidden className="size-4" />
            {t('roster.solution_status')}
          </Link>
          <ConnectionBadge state={denied === 'MONITORING_ACCESS_DENIED' ? 'revoked' : state} />
        </div>
      }
      back={back}
      bleed
      title={roster.class.name}
    >
      <div className="space-y-5">
        {denied === 'MONITORING_ACCESS_DENIED' ? (
          <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
            {t('connection.revoked_body')}
          </p>
        ) : null}
        {state === 'degraded' ? (
          <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
            {t('connection.degraded_body')}
          </p>
        ) : null}

        <ClassCourses courses={roster.courses} />

        <dl className="grid grid-cols-3 gap-3">
          <SummaryCard label={t('roster.summary_total')} value={counts.total} />
          <SummaryCard label={t('roster.summary_online')} value={counts.online} />
          <SummaryCard label={t('roster.summary_solving')} value={counts.solving} />
        </dl>

        {roster.truncated ? (
          <p className="text-[13px] font-semibold text-draft">
            {t('roster.truncated', { count: roster.students.length })}
          </p>
        ) : null}

        {roster.students.length === 0 ? (
          <p className="rounded-card border border-border bg-surface p-5 text-[14px] text-sub">
            {t('roster.no_enrollments')}
          </p>
        ) : (
          <RosterTable
            academyId={academyId}
            classId={classId}
            // A filter that matched nothing must not claim the class is empty.
            emptyMessage={t('roster.empty')}
            filters={
              <div
                aria-label={t('roster.filter_all')}
                className="flex flex-wrap items-center gap-1.5"
                role="group"
              >
                {filters.map((option) => (
                  <button
                    aria-pressed={filter === option}
                    className={cn(
                      'h-10 rounded-lg border px-3 text-[13.5px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                      filter === option
                        ? 'border-brand bg-brand/10 text-brand'
                        : 'border-border bg-card text-sub hover:border-brand hover:text-brand',
                    )}
                    key={option}
                    onClick={() => setFilter(option)}
                    type="button"
                  >
                    {t(`roster.filter_${option}`)}
                  </button>
                ))}
              </div>
            }
            rows={visible}
          />
        )}

        {/*
         * §5.1 — the identical board this class's students see, below the live
         * roster because the roster is what a teacher opened this page for. It
         * renders nothing when the academy does not run points.
         */}
        <ClassPointsBoard academyId={academyId} classId={classId} />
      </div>
    </StudioPage>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border bg-surface px-4 py-3">
      <dt className="text-[12.5px] font-semibold text-sub">{label}</dt>
      <dd className="mt-0.5 text-[1.4rem] font-extrabold leading-tight">
        {value}
      </dd>
    </div>
  );
}
