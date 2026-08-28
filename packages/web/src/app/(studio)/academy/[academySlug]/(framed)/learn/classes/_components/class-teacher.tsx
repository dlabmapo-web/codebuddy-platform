'use client';

import type { LearnClassTeacher } from '@cove/shared';
import { UserRound } from 'lucide-react';

import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation } from '@/i18n';

/**
 * Who is responsible for a class, on both student class surfaces.
 *
 * The photo comes through `ProfileAvatar`, the same component the roster and
 * the header use, so a teacher looks the same to their student as they do to
 * their manager — and the academy override still beats the global photo here,
 * because that ordering is decided at render time in one place rather than
 * baked into whatever each surface happened to send.
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
  size = 'sm',
  teacher,
}: {
  /** `md` on the class page, where the teacher is a header fact rather than a row. */
  size?: 'sm' | 'md';
  teacher: LearnClassTeacher | null;
}) {
  const { t } = useLayoutTranslation('learn');

  if (!teacher) {
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border">
          <UserRound aria-hidden className="size-4 text-sub/60" />
        </span>
        <p className="text-[13px] text-sub">
          {t('classes.teacher_unassigned')}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <ProfileAvatar
        academyImageUrl={teacher.academyImageUrl}
        externalAvatarUrl={teacher.externalAvatarUrl}
        globalImageUrl={teacher.globalImageUrl}
        name={teacher.displayName}
        size={size}
      />
      <dl className="min-w-0">
        <dt className="text-[11.5px] leading-tight text-sub">
          {t('classes.taught_by')}
        </dt>
        <dd className="truncate text-[13.5px] font-semibold leading-tight text-ink">
          {teacher.displayName}
        </dd>
      </dl>
    </div>
  );
}
