'use client';

import { Check, EyeOff } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

export type MoveTarget = {
  id: string;
  title: string;
  isVisible: boolean;
};

/**
 * Choose where one item goes among its siblings.
 *
 * A modal rather than a nested menu: a chapter can carry twenty lectures, and
 * a list that long needs to scroll and to be read, not hovered over.
 *
 * Each destination names the sibling it lands after as well as its ordinal.
 * The list is still in its old order while it is being read, so "2nd" alone is
 * ambiguous — it describes a position that does not exist yet.
 */
export function MoveModal({
  currentIndex,
  kind,
  onCancel,
  onMove,
  open,
  siblings,
}: {
  currentIndex: number;
  kind: 'module' | 'lecture' | 'exercise';
  onCancel: () => void;
  onMove: (toIndex: number) => void;
  open: boolean;
  siblings: readonly MoveTarget[];
}) {
  const { t } = useLayoutTranslation(['content', 'common']);

  return (
    <Modal
      onOpenChange={(next) => {
        if (next) return;
        onCancel();
      }}
      open={open}
    >
      <ModalContent
        description={t('move.body')}
        title={t(`move.${kind}_title`)}
      >
        <ul className="max-h-[22rem] overflow-y-auto px-3 py-3">
          {siblings.map((sibling, index) => {
            const current = index === currentIndex;
            const after = index === 0 ? null : siblings[index - 1];
            return (
              <li key={sibling.id}>
                <button
                  aria-current={current ? 'true' : undefined}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14.5px] transition-colors hover:bg-canvas disabled:pointer-events-none disabled:opacity-45"
                  disabled={current}
                  onClick={() => onMove(index)}
                  type="button"
                >
                  <span className="w-10 shrink-0 font-bold tabular-nums text-sub">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {after
                      ? t('move.after', { title: after.title })
                      : t('move.first')}
                  </span>
                  {sibling.isVisible ? null : (
                    <EyeOff aria-label={t('move.hidden')} className="size-4 shrink-0 text-sub" />
                  )}
                  {current ? (
                    <span className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-sub">
                      <Check className="size-4" />
                      {t('move.current')}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            onClick={onCancel}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
