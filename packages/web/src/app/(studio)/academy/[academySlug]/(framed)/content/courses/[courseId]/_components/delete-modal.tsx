'use client';

import type { DeleteImpactInput } from '@cove/shared';
import { TriangleAlert } from 'lucide-react';
import * as React from 'react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useTranslation } from 'react-i18next';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { DeleteImpactNotice } from '@/components/studio/delete-impact-notice';

/**
 * Deleting a module or lecture takes everything inside it with it. The count of
 * what goes is stated explicitly, because the row menus alone cannot make the
 * difference between "delete this problem" and "delete this lecture" obvious.
 */
export function DeleteModal({
  cascade,
  dependencyTitles = [],
  impact,
  itemTitle,
  kind,
  onCancel,
  onConfirm,
  open,
}: {
  /** How many children disappear along with this row. */
  dependencyTitles?: string[];
  cascade?: { lectures?: number; exercises?: number; documents?: number; explanations?: number };
  /** What to count as students' work lost with this delete (QA-004). */
  impact?: DeleteImpactInput;
  itemTitle: string;
  kind: 'module' | 'lecture' | 'exercise' | 'pdf' | 'explanation';
  onCancel: () => void;
  /**
   * Resolves once the delete is done; the dialog then closes itself. A
   * rejection keeps it open with the reason shown here, where the person is
   * looking, rather than at the foot of a long course page (QA-004).
   */
  onConfirm: () => Promise<unknown>;
  open: boolean;
}) {
  const errorText = useErrorText();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const confirm = () => {
    setPending(true);
    setError(null);
    onConfirm().then(
      () => {
        setPending(false);
        onCancel();
      },
      (reason: unknown) => {
        setPending(false);
        setError(reason);
      },
    );
  };
  const close = () => {
    if (pending) return;
    setError(null);
    onCancel();
  };
  const { t } = useTranslation(['content', 'common', 'pdf-practice', 'material-picker']);
  const lectures = cascade?.lectures ?? 0;
  const exercises = cascade?.exercises ?? 0;
  const documents = cascade?.documents ?? 0;
  const explanations = cascade?.explanations ?? 0;
  const losesChildren = lectures > 0 || exercises > 0 || documents > 0 || explanations > 0;

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={open}>
      <ModalContent title={kind === 'explanation' ? t('material-picker:explanation.delete_title') : t(`delete.${kind}_title`)}>
        <div className="px-6 py-5">
          <p className="text-[14.5px] leading-6">
            {t('delete.body', { title: itemTitle })}
          </p>

          {dependencyTitles.length ? <div role="alert" className="mt-3 text-sm text-danger"><p>{t("pdf-practice:in_use")}</p><ul className="list-disc pl-5">{dependencyTitles.map((title, index) => <li key={index}>{title}</li>)}</ul></div> : null}
          {losesChildren ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              <div className="text-[14px] leading-6 text-danger">
                <p className="font-bold">{t('delete.cascade_heading')}</p>
                <ul className="mt-1 list-disc pl-4">
                  {lectures > 0 ? (
                    <li>{t('delete.cascade_lectures', { count: lectures })}</li>
                  ) : null}
                  {explanations > 0 ? <li>{t('material-picker:explanation.count', { count: explanations })}</li> : null}
                  {documents > 0 ? (
                    <li>{t('pdf.document_count', { count: documents })}</li>
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

          {impact ? <DeleteImpactNotice input={impact} open={open} /> : null}

          <p className="mt-4 text-[13.5px] text-sub">
            {t('delete.irreversible')}
          </p>
          {error ? (
            <p className="mt-3 text-[14px] font-semibold text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <button
            className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
            disabled={pending}
            onClick={close}
            type="button"
          >
            {t('common:action.cancel')}
          </button>
          <button
            className="h-11 rounded-lg bg-danger px-5 text-[14.5px] font-bold text-on-danger transition-colors hover:brightness-95"
            disabled={dependencyTitles.length > 0 || pending}
            onClick={confirm}
            type="button"
          >
            {kind === 'explanation' ? t('material-picker:explanation.delete_confirm') : t(`delete.${kind}_confirm`)}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
