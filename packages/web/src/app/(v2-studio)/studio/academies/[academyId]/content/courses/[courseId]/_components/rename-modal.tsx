'use client';

import { useState } from 'react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

export function RenameModal({
  kind,
  onCancel,
  onSave,
  open,
  value,
}: {
  kind: 'module' | 'lecture';
  onCancel: () => void;
  onSave: (title: string) => void;
  open: boolean;
  value: string;
}) {
  const { t } = useLayoutTranslation(['content', 'common']);
  const [title, setTitle] = useState(value);
  const trimmed = title.trim();
  const unchanged = trimmed === value.trim();

  return (
    <Modal
      onOpenChange={(next) => {
        if (next) return;
        onCancel();
      }}
      open={open}
    >
      <ModalContent
        description={t(`rename.${kind}_body`)}
        title={t(`rename.${kind}_title`)}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmed || unchanged) return;
            onSave(trimmed);
          }}
        >
          <div className="px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t(`rename.${kind}_label`)}
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                value={title}
              />
            </label>
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
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!trimmed || unchanged}
              type="submit"
            >
              {t('rename.save')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
