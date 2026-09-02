'use client';

import type { PlatformClass } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';

import { ProfileAvatar } from '@/components/studio/profile-avatar';

/**
 * The cells two console tables share.
 *
 * The academy detail page and the cross-academy browser render the same two
 * row types — `PlatformCourse` and `PlatformClass` — and answer the same
 * questions about them. Lifted here rather than copied so the teacher-coverage
 * rule and the course chips have one definition: a class that reads as
 * uncovered on one page and covered on the other is worse than either answer.
 */

/** Visible/hidden, running/archived — one badge, because they read the same. */
export function StateBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
        on ? 'bg-success/10 text-success' : 'bg-retired-soft text-retired'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${on ? 'bg-success' : 'bg-retired'}`}
      />
      {label}
    </span>
  );
}

/** How many course chips fit a row before the rest collapse into `+N`. */
const CHIP_LIMIT = 2;

/**
 * The courses a class teaches, named rather than counted.
 *
 * The chips are for a reader who can see them; the accessible name carries the
 * whole list, so `+2` is never the entire answer a screen reader gets.
 */
export function CoursesCell({ courses }: { courses: PlatformClass['courses'] }) {
  const { t } = useTranslation('platform-content');
  if (courses.length === 0) {
    return (
      <span className="text-[13.5px] text-sub/60">{t('table.no_courses')}</span>
    );
  }

  const shown = courses.slice(0, CHIP_LIMIT);
  const rest = courses.length - shown.length;
  return (
    <span
      aria-label={t('table.courses_aria', {
        count: courses.length,
        titles: courses.map((course) => course.title).join(', '),
      })}
      className="flex flex-wrap items-center gap-1"
      role="group"
    >
      {shown.map((course) => (
        <span
          aria-hidden
          className="max-w-[11rem] truncate rounded-md bg-brand-soft px-2 py-0.5 text-[12.5px] font-semibold text-brand"
          key={course.id}
        >
          {course.title}
        </span>
      ))}
      {rest > 0 ? (
        <span
          aria-hidden
          className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[12.5px] font-bold tabular-nums text-sub"
        >
          {t('table.courses_more', { count: rest })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A class running with nobody teaching it is the one condition on this table
 * worth colour, so the empty case is a warning rather than a dash.
 */
export function TeacherCell({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string | null;
}) {
  const { t } = useTranslation('platform-content');
  if (!name) {
    return (
      <span className="whitespace-nowrap rounded-md bg-danger/10 px-2 py-0.5 text-[12.5px] font-bold text-danger">
        {t('table.no_teacher')}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProfileAvatar alt="" globalImageUrl={avatarUrl} name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-ink">
          {name}
        </span>
        <span className="block truncate text-[12.5px] text-sub">
          {t('table.teacher_role')}
        </span>
      </span>
    </span>
  );
}

/**
 * A measurement column: right-aligned, tabular, and grey at zero.
 *
 * The alignment is `meta.align` rather than a class on the value, so the
 * header moves with the digits. Right-aligned figures under a left-aligned
 * label put the two at opposite ends of the cell, and four such columns beside
 * each other stop reading as a row of measurements at all.
 *
 * `flagZero` is for the counts where nothing is a fault rather than a stage: a
 * problem with no test cases cannot grade, while a course with no class is
 * simply authored and not yet delivered.
 */
export function countColumn<T>(
  id: string,
  header: string,
  read: (row: T) => number,
  flagZero = false,
  size = 110,
  /** Off where the number is summed after loading and cannot be ordered by. */
  sortable = false,
): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => read(row),
    header,
    enableSorting: sortable,
    size,
    meta: { align: 'right', hideable: true },
    cell: ({ row }) => {
      const value = read(row.original);
      return (
        <span
          className={`font-mono text-[15px] tabular-nums ${
            value === 0
              ? flagZero
                ? 'font-bold text-danger'
                : 'text-sub/50'
              : 'font-bold text-ink'
          }`}
        >
          {value}
        </span>
      );
    },
  };
}
