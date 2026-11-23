'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { MonitoringClassSummary } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, PenLine, Radio, School, Users, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';
import { claimServerRead } from '@/lib/server-read';
import { useAssignedClassPresence } from '@/lib/monitoring/use-assigned-class-presence';

import { ConnectionBadge } from '../../_components/live-badges';
import { isClassActive, orderClassesByActivity, type ClassLiveCounts } from '../_lib/class-order';

/**
 * The teacher's own classes.
 *
 * Durable facts come from the query and stay on screen whatever the socket is
 * doing; the live counts come from the presence rooms and are simply absent
 * when realtime is unavailable. A degraded service must never make a class
 * look empty.
 *
 * Classes with students in them come first and are marked in Cove blue, so
 * the one a teacher should open next is the first thing they see (QA T-01).
 * Blue emphasis means "somebody is here right now" and nothing else: an idle
 * class stays calm. Not red: red reads as an alarm, and nothing is wrong.
 */
export function TeachingClasses({
  academyId,
  initialClasses,
  serverReadToken,
}: {
  academyId: string;
  initialClasses: MonitoringClassSummary[];
  serverReadToken?: string;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const [seed] = React.useState(() => claimServerRead(serverReadToken)
    ? { featureEnabled: true, classes: initialClasses } : undefined);
  const classesQuery = useQuery({
    queryKey: ['academy', academyId, 'teaching-classes'],
    queryFn: () => orpc.monitoring.listAssignedClasses({ academyId }),
    initialData: seed,
    retry: false,
  });
  const classes = classesQuery.data?.classes ?? initialClasses;
  const classIds = React.useMemo(
    () => classes.map((item) => item.classId),
    [classes],
  );
  const { counts, state } = useAssignedClassPresence({ academyId, classIds });
  const ordered = React.useMemo(
    () => orderClassesByActivity(classes, counts),
    [classes, counts],
  );
  const activeCount = ordered.filter((item) => isClassActive(counts[item.classId])).length;

  if (classes.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[15px] font-bold">{t('classes.empty_title')}</h2>
        <p className="mt-1.5 text-[14px] leading-6 text-sub">
          {t('classes.empty_body')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-sub">
            {t('classes.student_count', {
              count: classes.reduce((total, item) => total + item.studentCount, 0),
            })}
          </p>
          {activeCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-1 text-[12.5px] font-bold text-brand">
              <LiveDot />
              {t('classes.active_summary', { count: activeCount })}
            </span>
          ) : null}
        </div>
        <ConnectionBadge state={state} />
      </div>

      {state === 'degraded' ? (
        <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          {t('connection.degraded_body')}
        </p>
      ) : null}

      {/* Explicit columns and min-w-0: an auto column grows to the longest
          truncated description and pushed cards past a phone's edge. */}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ordered.map((item) => (
          <li className="min-w-0" key={item.classId}>
            <ClassCard
              href={`${routes.academy(academySlug)}/teach/classes/${item.classId}`}
              item={item}
              live={counts[item.classId]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClassCard({
  href,
  item,
  live,
}: {
  href: string;
  item: MonitoringClassSummary;
  /** Absent until the presence room answers, or while realtime is down. */
  live: ClassLiveCounts | undefined;
}) {
  const { t } = useTranslation('monitoring');
  const active = isClassActive(live);

  return (
    <Link
      className={`group relative flex h-full flex-col overflow-hidden rounded-card border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
        active ? 'border-brand/40 shadow-sm ring-1 ring-brand/15' : 'border-border hover:border-brand/40'
      }`}
      href={href}
    >

      <div className="flex items-start gap-3">
        <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand'}`}>
          <School className="size-5" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15.5px] font-bold">{item.name}</h2>
          {item.description ? (
            <p className="mt-0.5 truncate text-[12.5px] text-sub">{item.description}</p>
          ) : null}
        </div>
        {active ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide text-on-brand">
            <LiveDot inverted />
            {t('classes.live_badge')}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat icon={BookOpen} label={t('classes.stat_courses')} value={item.courseCount} />
        <Stat icon={Users} label={t('classes.stat_students')} value={item.studentCount} />
        <Stat
          highlight={(live?.online ?? 0) > 0}
          icon={Radio}
          label={t('classes.stat_online')}
          value={live ? live.online : null}
        />
        <Stat
          highlight={(live?.solving ?? 0) > 0}
          icon={PenLine}
          label={t('classes.stat_solving')}
          value={live ? live.solving : null}
        />
      </dl>

      <span
        className={`mt-4 inline-flex items-center gap-1.5 self-start rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${
          active ? 'bg-brand text-on-brand group-hover:bg-brand-deep' : 'bg-brand-soft text-brand group-hover:bg-brand group-hover:text-on-brand'
        }`}
      >
        {t('classes.open')}
        <ArrowRight aria-hidden className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
      </span>
    </Link>
  );
}

/** One figure on the card. A live figure above zero turns blue; zero stays calm. */
function Stat({
  highlight = false,
  icon: Icon,
  label,
  value,
}: {
  highlight?: boolean;
  icon: LucideIcon;
  label: string;
  /** Null while the live count is unknown: shown as a dash, never as 0. */
  value: number | null;
}) {
  return (
    <div className={`rounded-lg px-2.5 py-2 ${highlight ? 'bg-brand-soft text-brand' : 'bg-surface text-sub'}`}>
      <dt className="flex items-center gap-1.5 text-[11.5px] font-semibold">
        <Icon aria-hidden className="size-3.5 shrink-0" />
        {label}
      </dt>
      <dd className={`mt-0.5 text-[17px] font-extrabold tabular-nums ${highlight ? 'text-brand' : 'text-ink'}`}>
        {value ?? '–'}
      </dd>
    </div>
  );
}

function LiveDot({ inverted = false }: { inverted?: boolean }) {
  const color = inverted ? 'bg-on-brand' : 'bg-brand';
  return (
    <span aria-hidden className="relative flex size-2">
      <span className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden ${color}`} />
      <span className={`relative inline-flex size-2 rounded-full ${color}`} />
    </span>
  );
}
