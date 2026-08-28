'use client';

import type {
  Leaderboard,
  LeaderboardRow,
  PointsPeriodKind,
  StaffLeaderboard,
  StaffLeaderboardRow,
} from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUp, CalendarRange, School, Trophy, Users } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import { EmptyState, Panel } from '../../_components/overview-ui/panel';
import { FilterSelector } from '../../_components/teacher-overview/filter-selector';
import { rankMarker } from '../_lib/points-view';

/**
 * The class board.
 *
 * A full, named, ordered list — and four things keep it from reading as a
 * verdict on any child.
 *
 * **It expires.** The default period is one day, so every student is level
 * again tomorrow morning and no position outlives the week.
 * **It is earned.** Nobody can grant a point, so a student can always work out
 * why somebody is above them and what would move them up.
 * **The metal stays on the marker.** Nothing tints a row, a name, or an
 * avatar. §11.4 — tint the row and you have made a golden student and, by
 * contrast, a colourless one.
 * **There is no arrow for falling.** A rising marker is information a child
 * can use; a falling one, beside their name on a list their classmates are
 * reading, is a small public demotion that teaches nothing.
 *
 * ## Why the composition is on the row
 *
 * §10.5 promises a student can always work out why somebody is above them. A
 * column of totals honours that only in principle: 30P against 21P says who is
 * ahead and nothing about why, and the gap between "solved more" and "solved
 * harder" is exactly where a child decides the board is unfair. So every row
 * carries what its points are made of — the difficulty split, what was
 * finished, and the counted minutes — and the rules panel below prints what
 * each of those pays. The two together reproduce every total on the screen.
 *
 * It is symmetric by construction: the same fields for every row including the
 * reader's own, so there is nothing here a student can see about a classmate
 * that the classmate cannot see about them.
 *
 * ## Time is shown and never ranks
 *
 * Counted minutes are a column a student may sort by, never the order the
 * board arrives in — §10.3. A child who understands the material solves the
 * same problem in less time, and a board ordered on minutes would place them
 * below a child who struggled.
 */
