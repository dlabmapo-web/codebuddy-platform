'use client';

import { LogOut } from 'lucide-react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

export function SignOutConfirmModal({
  onCancel,
  onConfirm,
  pending = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useLayoutTranslation('common');

  return (
    <Modal onOpenChange={(next) => (next ? null : onCancel())} open>
      <ModalContent
        description={t('sign_out_confirm.description')}
        title={t('sign_out_confirm.title')}
      >
        <div className="px-6 py-5">
          {/* Same plate motif as the points page: one soft brand wash, a
              brand-tinted border, and a solid chip riding on top of it —
              rather than a flat grey row that looks like an error state. */}
          <div className="relative flex items-center gap-4 overflow-hidden rounded-card border border-brand/20 bg-brand-soft px-4 py-4">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.07] via-transparent to-brand/[0.05]"
            />
            <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand shadow-[var(--shadow-card)]">
              <LogOut className="size-5" strokeWidth={2.25} />
            </span>
            <p className="relative text-[13.5px] leading-6 text-ink">
              {t('sign_out_confirm.body')}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
            disabled={pending}
            onClick={onCancel}
            type="button"
          >
            {t('action.cancel')}
          </button>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-50"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <LogOut className="size-4" />
            {pending
              ? t('sign_out_confirm.confirming')
              : t('sign_out_confirm.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
