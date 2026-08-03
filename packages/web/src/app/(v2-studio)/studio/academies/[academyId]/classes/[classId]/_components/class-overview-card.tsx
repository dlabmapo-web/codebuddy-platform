'use client';

import type { ClassDetail } from '@cove/shared';
import { enrollmentGrantsAccess } from '@cove/shared';
import { BookOpen, CalendarDays, GraduationCap, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLayoutTranslation } from '@/i18n';

import { useContentDate } from '../../../content/_components/content-date';

/**
 * PLACEHOLDER. No teacher is attached to a class yet — assigning teachers is a
 * non-goal of the current design and arrives with the teacher-monitoring
 * feature. Until the `ClassTeacher` relation exists, this cell shows a fixed
 * name so the layout can be reviewed, and the copy under it says so. Replace
 * both with the real assignment; do not let this reach a customer as fact.
 */
const PLACEHOLDER_TEACHER = 'Cove Teacher';

/** One tinted chip per fact, so the four read apart at a glance. */
const tints = {
  brand: 'bg-brand-soft text-brand',
  green: 'bg-success/10 text-success',
  orange: 'bg-primary-light text-primary',
  slate: 'bg-retired-soft text-retired',
} as const;

/**
 * What a Manager needs to know about this class before touching anything.
 *
 * The two counts carry a qualifier rather than standing alone, because a bare
 * "1 course / 2 students" hides the domain's two silent failures: a course
 * assigned while hidden opens for nobody, and a seat whose membership was
 * suspended or promoted grants nothing. Both look like working access until
 * someone checks. Naming them here is the whole point of the card.
 *
 * A real `<dl>`, not a diagram with an `aria-hidden` fallback — these are
 * label/value pairs and the markup should say so.
 */
export function ClassOverviewCard({ detail }: { detail: ClassDetail }) {
  const { t } = useLayoutTranslation('classes');
  const contentDate = useContentDate();

  const visibleCourses = detail.courses.filter((course) => course.isVisible).length;
  const learning = detail.students.filter(enrollmentGrantsAccess).length;

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      <Fact
        icon={BookOpen}
        label={t('detail.overview.courses')}
        note={
          detail.courses.length === 0
            ? t('detail.overview.courses_none')
            : visibleCourses === detail.courses.length
              ? t('detail.overview.courses_all_visible', {
                  count: visibleCourses,
                })
              : t('detail.overview.courses_some_hidden', {
                  count: detail.courses.length - visibleCourses,
                })
        }
        tint="brand"
        tone={
          detail.courses.length > 0 && visibleCourses < detail.courses.length
            ? 'warn'
            : 'plain'
        }
        value={detail.courses.length}
      />
      <Fact
        icon={Users}
        label={t('detail.overview.students')}
        note={
          detail.studentCount === 0
            ? t('detail.overview.students_none')
            : learning === detail.studentCount
              ? t('detail.overview.students_all_learning', { count: learning })
              : t('detail.overview.students_some_inactive', {
                  count: detail.studentCount - learning,
                })
        }
        tint="green"
        tone={
          detail.studentCount > 0 && learning < detail.studentCount
            ? 'warn'
            : 'plain'
        }
        value={detail.studentCount}
      />
      <Fact
        icon={GraduationCap}
        label={t('detail.overview.teacher')}
        note={t('detail.overview.teacher_placeholder')}
        tint="orange"
        value={PLACEHOLDER_TEACHER}
      />
      <Fact
        icon={CalendarDays}
        label={t('detail.overview.last_change')}
        note={t('detail.overview.last_change_note')}
        tint="slate"
        value={contentDate(detail.updatedAt)}
      />
    </dl>
  );
}

function Fact({
  icon: Icon,
  label,
  note,
  tint,
  tone = 'plain',
  value,
}: {
  icon: LucideIcon;
  label: string;
  note: string;
  tint: keyof typeof tints;
  /** `warn` marks a count whose qualifier is the thing worth reading. */
  tone?: 'plain' | 'warn';
  value: ReactNode;
}) {
  // Tabular figures are for counts. A name set in them reads as data rather
  // than as a person, so text values keep the body face and a calmer size.
  const numeric = typeof value === 'number';
  return (
    <div className="min-w-0 bg-white px-5 py-4">
      <dt className="flex items-center gap-2">
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-md ${tints[tint]}`}
        >
          <Icon className="size-4" />
        </span>
        <span className="truncate text-[11.5px] font-bold uppercase tracking-[0.08em] text-sub">
          {label}
        </span>
      </dt>
      <dd className="mt-2.5 min-w-0">
        <p
          className={`truncate font-extrabold leading-tight text-ink ${
            numeric
              ? 'font-mono text-[26px] leading-none tabular-nums'
              : 'text-[17px]'
          }`}
        >
          {value}
        </p>
        <p
          className={`mt-1.5 truncate text-[13px] ${
            tone === 'warn' ? 'font-semibold text-draft' : 'text-sub'
          }`}
          title={note}
        >
          {note}
        </p>
      </dd>
    </div>
  );
}
