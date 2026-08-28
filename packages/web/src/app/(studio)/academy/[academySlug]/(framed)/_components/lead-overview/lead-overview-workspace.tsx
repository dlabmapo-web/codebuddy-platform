'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type {
  OverviewRange,
  TeamLeadOverview,
  TeamLeadOverviewSection,
} from '@cove/shared';
import { formatShortDateTime } from '@cove/i18n/format';
import {
  BookPlus,
  Clock3,
  History,
  LibraryBig,
  Presentation,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';

import {
  SkeletonColumn,
  SkeletonRegion,
} from '@/components/studio/skeletons';

import { cn } from '@/lib/utils';
import { useLocale } from '@/i18n';

import {
  useLeadOverviewQuery,
  useLeadOverviewState,
} from '../../_hooks/use-lead-overview';
import { catalogIsEmpty } from '../../_lib/lead-view';
import { EmptyState, Panel, ScopeChip } from '../overview-ui/panel';
import { OverviewRankingCard } from '../overview-ranking/overview-ranking-card';
import { BlockerQueue } from './blocker-queue';
import { CatalogPlate } from './catalog-plate';
import { ClassRoster } from './class-roster';
import { ChangeLog } from './change-log';
import { CourseReach } from './course-reach';
import { EffectivenessTabs } from './effectiveness-tabs';
import { OverviewRail, type RailSection } from './overview-rail';

/**
 * The Team Lead's curriculum overview.
 *
 * ## Three acts, not eight cards
 *
 * The page answers one question — is what we teach any good, and is it actually
 * reaching anyone — and it answers it in three movements:
 *
 * 1. **What exists.** The catalog, drawn as the page's opening claim rather
 *    than as the first of a queue of equals, and then the roster: who teaches
 *    it, and to how many. Two halves of one answer — the catalog is what has
 *    been written, the roster is whether anybody is delivering it — and a Team
 *    Lead authors the first and staffs the second, so both belong above the
 *    evidence rather than beside it.
 * 2. **What is broken.** The blocker queue, in red, the one place on the page
 *    that asks for work today.
 * 3. **Whether it works.** The four effectiveness measurements behind one tab
 *    strip, then how far each course reaches, then who changed what.
 *
 * Before this the same seven sections were seven identically-weighted cards in
 * one column, each with a rail, an icon, a title, a pill, and a paragraph. Read
 * top to bottom there was no way to tell the summary from the evidence, and
 * four screens of that with no map is the shape of a page nobody finishes.
 *
 * Colour does the grouping now, and it does it at reading strength: a section's
 * hue washes its whole header rather than sitting in a four-pixel rail, so the
 * three acts are legible from across a desk. The hues themselves are unchanged
 * — `lead-view.ts` still says which question wears which — because the four
 * role overviews have to keep reading as one product.
 *
 * ## Where the period control went
 *
 * Into the rail, at the top, always reachable. See `overview-rail.tsx`: the
 * reason it used to sit mid-page is now served better by every section wearing
 * its own `ScopeChip`, which puts a claim and its window inches apart instead
 * of screens.
 *
 * A period change keeps the previous numbers on screen, marked as updating, and
 * dims the page until the new window lands: a link opened from stale data would
 * land on the previous period's rows.
 */
export function LeadOverviewWorkspace({
  academyId,
  hasLeaderboard,
  initialData,
  initialRange,
}: {
  academyId: string;
  hasLeaderboard: boolean;
  initialData: TeamLeadOverview | null;
  initialRange: OverviewRange;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');
  const { range, setRange } = useLeadOverviewState(academyId);
  const overview = useLeadOverviewQuery(
    academyId,
    range,
    initialData,
    initialRange,
  );

  if (overview.isError && !overview.data) {
    return (
      <Panel tinted title={t('unavailable.page_title')} tone="danger">
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
  const empty = catalogIsEmpty(data.catalog);

  const blockerTotal = data.blockers.reduce(
    (total, group) => total + group.total,
    0,
  );
  const findings =
    data.effectiveness.problems.length +
    data.effectiveness.calibration.length +
    data.effectiveness.grind.length +
    data.effectiveness.neverAttemptedTotal;

  /** "As of now" — the two sections a period cannot move. */
  const nowScope = <ScopeChip icon={Clock3}>{t('scope.now')}</ScopeChip>;
  /** The selected window, worn by the sections it actually governs. */
  const periodScope = <ScopeChip>{t(`period.range_${range}`)}</ScopeChip>;

  /** A section, or the fact that its aggregate could not be computed. */
  const section = (
    id: TeamLeadOverviewSection,
    node: React.ReactNode,
    fallbackTitle: string,
  ) =>
    unavailable.has(id) ? (
      <Panel
        className={SCROLL_MARGIN}
        id={id}
        tinted
        title={fallbackTitle}
        tone="danger"
      >
        <div className="p-4">
          <p className="text-[13px] leading-[1.6] text-sub">
            {t('unavailable.section_body')}
          </p>
        </div>
      </Panel>
    ) : (
      node
    );

  const railSections: RailSection[] = [
    {
      count: data.catalog.courses.total,
      icon: LibraryBig,
      id: 'catalog',
      label: t('nav.catalog'),
      tone: 'brand',
    },
    {
      count: data.roster.classes.total,
      icon: Users,
      id: 'roster',
      label: t('nav.roster'),
      tone: 'teal',
    },
    {
      count: blockerTotal,
      icon: ShieldAlert,
      id: 'blockers',
      label: t('nav.blockers'),
      tone: 'danger',
    },
    {
      count: findings,
      icon: Stethoscope,
      id: 'effectiveness',
      label: t('nav.effectiveness'),
      tone: 'warning',
    },
    {
      count: data.courses.length,
      icon: TrendingUp,
      id: 'courses',
      label: t('nav.reach'),
      tone: 'success',
    },
    {
      count: data.changes.length,
      icon: History,
      id: 'changes',
      label: t('nav.changes'),
      tone: 'peer',
    },
  ];

  return (
    <div
      className={cn(
        'flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none',
        isStale && 'opacity-60',
      )}
    >
      <Header academy={data.academy} generatedAt={data.generatedAt} />

      {/*
       * The map, before the territory. Every chip now points down the page,
       * which is the only direction a jump bar reads in — sitting below the
       * first two sections it scrolled the reader backwards to reach them.
       *
       * Not rendered on an academy with no curriculum: there is nothing below
       * to jump to, and a nav bar over a single invitation is furniture.
       */}
      {empty ? null : (
        <OverviewRail
          onRangeChange={setRange}
          period={data.period}
          range={range}
          sections={railSections}
        />
      )}

      {/* ------------------------------------------- act i — what exists */}
      <Panel
        className={SCROLL_MARGIN}
        description={t('catalog.description')}
        icon={LibraryBig}
        id="catalog"
        meta={t('catalog.meta', { count: data.catalog.courses.total })}
        scope={nowScope}
        tinted
        title={t('catalog.title')}
        tone="brand"
      >
        <CatalogPlate catalog={data.catalog} />
      </Panel>

      {section(
        'roster',
        <Panel
          className={SCROLL_MARGIN}
          description={t('roster.description')}
          icon={Users}
          id="roster"
          meta={t('roster.meta', { count: data.roster.classes.total })}
          scope={nowScope}
          tinted
          title={t('roster.title')}
          tone="teal"
        >
          <ClassRoster academyId={academyId} roster={data.roster} />
        </Panel>,
        t('roster.title'),
      )}

      {hasLeaderboard ? (
        <OverviewRankingCard academyId={academyId} audience="staff" />
      ) : null}

      {empty ? (
        // Nothing below this can say anything about a curriculum that does not
        // exist yet, and a rail over six empty panels would read as a broken
        // page on a Team Lead's first day.
        <Panel icon={Sparkles} tinted title={t('first_course.title')} tone="primary">
          <EmptyState
            action={
              <Link
                className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-bold text-on-primary transition-opacity hover:opacity-90"
                href={`${routes.academy(academySlug)}/content/courses`}
              >
                {t('first_course.action')}
              </Link>
            }
            body={t('first_course.body')}
            icon={BookPlus}
            title={t('first_course.empty_title')}
            tone="primary"
          />
        </Panel>
      ) : (
        <>
          {/* ------------------------------------ act ii — what is broken */}
          {section(
            'blockers',
            <Panel
              className={SCROLL_MARGIN}
              description={t('blockers.description')}
              icon={ShieldAlert}
              id="blockers"
              meta={
                blockerTotal > 0
                  ? t('blockers.meta', { count: blockerTotal })
                  : undefined
              }
              scope={nowScope}
              tinted
              title={t('blockers.title')}
              tone="danger"
            >
              <BlockerQueue academyId={academyId} groups={data.blockers} />
            </Panel>,
            t('blockers.title'),
          )}

          {/* --------------------------------- act iii — does any of it work */}
          {section(
            'effectiveness',
            <div className={SCROLL_MARGIN}>
              <EffectivenessTabs
                academyId={academyId}
                effectiveness={data.effectiveness}
                id="effectiveness"
                scope={periodScope}
              />
            </div>,
            t('effectiveness_title'),
          )}

          {section(
            'courses',
            <Panel
              className={SCROLL_MARGIN}
              description={t('reach.description')}
              icon={TrendingUp}
              id="courses"
              meta={t('reach.meta', { count: data.courses.length })}
              scope={periodScope}
              tinted
              title={t('reach.title')}
              tone="success"
            >
              <CourseReach
                academyId={academyId}
                courses={data.courses}
                truncated={data.coursesTruncated}
              />
            </Panel>,
            t('reach.title'),
          )}

          {section(
            'changes',
            <Panel
              className={SCROLL_MARGIN}
              description={t('changes.description')}
              icon={History}
              id="changes"
              scope={periodScope}
              tinted
              title={t('changes.title')}
              tone="peer"
            >
              <ChangeLog rows={data.changes} />
            </Panel>,
            t('changes.title'),
          )}

          <QuickActions academyId={academyId} />
        </>
      )}
    </div>
  );
}

/**
 * Enough clearance for the two sticky bars a jump link lands underneath.
 *
 * The studio header is 3.5rem and the rail sits directly below it; without
 * this, every chip in the rail scrolls its own section behind the rail that
 * linked to it.
 */
const SCROLL_MARGIN = 'scroll-mt-[8.5rem]';

/**
 * The academy, and the instant the page was measured.
 *
 * The heading is the largest thing on the page and the only thing set at
 * display size, because a reader landing here should know whose curriculum
 * this is before they read a single number.
 */
function Header({
  academy,
  generatedAt,
}: {
  academy: TeamLeadOverview['academy'];
  generatedAt: string;
}) {
  const { t } = useTranslation('lead');
  const locale = useLocale();
  const stamp = formatShortDateTime(generatedAt, locale);

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-brand">
          <span aria-hidden className="h-px w-5 bg-brand" />
          {t('eyebrow')}
        </p>
        <h1 className="mt-1.5 truncate text-[26px] font-extrabold leading-tight tracking-[-0.03em]">
          {t('heading', { academy: academy.name })}
        </h1>
      </div>
      <p className="font-mono text-[11.5px] font-bold tabular-nums text-sub">
        {t('as_of', { stamp, zone: academy.timeZone })}
      </p>
    </header>
  );
}

/** Where to start, when nothing above needed fixing. */
function QuickActions({ academyId }: { academyId: string }) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');
  const base = `${routes.academy(academySlug)}`;
  const actions = [
    {
      href: `${base}/content/courses`,
      icon: BookPlus,
      key: 'course',
      wash: 'bg-brand/10 text-brand',
      hover: 'hover:border-brand/40 hover:bg-brand/5',
    },
    {
      href: `${base}/classes`,
      icon: Presentation,
      key: 'class',
      wash: 'bg-teal/10 text-teal',
      hover: 'hover:border-teal/40 hover:bg-teal/5',
    },
  ] as const;

  return (
    <nav aria-label={t('actions.label')} className="grid gap-3 sm:grid-cols-2">
      {actions.map((action) => (
        <Link
          className={cn(
            'group flex items-center gap-3 rounded-card border border-border bg-card px-4 py-3.5 transition-colors',
            action.hover,
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
          )}
          href={action.href}
          key={action.key}
        >
          <span
            aria-hidden
            className={cn(
              'grid size-9 shrink-0 place-items-center rounded-xl',
              action.wash,
            )}
          >
            <action.icon className="size-[1.15rem]" strokeWidth={2.25} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold">
              {t(`actions.${action.key}.title`)}
            </span>
            <span className="block text-[12px] text-sub">
              {t(`actions.${action.key}.body`)}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** The page's shape before its first answer, so nothing jumps when it lands. */
function OverviewSkeleton() {
  // The shell's own word for this, not the page's: neither namespace has
  // one, and inventing a per-role phrasing for a state every page shares
  // would be three spellings of the same second.
  const { t } = useLayoutTranslation('common');
  return (
    <SkeletonRegion className="flex flex-col gap-4" label={t('state.loading')}>
      <SkeletonColumn heights={[3, 18, 3, 14, 14]} />
    </SkeletonRegion>
  );
}
