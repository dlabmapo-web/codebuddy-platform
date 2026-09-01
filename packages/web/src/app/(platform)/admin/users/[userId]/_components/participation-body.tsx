'use client';

import type {
  MembershipParticipation,
  ParticipationClass,
} from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import {
  BookOpenCheck,
  CircleCheckBig,
  Clock,
  Eye,
  EyeOff,
  Flame,
  GraduationCap,
  Sparkles,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  durationDisplay,
  meterWidth,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_lib/overview-view';
import {
  EmptyState,
  toneStyles,
  type PanelTone,
} from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * What this person does in this academy, shaped by their role.
 *
 * One switch, four bodies. Exactly one branch of `MembershipParticipation` is
 * populated and it is the one matching `role`, so an unreadable combination is
 * not representable here.
 *
 * ## The colour rule this file must not break
 *
 * Every hue names a *measurement*, never a judgement. A student who has solved
 * nothing gets the same blue tile reading `0`; there is no green student and no
 * red student anywhere on this page. Amber appears once, on a class with no
 * course assigned — that is a configuration fault in the academy, not a fact
 * about a person. §8.3, and the same rule the overview primitives already hold.
 */
export function ParticipationBody({
  participation,
}: {
  participation: MembershipParticipation;
}) {
  if (participation.student) {
    return <StudentBody participation={participation.student} />;
  }
  if (participation.teacher) {
    return <TeacherBody participation={participation.teacher} />;
  }
  if (participation.lead) {
    return <LeadBody participation={participation.lead} />;
  }
  if (participation.manager) {
    return <ManagerBody participation={participation.manager} />;
  }
  return null;
}

/* --------------------------------------------------------------- student */

function StudentBody({
  participation,
}: {
  participation: NonNullable<MembershipParticipation['student']>;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();
  const solvable = participation.courses.reduce(
    (sum, course) => sum + course.total,
    0,
  );

  return (
    <div className="grid gap-5 p-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={CircleCheckBig}
          label={t('participation.solved')}
          // The denominator is the point: "84" alone cannot be read, and a
          // course with no visible exercises would make it a lie.
          sub={
            solvable > 0
              ? t('participation.of_total', { total: solvable })
              : t('participation.no_exercises')
          }
          tone="brand"
          value={participation.solvedCount}
        />
        <Tile
          icon={Clock}
          label={t('participation.active_time')}
          sub={t('participation.active_days', {
            count: participation.activeDays,
          })}
          tone="teal"
          value={<DurationValue seconds={participation.activeSeconds} />}
        />
        <Tile
          icon={Flame}
          label={t('participation.streak')}
          sub={
            participation.lastActiveAt
              ? t('participation.last_active', {
                  date: formatShortDate(participation.lastActiveAt, locale),
                })
              : t('participation.never_active')
          }
          tone="peer"
          value={t('participation.days', { count: participation.streakDays })}
        />
        <Tile
          icon={Sparkles}
          label={t('participation.points')}
          sub={t('participation.attempts', {
            count: participation.totalAttempts,
          })}
          tone="warning"
          value={participation.pointsEarned}
        />
      </div>

      <Section title={t('participation.classes')}>
        {participation.classes.length === 0 ? (
          <EmptyState
            body={t('participation.no_class_body')}
            icon={GraduationCap}
            title={t('participation.no_class')}
            tone="brand"
          />
        ) : (
          <ClassList classes={participation.classes} />
        )}
      </Section>

      {participation.courses.length > 0 ? (
        <Section title={t('participation.courses')}>
          <ul className="grid gap-2.5">
            {participation.courses.map((course) => (
              <li key={course.courseId}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate text-[13.5px] font-bold text-ink">
                    {course.title}
                  </span>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-sub">
                    {course.solved}/{course.total}
                    {' · '}
                    <DurationValue seconds={course.activeSeconds} />
                  </span>
                </div>
                {/* Per course rather than one aggregate: "48 of 120 overall"
                    hides the case this page exists to surface — a student who
                    finished one course and has not opened the other. */}
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full', toneStyles.brand.meter)}
                    style={{
                      width: meterWidth(
                        course.total > 0
                          ? (course.solved / course.total) * 100
                          : 0,
                      ),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- teacher */

function TeacherBody({
  participation,
}: {
  participation: NonNullable<MembershipParticipation['teacher']>;
}) {
  const { t } = useTranslation('platform-users');

  return (
    <div className="grid gap-5 p-4">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <Tile
          icon={BookOpenCheck}
          label={t('participation.classes')}
          tone="peer"
          value={participation.classes.length}
        />
        <Tile
          icon={UsersRound}
          label={t('participation.students')}
          tone="brand"
          value={participation.studentReach}
        />
        <Tile
          icon={GraduationCap}
          label={t('participation.courses')}
          tone="teal"
          value={participation.courseCount}
        />
      </div>

      <Section title={t('participation.classes_taught')}>
        {participation.classes.length === 0 ? (
          <EmptyState
            body={t('participation.no_taught_body')}
            icon={BookOpenCheck}
            title={t('participation.no_taught')}
            tone="peer"
          />
        ) : (
          <ul className="grid gap-2">
            {participation.classes.map((cls) => (
              <li
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2.5"
                key={cls.classId}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    {cls.name}
                  </p>
                  <CourseLine courses={cls.courses} />
                </div>
                <span className="shrink-0 font-mono text-[12px] tabular-nums text-sub">
                  {t('participation.student_count', {
                    count: cls.studentCount,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ lead */

function LeadBody({
  participation,
}: {
  participation: NonNullable<MembershipParticipation['lead']>;
}) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();

  return (
    <div className="grid gap-5 p-4">
      <Section title={t('participation.curriculum')}>
        {participation.courses.length === 0 ? (
          <EmptyState
            body={t('participation.no_courses_body')}
            icon={BookOpenCheck}
            title={t('participation.no_courses')}
            tone="teal"
          />
        ) : (
          <ul className="grid gap-2">
            {participation.courses.map((course) => (
              <li
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2.5"
                key={course.courseId}
              >
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-bold text-ink">
                    {course.title}
                  </p>
                  <p className="text-[12px] text-sub">
                    {t('participation.taught_by_classes', {
                      count: course.classCount,
                    })}
                    {' · '}
                    {formatShortDate(course.updatedAt, locale)}
                  </p>
                </div>
                {/* Visibility is the fact a support call is usually about:
                    "the students cannot see the course" has this as its
                    answer more often than anything else on the page. */}
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                    course.isVisible
                      ? toneStyles.teal.chip
                      : 'bg-muted text-sub',
                  )}
                >
                  {course.isVisible ? (
                    <Eye aria-hidden className="size-3" />
                  ) : (
                    <EyeOff aria-hidden className="size-3" />
                  )}
                  {course.isVisible
                    ? t('participation.visible')
                    : t('participation.hidden')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

/* --------------------------------------------------------------- manager */

/**
 * Deliberately the thinnest of the four. The academy's own console page
 * already answers everything a longer manager card would restate, and the
 * card's footer links straight to it.
 */
function ManagerBody({
  participation,
}: {
  participation: NonNullable<MembershipParticipation['manager']>;
}) {
  const { t } = useTranslation('platform-users');
  const { scale } = participation;

  return (
    <div className="grid gap-2.5 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        icon={UsersRound}
        label={t('participation.members')}
        sub={t('participation.suspended_members', {
          count: scale.suspendedMembers,
        })}
        tone="primary"
        value={scale.activeMembers}
      />
      <Tile
        icon={GraduationCap}
        label={t('participation.students')}
        tone="brand"
        value={scale.students}
      />
      <Tile
        icon={BookOpenCheck}
        label={t('participation.classes')}
        sub={t('participation.archived_classes', {
          count: scale.archivedClasses,
        })}
        tone="peer"
        value={participation.classCount}
      />
      <Tile
        icon={BookOpenCheck}
        label={t('participation.courses')}
        tone="teal"
        value={participation.courseCount}
      />
    </div>
  );
}

/* -------------------------------------------------------------- fragments */

/**
 * One measurement, in the hue that names it.
 *
 * Hue identifies *which measurement this is*, never how good it is — see the
 * file header. The number is in tabular figures so a row of tiles lines up.
 */
function Tile({
  icon: Icon,
  label,
  sub,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  sub?: React.ReactNode;
  tone: PanelTone;
  value: React.ReactNode;
}) {
  const styles = toneStyles[tone];
  return (
    <div className="rounded-lg border border-border px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-sub">
        <span
          aria-hidden
          className={cn('grid size-5 place-items-center rounded', styles.chip)}
        >
          <Icon className="size-3" strokeWidth={2.5} />
        </span>
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 font-mono text-[22px] font-extrabold leading-none tabular-nums',
          styles.text,
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1 text-[12px] text-sub">{sub}</p> : null}
    </div>
  );
}

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div>
      <h4 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-sub">
        {title}
      </h4>
      {children}
    </div>
  );
}

function ClassList({ classes }: { classes: ParticipationClass[] }) {
  const { t } = useTranslation('platform-users');
  const locale = useLocale();

  return (
    <ul className="grid gap-2">
      {classes.map((cls) => (
        <li
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2.5"
          key={cls.classId}
        >
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-ink">
              {cls.name}
            </p>
            <p className="text-[12px] text-sub">
              {cls.teacherName ?? t('participation.no_teacher')}
              {' · '}
              {t('participation.since', {
                date: formatShortDate(cls.enrolledAt, locale),
              })}
            </p>
          </div>
          <CourseLine courses={cls.courses} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The courses a class teaches, or the amber marker saying it teaches none.
 *
 * A class with no course is the configuration fault an operator is most often
 * called about, and this is the one place both halves of it are visible
 * together. Amber, because it is a fault in a setting rather than trouble with
 * an account — red is reserved for the latter.
 */
function CourseLine({ courses }: { courses: ParticipationClass['courses'] }) {
  const { t } = useTranslation('platform-users');

  if (courses.length === 0) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
          toneStyles.warning.chip,
        )}
      >
        <TriangleAlert aria-hidden className="size-3" />
        {t('participation.no_course')}
      </span>
    );
  }
  return (
    <p className="truncate text-[12px] text-sub">
      {courses.map((course) => course.title).join(', ')}
    </p>
  );
}

/** The console's one spelling of a clock, shared with the academy pages. */
function DurationValue({ seconds }: { seconds: number }) {
  const { t } = useTranslation('learning');
  const display = durationDisplay(seconds);
  if (display.kind === 'none') return <>{t('duration.none')}</>;
  return (
    <>
      {display.kind === 'hours'
        ? t('duration.hours', {
            hours: display.hours,
            minutes: display.minutes,
          })
        : t('duration.minutes', { minutes: display.minutes })}
    </>
  );
}
