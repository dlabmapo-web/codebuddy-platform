'use client';

import { courseHasNoVisibleContent } from '@cove/shared';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

import { useContentSurface } from '@/components/studio/content-base-path-provider';
import { useLayoutTranslation } from '@/i18n';

import { VisibilityConfirmModal } from '../../../_components/visibility-confirm-modal';
import type { CourseBuilderState } from '../_hooks/use-course-builder';

/**
 * Show or hide every module, lecture and problem in the course at once.
 *
 * A course that arrives complete — copied from the library, or filled by the
 * workbook importer — is several hundred rows, and the per-row toggles that
 * suit a course written by hand are what left those courses published and
 * unable to teach anything. Hiding runs through the same confirmation a single
 * row does, because it is the direction that can take content away from a
 * lesson already in progress.
 */
export function ContentVisibilityControl({
  builder,
}: {
  builder: CourseBuilderState;
}) {
  const { t } = useLayoutTranslation('content');
  const [hiding, setHiding] = useState(false);
  const { course } = builder.tree;
  const everythingVisible =
    course.content.exercises > 0 &&
    course.content.visibleExercises === course.content.exercises;

  return (
    <>
      <button
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13.5px] font-bold text-sub transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
        disabled={builder.setContentVisiblePending}
        onClick={() => {
          if (everythingVisible) {
            setHiding(true);
            return;
          }
          builder.setContentVisible(true);
        }}
        type="button"
      >
        {everythingVisible ? (
          <EyeOff className="size-4" />
        ) : (
          <Eye className="size-4" />
        )}
        {everythingVisible
          ? t('builder.hide_all_content')
          : t('builder.show_all_content')}
      </button>
      <VisibilityConfirmModal
        affected={[
          { label: t('visibility_confirm.lectures'), value: builder.lectureCount },
          {
            label: t('visibility_confirm.problems'),
            value: course.content.exercises,
          },
        ]}
        itemTitle={course.title}
        kindLabel={t('builder.all_content_kind')}
        onCancel={() => setHiding(false)}
        onConfirm={() => {
          setHiding(false);
          builder.setContentVisible(false);
        }}
        open={hiding}
        pending={builder.setContentVisiblePending}
      />
    </>
  );
}

/**
 * The warning that ends the quiet failure.
 *
 * A published course with nothing visible inside it is dropped from the student
 * catalogue and from every class it is assigned to, rather than shown empty —
 * so without this the only signal an academy gets is a student saying they
 * cannot find their course. Deliberately silent on a *hidden* course: that is
 * an ordinary draft, and warning about drafts would teach people to look past
 * the one warning that matters.
 */
export function ContentReadinessNotice({
  builder,
}: {
  builder: CourseBuilderState;
}) {
  const { t } = useLayoutTranslation('content');
  // A library master has no students to be unreachable to, and its course-level
  // state means "adoptable", not "live".
  const isLibrary = useContentSurface() === 'library';
  if (isLibrary) return null;
  if (!courseHasNoVisibleContent(builder.tree.course)) return null;

  return (
    <div className="flex items-start gap-3 rounded-card border border-warning/25 bg-warning/5 px-4 py-3.5">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="min-w-0">
        <p className="text-[14.5px] font-bold text-ink">
          {t('builder.not_teachable_title')}
        </p>
        <p className="mt-0.5 text-[13.5px] leading-[1.55] text-sub">
          {builder.editable
            ? t('builder.not_teachable_body')
            : t('builder.not_teachable_body_readonly')}
        </p>
      </div>
    </div>
  );
}
