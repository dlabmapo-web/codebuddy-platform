'use client';

import {
  classNeedsDecision,
  type ClassRosterRow,
  type TeachingRoster,
} from '@cove/shared';
import {
  BookOpen,
  CircleAlert,
  GraduationCap,
  Presentation,
  UserRound,
  UserRoundX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { classHref } from '../../_lib/lead-view';
import { EmptyState } from '../overview-ui/panel';

/**
 * Who teaches what, to how many.
 *
 * The catalog above says what has been written. This says whether anybody is
 * delivering it — and it is the half of the page a Team Lead can act on
 * directly, because assigning a teacher, arranging a class, and attaching a
 * course are all their job rather than somebody else's.
 *
 * ## Three totals, each with its loose end
 *
 * A bare count of teachers answers nothing: the question is not "how many
 * teachers" but "is anybody unaccounted for". So each figure carries the part
 * of itself that needs a decision — teachers running no class, students
 * holding no seat, classes with nobody responsible — and the loose end is
 * printed in the alert hue only when it is not zero. An academy where
 * everything is placed shows three plain numbers and no colour, which is the
 * correct amount of attention for nothing being wrong.
 *
 * ## Students are counted and never named
 *
 * The rule is set in the schema and it holds here: there is no student name, no
 * avatar, and no way to open one from this page. §6.3 — a Team Lead holds
 * `academy.members.read`, and without a hard line this section is how a
 * curriculum page becomes a second teaching dashboard one field at a time.
 *
 * Teachers are named, because the assignment is the fact being reported and
 * "this class has no teacher" cannot be fixed by somebody who cannot see who
 * is on it.
 */
export function ClassRoster({
  academyId,
  roster,
}: {
  academyId: string;
  roster: TeachingRoster;
}) {
  const { t } = useTranslation('lead');

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------- the totals */}
      <div className="grid gap-px bg-border sm:grid-cols-3">
        <Total
          icon={Presentation}
          label={t('roster.classes')}
          loose={roster.classes.loose}
          looseLabel={t('roster.classes_loose', {
            count: roster.classes.loose,
          })}
          value={roster.classes.total}
          wash="bg-teal/10 text-teal"
        />
        <Total
          icon={UserRound}
          label={t('roster.teachers')}
          loose={roster.teachers.loose}
          looseLabel={t('roster.teachers_loose', {
            count: roster.teachers.loose,
          })}
          value={roster.teachers.total}
          wash="bg-peer/10 text-peer"
        />
        <Total
          icon={Users}
          label={t('roster.students')}
          loose={roster.students.loose}
          looseLabel={t('roster.students_loose', {
            count: roster.students.loose,
          })}
          value={roster.students.total}
          wash="bg-brand/10 text-brand"
        />
      </div>

      {/* -------------------------------------------------------- the rows */}
      {roster.rows.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="inline-flex h-9 items-center rounded-lg bg-teal px-3.5 text-[13px] font-bold text-on-teal transition-opacity hover:opacity-90"
              href={`/studio/academies/${academyId}/classes`}
            >
              {t('roster.empty_action')}
            </Link>
          }
          body={t('roster.empty_body')}
          icon={Presentation}
          title={t('roster.empty_title')}
          tone="teal"
        />
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {roster.rows.map((row) => (
            <ClassRow academyId={academyId} key={row.classId} row={row} />
          ))}
        </ul>
      )}

      {roster.rowsTruncated || roster.archivedClasses > 0 ? (
        <p className="flex flex-wrap gap-x-3 border-t border-border px-4 py-2.5 text-[11.5px] font-semibold text-sub">
          {roster.rowsTruncated ? <span>{t('roster.truncated')}</span> : null}
          {roster.archivedClasses > 0 ? (
            <span>
              {t('roster.archived', { count: roster.archivedClasses })}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * One total, and the part of it that is a loose end.
 *
 * The loose end sits under the figure rather than beside it, so the three tiles
 * keep one shape whether or not they have anything to report.
 */
function Total({
  icon: Icon,
  label,
  loose,
  looseLabel,
  value,
  wash,
}: {
  icon: LucideIcon;
  label: string;
  loose: number;
  looseLabel: string;
  value: number;
  wash: string;
}) {
  const { t } = useTranslation('lead');
  return (
    <div className="flex items-center gap-3 bg-card p-4">
      <span
        aria-hidden
        className={cn('grid size-10 shrink-0 place-items-center rounded-xl', wash)}
      >
        <Icon className="size-[1.15rem]" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5">
          <span className="font-mono text-[22px] font-extrabold leading-none tabular-nums">
            {value}
          </span>
          <span className="truncate text-[12.5px] font-bold">{label}</span>
        </p>
        <p
          className={cn(
            'mt-1 truncate text-[11.5px] font-semibold',
            loose > 0 ? 'text-primary' : 'text-sub',
          )}
        >
          {loose > 0 ? looseLabel : t('roster.all_placed')}
        </p>
      </div>
    </div>
  );
}

/**
 * One class: who runs it, how many sit in it, and what it teaches.
 *
 * A class that cannot teach as it stands is marked once, on the left, in the
 * action hue — the same signal the blocker queue uses, so a reader who has met
 * it there does not have to learn a second one. Everything else on the row
 * stays neutral: a small class is not a worse class, and a page that shaded
 * rows by size would be ranking teachers.
 */
function ClassRow({
  academyId,
  row,
}: {
  academyId: string;
  row: ClassRosterRow;
}) {
  const { t } = useTranslation('lead');
  const needsDecision = classNeedsDecision(row);
  const archived = row.status === 'ARCHIVED';

  return (
    <li>
      <Link
        className={cn(
          'group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors',
          'hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          archived && 'opacity-60',
        )}
        href={classHref(academyId, row.classId)}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg',
            needsDecision
              ? 'bg-primary/10 text-primary'
              : 'bg-teal/10 text-teal',
          )}
        >
          {needsDecision ? (
            <CircleAlert className="size-4" strokeWidth={2.25} />
          ) : (
            <Presentation className="size-4" strokeWidth={2.25} />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-[13.5px] font-bold group-hover:text-brand">
              {row.name}
            </span>
            {archived ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-retired/10 text-retired">
                {t('roster.tag_archived')}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-sub">
            {row.courses === 0
              ? t('roster.no_courses')
              : row.courseTitles.join(' · ')}
            {row.courses > row.courseTitles.length
              ? ` ${t('roster.more_courses', {
                  count: row.courses - row.courseTitles.length,
                })}`
              : ''}
          </span>
        </span>

        {/* The teacher, named, or the fact that nobody is. */}
        <span className="flex w-44 shrink-0 items-center gap-2">
          {row.teacher.membershipId && !row.teacher.unavailable ? (
            <>
              <UserRound
                aria-hidden
                className="size-3.5 shrink-0 text-sub"
                strokeWidth={2.25}
              />
              <span className="truncate text-[12.5px] font-semibold text-ink">
                {row.teacher.name ?? t('roster.teacher_unknown')}
              </span>
            </>
          ) : (
            <>
              <UserRoundX
                aria-hidden
                className="size-3.5 shrink-0 text-primary"
                strokeWidth={2.25}
              />
              <span className="truncate text-[12.5px] font-semibold text-primary">
                {row.teacher.unavailable
                  ? t('roster.teacher_unavailable')
                  : t('roster.teacher_none')}
              </span>
            </>
          )}
        </span>

        <span className="flex shrink-0 items-center gap-x-4 gap-y-1">
          <Stat
            icon={GraduationCap}
            label={t('roster.students_count', { count: row.students })}
          />
          <Stat
            icon={BookOpen}
            label={t('roster.exercises_count', { count: row.liveExercises })}
          />
        </span>
      </Link>
    </li>
  );
}

/**
 * One figure on a class row, with the word that says what it counts.
 *
 * The word is on the screen rather than in a `title` and an `sr-only` span. A
 * mortarboard next to a 1 and a book next to a 3 are a guess — a reader has to
 * already know which of a class's several countable things each pictogram
 * stands for, and the two most plausible readings ("3 students" / "3 courses")
 * are both wrong. Tooltips do not fix that: they are unreachable on touch and
 * unread by everyone in a hurry, which on a dashboard is everyone.
 *
 * The icon stays as the thing the eye finds down a column of rows. It is now
 * redundant with the label by design, which is the correct kind of redundancy:
 * shape for scanning, words for meaning.
 */
function Stat({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-sub">
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.25} />
      <span className="font-semibold">{label}</span>
    </span>
  );
}
