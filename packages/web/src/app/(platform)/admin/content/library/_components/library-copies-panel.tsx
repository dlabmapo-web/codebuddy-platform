'use client';

import type { LibraryCopy, LibraryCourse } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import { CustomizedMark } from './library-state-chip';

/**
 * Which academies are teaching this master, and how far behind they are.
 *
 * Counts, revisions and names — never a branch's content. Knowing *that* a
 * branch changed its copy is what finds a bad master: five academies rewriting
 * the same lecture is a fault in the lecture. Knowing *how* they changed it is
 * theirs, and is not readable from here.
 *
 * "Behind" is drawn in the draft hue rather than the danger one. A branch on an
 * older revision is not broken — it is teaching the course it adopted, which is
 * the entire promise of copying rather than linking.
 */
export function LibraryCopiesPanel({
  course,
  onClose,
}: {
  course: LibraryCourse | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('platform-library');
  const errorText = useErrorText();
  // Keyed by the course it was fetched for, so opening a second master shows
  // its own copies rather than the previous one's while the request is in
  // flight. Deriving "is this stale" from the key beats clearing state
  // synchronously inside the effect, which costs an extra render pass on every
  // open.
  const [loaded, setLoaded] = React.useState<{
    courseId: string;
    copies: LibraryCopy[];
  } | null>(null);
  const [error, setError] = React.useState<unknown>(null);

  const courseId = course?.id ?? null;
  React.useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    orpc.platformLibrary
      .copies({ courseId })
      .then((result) => {
        if (!cancelled) setLoaded({ courseId, copies: result.copies });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught);
      });
    return () => {
      cancelled = true;
      setError(null);
    };
  }, [courseId]);

  const copies = loaded?.courseId === courseId ? loaded.copies : null;

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={Boolean(course)}>
      <ModalContent
        description={t('copies.body')}
        title={t('copies.heading', { title: course?.title ?? '' })}
      >
        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          {error ? (
            <p className="text-[14px] font-semibold text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : copies === null ? (
            <p className="text-[14px] text-sub">{t('copies.loading')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {copies.map((copy) => {
                const behind =
                  course !== null &&
                  copy.sourceContentRevision < course.contentRevision;
                return (
                  <li
                    className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                    key={copy.courseId}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-ink">
                        {copy.academyName}
                      </p>
                      <p className="truncate text-[13px] text-sub">
                        {copy.courseTitle}
                      </p>
                    </div>
                    {copy.isCustomized ? (
                      <CustomizedMark label={t('copies.customized')} />
                    ) : null}
                    <span
                      className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold tabular-nums ${
                        behind
                          ? 'bg-draft-soft text-draft'
                          : 'bg-canvas text-sub'
                      }`}
                    >
                      {behind
                        ? t('copies.at_revision_behind', {
                            revision: copy.sourceContentRevision,
                          })
                        : t('copies.at_revision_current')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
