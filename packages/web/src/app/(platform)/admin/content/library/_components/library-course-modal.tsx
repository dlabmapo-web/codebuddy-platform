'use client';

import type { LibraryCourse } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { CoursePathPreview } from '@/components/studio/course-path-preview';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * Name a master course, or correct the name of one.
 *
 * One dialog for both, as the academy's own course modal is: the fields are
 * identical and a second component would be a second place for the title rule
 * to drift.
 *
 * The two differ in where they land. Creating calls
 * `platformLibrary.create` — the only call in either library contract that
 * cannot name an academy, because it resolves the organization's library and
 * makes one if this is the first course anyone has published. Editing calls
 * `academyCourses.update`, the same endpoint a Team Lead's rename uses, once
 * the library exists and its academy is known.
 *
 * The authoring-path preview shows only when creating. It answers "what do I
 * do after this", which is not a question somebody fixing a typo is asking.
 */
export function LibraryCourseModal({
  academyId,
  course,
  onClose,
  onDone,
  open,
}: {
  /** Required to edit. Null only while no library exists, when only creating
   *  is possible anyway. */
  academyId: string | null;
  /** The course being renamed, or null when creating. */
  course: LibraryCourse | null;
  onClose: () => void;
  onDone: (courseId: string) => void;
  open: boolean;
}) {
  const { t } = useTranslation('platform-library');
  const { t: courses } = useTranslation('courses');
  const errorText = useErrorText();
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const editing = course !== null;

  // Seeded from the row each time the dialog opens on a different course, so
  // reopening on another row never shows the previous one's words.
  //
  // Reset during render rather than in an effect: an effect would paint the
  // stale values once and then correct them, and the rule against
  // synchronous `setState` in an effect exists to stop exactly that. React
  // re-renders immediately when state changes during render, before anything
  // reaches the screen.
  const seedKey = open ? (course?.id ?? 'new') : null;
  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setTitle(course?.title ?? '');
    setDescription(course?.description ?? '');
    setError(null);
  }

  const ready = title.trim().length > 0;

  const close = () => {
    if (busy) return;
    onClose();
  };

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={open}>
      <ModalContent
        description={editing ? t('edit.body') : t('create.body')}
        title={editing ? t('edit.heading') : t('create.heading')}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!ready || busy) return;
            setBusy(true);
            setError(null);
            try {
              if (editing && academyId) {
                await orpc.academyCourses.update({
                  academyId,
                  courseId: course.id,
                  title: title.trim(),
                  description: description.trim(),
                });
                onDone(course.id);
              } else {
                const created = await orpc.platformLibrary.create({
                  title: title.trim(),
                  description: description.trim(),
                });
                onDone(created.id);
              }
            } catch (caught) {
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.title_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('create.title_placeholder')}
                value={title}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.description_label')}{' '}
                <span className="font-normal text-sub">
                  {courses('create.description_optional')}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={10_000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('create.description_placeholder')}
                value={description}
              />
            </label>

            {editing ? null : (
              <CoursePathPreview
                labels={[
                  courses('path.course'),
                  courses('path.module'),
                  courses('path.lecture'),
                  courses('path.problem'),
                ]}
                title={courses('create.next_step')}
              />
            )}

            {error ? (
              <p
                className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger"
                role="alert"
              >
                {errorText(error)}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <Button disabled={busy} onClick={close} type="button" variant="ghost">
              {t('create.cancel')}
            </Button>
            <Button disabled={!ready || busy} type="submit">
              {busy
                ? editing
                  ? t('edit.submitting')
                  : t('create.submitting')
                : editing
                  ? t('edit.submit')
                  : t('create.submit')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
