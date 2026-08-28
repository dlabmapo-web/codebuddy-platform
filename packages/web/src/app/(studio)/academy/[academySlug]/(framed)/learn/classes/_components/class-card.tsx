'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { LearnClassSummary } from '@cove/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

import { ClassTeacher } from './class-teacher';

/**
 * One class, as the record it is: what it is called, what it is for, who runs
 * it, and how much it currently opens up.
 *
 * It carries no icon tile of its own. On a page of classes a class glyph
 * repeats what the reader already knows, and the only ornament here — the
 * teacher's monogram — earns its place by identifying a person. Nothing on the
 * card comes from the management surface: it receives a `LearnClassSummary`
 * and builds one URL, so there is no roster, status, or edit action it could
 * render even by mistake.
 */
export function ClassCard({
  academyId,
  summary,
}: {
  academyId: string;
  summary: LearnClassSummary;
}) {
  const academySlug = useAcademySlug();
  const { t } = useLayoutTranslation('learn');
  const count = summary.availableCourseCount;

  return (
    <Link
      className="group flex h-full flex-col rounded-card border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      href={`${routes.academy(academySlug)}/learn/classes/${summary.classId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 truncate text-[15.5px] font-bold tracking-[-0.01em]">
          {summary.name}
        </h2>
        {/* Beside the name because it qualifies it: this is what the class
            opens up right now, not a total it once had. */}
        <span
          className={cn(
            'tabular shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold',
            count > 0 ? 'bg-brand-soft text-brand' : 'bg-muted text-sub',
          )}
        >
          {t('classes.course_count', { count })}
        </span>
      </div>

      {/* Held open even when empty, so the footers of neighbouring cards line
          up and the teacher row stays comparable down the grid. */}
      <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-[13px] leading-[1.6] text-sub">
        {summary.description}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <ClassTeacher teacher={summary.teacher} />
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-bold text-brand">
          {t('classes.open')}
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </Link>
  );
}
