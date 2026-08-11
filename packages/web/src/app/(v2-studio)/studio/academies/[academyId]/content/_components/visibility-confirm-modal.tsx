'use client';

import { EyeOff, RotateCcw } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

type AffectedContent = {
  label: string;
  value: number;
};

/**
 * Hiding is reversible, but parent visibility affects everything below it.
 * This dialog explains that cascade without giving the action the destructive
 * visual weight of deletion.
 */
export function VisibilityConfirmModal({
  affected = [],
  itemTitle,
  kindLabel,
  onCancel,
  onConfirm,
  open,
}: {
  affected?: AffectedContent[];
  itemTitle: string;
  kindLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  const { t } = useLayoutTranslation(['content', 'common']);
  const visibleAffected = affected.filter(({ value }) => value > 0);

  return (
    <Modal onOpenChange={(next) => (next ? null : onCancel())} open={open}>
      <ModalContent
        description={t('visibility_confirm.description', {
          kind: kindLabel,
        })}
        title={t('visibility_confirm.title', { kind: kindLabel })}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <EyeOff className="size-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="break-words text-[15px] font-bold text-ink">
                {itemTitle}
              </p>
              <p className="mt-1 text-[14px] leading-6 text-sub">
                {t('visibility_confirm.student_impact')}
              </p>
            </div>
          </div>

          {visibleAffected.length > 0 ? (
            <div className="mt-5 rounded-xl border border-border bg-canvas px-4 py-3.5">
              <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-sub">
                {t('visibility_confirm.also_hidden')}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {visibleAffected.map(({ label, value }) => (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-sub"
                    key={label}
                  >
                    <strong className="font-mono text-ink tabular-nums">
                      {value}
                    </strong>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success/5 px-3.5 py-3 text-[13.5px] leading-5 text-sub">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-success" />
            <p>{t('visibility_confirm.preserved')}</p>
          </div>
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
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep"
            onClick={onConfirm}
            type="button"
          >
            <EyeOff className="size-4" />
            {t('visibility_confirm.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
