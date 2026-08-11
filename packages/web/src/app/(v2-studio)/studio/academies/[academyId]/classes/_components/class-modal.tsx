'use client';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { ClassesManagerState } from '../_hooks/use-classes-manager';

/**
 * Deliberately just a name and a description. Folding course assignment and
 * enrollment into creation would make one dialog span two different
 * permissions, so both live on the class page instead.
 */
export function ClassModal({ manager }: { manager: ClassesManagerState }) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const errorText = useErrorText();
  const ready = manager.name.trim().length > 0;
  const editing = manager.editing !== null;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeForm();
      }}
      open={manager.formOpen}
    >
      <ModalContent
        description={editing ? t('edit_modal.body') : t('create.body')}
        title={editing ? t('edit_modal.heading') : t('create.heading')}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || manager.submitPending) return;
            manager.submit();
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.name_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={120}
                onChange={(event) => manager.setName(event.target.value)}
                placeholder={t('create.name_placeholder')}
                value={manager.name}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.description_label')}{' '}
                <span className="font-normal text-sub">
                  {t('create.description_optional')}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={2_000}
                onChange={(event) => manager.setDescription(event.target.value)}
                placeholder={t('create.description_placeholder')}
                value={manager.description}
              />
            </label>

            {editing ? null : (
              <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-[13.5px] leading-5 text-sub">
                {t('create.next_step')}
              </p>
            )}

            {manager.submitError ? (
              <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
                {errorText(
                  manager.submitError,
                  editing ? t('edit_modal.failed') : t('create.failed'),
                )}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={manager.closeForm}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || manager.submitPending}
              type="submit"
            >
              {manager.submitPending
                ? t('create.submitting')
                : editing
                  ? t('edit_modal.submit')
                  : t('create.submit')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
