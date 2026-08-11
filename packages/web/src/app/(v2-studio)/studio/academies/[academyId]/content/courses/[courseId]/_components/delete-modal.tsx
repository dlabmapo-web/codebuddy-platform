'use client';

import { TriangleAlert } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

/**
 * Deleting a module or lecture takes everything inside it with it. The count of
 * what goes is stated explicitly, because the row menus alone cannot make the
 * difference between "delete this problem" and "delete this lecture" obvious.
 */
export function DeleteModal({
  cascade,
  itemTitle,
  kind,
  onCancel,
  onConfirm,
  open,
}: {
  /** How many children disappear along with this row. */
  cascade?: { lectures?: number; exercises?: number };
  itemTitle: string;
  kind: 'module' | 'lecture' | 'exercise';
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  const { t } = useLayoutTranslation(['content', 'common']);
  const lectures = cascade?.lectures ?? 0;
  const exercises = cascade?.exercises ?? 0;
  const losesChildren = lectures > 0 || exercises > 0;

  return (
    <Modal onOpenChange={(next) => (next ? null : onCancel())} open={open}>
      <ModalContent title={t(`delete.${kind}_title`)}>
        <div className="px-6 py-5">
          <p className="text-[14.5px] leading-6">
            {t('delete.body', { title: itemTitle })}
          </p>

          {losesChildren ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="text-[14px] leading-6 text-danger">
                <p className="font-bold">{t('delete.cascade_heading')}</p>
                <ul className="mt-1 list-disc pl-4">
                  {lectures > 0 ? (
                    <li>{t('delete.cascade_lectures', { count: lectures })}</li>
                  ) : null}
                  {exercises > 0 ? (
                    <li>
                      {t('delete.cascade_exercises', { count: exercises })}
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          ) : null}

          <p className="mt-4 text-[13.5px] text-sub">
            {t('delete.irreversible')}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={onCancel}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-danger px-5 text-[14.5px] font-bold text-on-danger transition-colors hover:brightness-95"
            onClick={onConfirm}
            type="button"
          >
            {t(`delete.${kind}_confirm`)}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
