'use client';

import type { LearnClassTeacher } from '@cove/shared';
import { UserRound } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

/**
 * Who is responsible for a class, on both student class surfaces.
 *
 * Absence is a state here, not a gap. A class runs unassigned, and the
 * fallback says so in words rather than leaving a blank the reader has to
 * interpret — the same reason both states keep the same shape and height, so a
 * list of classes stays scannable.
 *
 * It never says *why* nobody is named. A suspended teacher, a departed one,
 * and one whose role changed all read alike, because the difference is a
 * management fact and this is a student's page.
 */
export function ClassTeacher({
  teacher,
}: {
  teacher: LearnClassTeacher | null;
}) {
  const { t } = useLayoutTranslation('learn');

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {teacher ? (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-[12.5px] font-bold text-brand"
        >
          {teacher.displayName.charAt(0).toUpperCase()}
        </span>
      ) : (
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border">
          <UserRound aria-hidden className="size-4 text-sub/60" />
        </span>
      )}

      {teacher ? (
        <dl className="min-w-0">
          <dt className="text-[11.5px] leading-tight text-sub">
            {t('classes.taught_by')}
          </dt>
          <dd className="truncate text-[13.5px] font-semibold leading-tight text-ink">
            {teacher.displayName}
          </dd>
        </dl>
      ) : (
        <p className="text-[13px] text-sub">
          {t('classes.teacher_unassigned')}
        </p>
      )}
    </div>
  );
}