export function ClassLeaderboard({
  board,
  hideClassFilter = false,
  onSelectClass,
  onSelectPeriod,
  periodKind,
  periodLabel,
  rowAction,
}: {
  board: Leaderboard | StaffLeaderboard | null;
  /** For a caller whose own chrome already chose the class. */
  hideClassFilter?: boolean;
  onSelectClass: (classId: string) => void;
  onSelectPeriod: (period: PointsPeriodKind) => void;
  periodKind: PointsPeriodKind;
  periodLabel: string;
  /**
   * A control at the end of every row, for staff.
   *
   * Only a staff board carries `membershipId`, and only a staff caller passes
   * this — the two travel together by construction, which is why the row is
   * asserted rather than the prop being optional on the student's shape. A
   * student's board has no such column because there is nothing on the other
   * side of it they are allowed to open. §5.1.
   */
  rowAction?: (row: StaffLeaderboardRow) => React.ReactNode;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();

  const columns = React.useMemo<ColumnDef<LeaderboardRow>[]>(
    () => [
      {
        id: 'position',
        header: t('board.column.position'),
        enableSorting: false,
        size: 104,
        cell: ({ row }) => <RankCell locale={locale} row={row.original} />,
      },
      {
        id: 'student',
        // The one column the search reads. Sorting stays off: position is the
        // point of the page, and alphabetising eighteen children serves nobody.
        accessorFn: (row) => row.displayName,
        header: t('board.column.student'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="flex items-center gap-2.5">
            {/* The photo this member uploaded, through the same fallback chain
                the roster and My Page use — the academy override first, then
                the global photo, then a placeholder. Never an empty frame. */}
            <ProfileAvatar
              {...row.original.avatar}
              className="hidden sm:inline-flex"
              name={row.original.displayName}
              size="sm"
            />
            <span className="truncate font-semibold text-ink">
              {row.original.displayName}
            </span>
            {row.original.isYou ? (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-on-brand">
                {t('board.you')}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'points',
        accessorFn: (row) => row.points,
        header: t('board.column.points'),
        size: 112,
        cell: ({ row }) => (
          <span className="font-mono text-[16px] font-bold tabular-nums text-ink">
            {formatNumber(row.original.points, locale)}
            <span className="ml-0.5 text-[13px] font-semibold text-sub">P</span>
          </span>
        ),
      },
      {
        // Sorted on what it contributed, because that is the figure printed
        // large and the one that decides the position above.
        id: 'solved',
        accessorFn: (row) => row.breakdown.solvePoints,
        header: t('board.column.solved'),
        size: 156,
        cell: ({ row }) => (
          <EarnedCell
            detail={[
              {
                key: 'easy',
                count: row.original.breakdown.solvedEasy,
                label: t('board.split.easy', {
                  count: row.original.breakdown.solvedEasy,
                }),
                points: row.original.breakdown.solvedEasyPoints,
              },
              {
                key: 'medium',
                count: row.original.breakdown.solvedMedium,
                label: t('board.split.medium', {
                  count: row.original.breakdown.solvedMedium,
                }),
                points: row.original.breakdown.solvedMediumPoints,
              },
              {
                key: 'hard',
                count: row.original.breakdown.solvedHard,
                label: t('board.split.hard', {
                  count: row.original.breakdown.solvedHard,
                }),
                points: row.original.breakdown.solvedHardPoints,
              },
            ]}
            locale={locale}
            points={row.original.breakdown.solvePoints}
          />
        ),
      },
      {
        id: 'finished',
        accessorFn: (row) => row.breakdown.finishPoints,
        header: t('board.column.finished'),
        size: 148,
        meta: { hideable: true },
        cell: ({ row }) => (
          <EarnedCell
            detail={[
              {
                key: 'lecture',
                count: row.original.breakdown.lectures,
                label: t('board.split.lecture', {
                  count: row.original.breakdown.lectures,
                }),
              },
              {
                key: 'module',
                count: row.original.breakdown.modules,
                label: t('board.split.module', {
                  count: row.original.breakdown.modules,
                }),
              },
              {
                key: 'course',
                count: row.original.breakdown.courses,
                label: t('board.split.course', {
                  count: row.original.breakdown.courses,
                }),
              },
            ]}
            locale={locale}
            points={row.original.breakdown.finishPoints}
          />
        ),
      },
      {
        id: 'attendance',
        accessorFn: (row) => row.breakdown.attendancePoints,
        header: t('board.column.attendance'),
        size: 132,
        meta: { hideable: true },
        cell: ({ row }) => (
          <EarnedCell
            detail={[
              {
                key: 'attendance',
                count: row.original.breakdown.attendance,
                label: t('board.split.attendance', {
                  count: row.original.breakdown.attendance,
                }),
              },
            ]}
            locale={locale}
            points={row.original.breakdown.attendancePoints}
          />
        ),
      },
      {
        id: 'time',
        // Sorted on the points the ladder paid, never on the minutes
        // themselves — §10.3. A student who wants the minutes order still has
        // it, because the rungs are monotonic in time.
        accessorFn: (row) => row.breakdown.learningPoints,
        header: t('board.column.time'),
        size: 140,
        meta: { hideable: true },
        cell: ({ row }) => (
          <EarnedCell
            below={
              <StudyTime
                locale={locale}
                minutes={row.original.breakdown.learningMinutes}
              />
            }
            detail={[]}
            locale={locale}
            points={row.original.breakdown.learningPoints}
          />
        ),
      },
      {
        id: 'activeDays',
        accessorFn: (row) => row.activeDays,
        header: t('board.column.days'),
        size: 96,
        meta: { hideable: true },
        cell: ({ row }) => (
          <span className="font-mono text-[13px] tabular-nums text-sub">
            {row.original.activeDays === 0
              ? '—'
              : formatNumber(row.original.activeDays, locale)}
          </span>
        ),
      },
      ...(rowAction
        ? [
            {
              id: 'actions',
              header: t('board.column.actions'),
              enableSorting: false,
              size: 110,
              cell: ({ row }: { row: { original: LeaderboardRow } }) => (
                <span className="flex justify-end">
                  {rowAction(row.original as StaffLeaderboardRow)}
                </span>
              ),
            } satisfies ColumnDef<LeaderboardRow>,
          ]
        : []),
    ],
    [locale, rowAction, t],
  );

  const classes = board?.classes ?? [];

  return (
    <Panel
      description={t('board.caption_explains')}
      icon={Trophy}
      // Every panel in this product states the denominator its numbers are
      // measured against, right beside its title. Here that is the size of the
      // field: a position is meaningless without the count it is out of.
      meta={
        board?.eligible === true
          ? t('board.participants', { count: board.participants })
          : undefined
      }
      scope={periodLabel}
      title={t('board.title')}
      tone="primary"
    >
      {board === null || board.eligible === false ? (
        <BoardUnavailable
          onSelectPeriod={onSelectPeriod}
          reason={board?.reason ?? null}
        />
      ) : (
        <DataTable
          className="p-4"
          columns={columns}
          data={board.rows}
          frameless
          // On the daily board `activeDays` reads 0 or 1 for everyone, and a
          // column with two possible values is noise rather than a measurement.
          // Every contributor column stays, on every period: they are what the
          // total is made of, and hiding one by default would leave a student
          // adding up four numbers that do not reach the fifth.
          initialColumnVisibility={
            periodKind === 'day' ? { activeDays: false } : undefined
          }
          // The reader's own row, marked so it survives a re-sort or a search.
          // A tint plus an inset rail, both in brand — this marks *your* row on
          // *your* screen, and every student sees exactly one. Identity-neutral
          // by construction, unlike anything keyed to a position.
          rowClassName={(row) =>
            row.isYou
              ? 'bg-brand-soft shadow-[inset_3px_0_0_var(--brand)] hover:bg-brand-soft'
              : undefined
          }
          // §11.5 argued pagination off, because "page 2 of a leaderboard is
          // where last hides". The page size answers that rather than
          // overriding it: an ordinary class of eighteen has no page 2 at all,
          // so nobody's position moves out of sight. It exists for the class
          // that outgrows one screen, where the alternative is not "everyone
          // visible" but a table nobody scrolls to the end of.
          pageSize={25}
          searchPlaceholder={t('board.search')}
          toolbarFilters={
            classes.length > 1 && !hideClassFilter ? (
              // The Studio's own scope filter, the same control the teacher's
              // and the manager's tables use — so it sits on the toolbar line
              // beside the search box and Columns rather than floating in the
              // panel header on its own. No "all" row: §10.2 has no scope
              // wider than the one class a child can move a position in.
              <FilterSelector
                icon={School}
                label={t('board.class_label')}
                onChange={(classId) => {
                  if (classId) onSelectClass(classId);
                }}
                options={classes.map((entry) => ({
                  label: entry.name,
                  value: entry.classId,
                }))}
                triggerClassName="h-10"
                value={board.classId}
              />
            ) : undefined
          }
        />
      )}
    </Panel>
  );
}

/**
 * What one kind of work paid, and what the work was.
 *
 * Points on top, in the same mono figures as the total beside them, because
 * points are the answer to the question this column exists for: *why* is that
 * row above mine. The line underneath says what produced them — three easy
 * problems, one lecture, an hour and a half — so the claim and its evidence
 * are never more than a line apart.
 *
 * The parts are written out. An earlier pass compressed them to `1E 1M 1H`,
 * which saved two centimetres and cost the reader the meaning: a nine-year-old
 * has no reason to know that `H` is hard, and a legend they have to learn is a
 * legend they will not.
 *
 * A part at zero is dropped rather than printed, and a column that paid
 * nothing is an em dash with a spoken label — never a bare `0`, which is the
 * house rule for every missing measurement on these pages.
 */
function EarnedCell({
  below,
  detail,
  locale,
  points,
}: {
  /** Rendered in place of the parts, for a column whose evidence is not a count. */
  below?: React.ReactNode;
  detail: { key: string; count: number; label: string; points?: number }[];
  locale: ReturnType<typeof useLocale>;
  points: number;
}) {
  const { t } = useTranslation('points');
  const present = detail.filter((part) => part.count > 0);

  if (points === 0 && present.length === 0 && !below) {
    return (
      <span className="font-mono text-[13px] tabular-nums text-sub">
        <span aria-hidden>—</span>
        <span className="sr-only">{t('board.split.none')}</span>
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          'font-mono text-[14px] font-semibold tabular-nums',
          points > 0 ? 'text-success' : 'text-sub',
        )}
      >
        {points > 0 ? (
          t('rules.value', { points: formatNumber(points, locale) })
        ) : (
          <span aria-hidden>—</span>
        )}
      </span>

      {below ?? (
        <span className="text-[11.5px] leading-tight text-sub">
          {present.map((part, index) => (
            <React.Fragment key={part.key}>
              {index > 0 ? ' · ' : ''}
              {/* The per-part amount rides in the title rather than on screen:
                  three of them in a 156px cell is a paragraph, and the rules
                  panel below already prints what each difficulty pays. */}
              <span
                title={
                  part.points === undefined
                    ? part.label
                    : t('board.split.worth', {
                        parts: part.label,
                        points: t('rules.value', {
                          points: formatNumber(part.points, locale),
                        }),
                      })
                }
              >
                {part.label}
              </span>
            </React.Fragment>
          ))}
        </span>
      )}
    </span>
  );
}

/**
 * Counted minutes as a duration a child reads, not as a raw count.
 *
 * `95` is a number a reader has to convert; `1h 35m` is one they already
 * understand. Zero is an em dash rather than `0m`, the same rule every other
 * missing measurement on these pages follows.
 */
function StudyTime({
  locale,
  minutes,
}: {
  locale: ReturnType<typeof useLocale>;
  minutes: number;
}) {
  const { t } = useTranslation('points');

  return (
    <span className="font-mono text-[11.5px] tabular-nums text-sub">
      {minutes === 0 ? (
        <span aria-hidden>—</span>
      ) : minutes < 60 ? (
        t('board.time.minutes', { minutes: formatNumber(minutes, locale) })
      ) : (
        t('board.time.hours_minutes', {
          hours: formatNumber(Math.floor(minutes / 60), locale),
          minutes: formatNumber(minutes % 60, locale),
        })
      )}
    </span>
  );
}

/**
 * The marker, and the only place a metal appears.
 *
 * The rising arrow sits with the position because that is what rose. Beside
 * the name it would read as a mark on the child.
 */
function RankCell({ locale, row }: { locale: string; row: LeaderboardRow }) {
  const { t } = useTranslation('points');
  const marker = rankMarker(row.position);
  const position = formatNumber(row.position, locale as never);
  const label = t('board.rank', { position });
  const medal = marker.kind === 'medal' ? marker : null;
  const MedalIcon = medal?.icon;

  return (
    <span className="flex items-center gap-1.5">
      {medal && MedalIcon ? (
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-xl',
            medal.chip,
          )}
        >
          <MedalIcon className="size-[1.15rem]" strokeWidth={2.25} />
        </span>
      ) : (
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center font-mono text-[14px] font-semibold tabular-nums text-sub"
        >
          {position}
        </span>
      )}

      {medal ? (
        <span
          aria-hidden
          className={cn('font-mono text-[14px] font-bold tabular-nums', medal.text)}
        >
          {position}
        </span>
      ) : null}

      {row.improved ? (
        <span
          className="inline-flex items-center text-success"
          title={t('board.improved')}
        >
          <ArrowUp aria-hidden className="size-3.5" strokeWidth={2.75} />
          <span className="sr-only">{t('board.improved')}</span>
        </span>
      ) : null}

      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Why there is no board, and what to do instead.
 *
 * Never a blank panel and never a zero. On the daily view the quiet state is
 * reached and crossed every morning, which is exactly what it is for — so it
 * offers the week rather than leaving a child looking at nothing.
 */
function BoardUnavailable({
  onSelectPeriod,
  reason,
}: {
  onSelectPeriod: (period: PointsPeriodKind) => void;
  reason: string | null;
}) {
  const { t } = useTranslation('points');

  if (reason === 'NO_ACTIVITY_YET') {
    return (
      <EmptyState
        action={
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-[13px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand-soft"
            onClick={() => onSelectPeriod('week')}
            type="button"
          >
            <CalendarRange aria-hidden className="size-4" />
            {t('board.quiet_action')}
          </button>
        }
        body={t('board.quiet_hint')}
        icon={Users}
        title={t('board.quiet')}
        tone="primary"
      />
    );
  }

  if (reason === 'NOT_ENROLLED') {
    return (
      <EmptyState
        body={t('board.not_enrolled_hint')}
        icon={Users}
        title={t('board.not_enrolled')}
        tone="primary"
      />
    );
  }

  if (reason === 'TOO_FEW_STUDENTS') {
    return (
      <EmptyState
        body={t('board.too_few_hint')}
        icon={Users}
        title={t('board.too_few')}
        tone="primary"
      />
    );
  }

  return (
    <EmptyState
      body={t('board.unavailable')}
      icon={Users}
      title={t('board.title')}
      tone="danger"
    />
  );
}
