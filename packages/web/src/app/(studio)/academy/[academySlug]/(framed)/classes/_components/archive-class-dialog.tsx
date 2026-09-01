'use client';

import { Archive, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

/**
 * Archiving is reversible, so it borrows the curriculum hide dialog's shape
 * rather than the weight of a delete. The counts state exactly how many access
 * paths stop, which is the part a Manager cannot see from the row alone.
 */
export function ArchiveClassDialog({
  courseCount,
  error,
  name,
  onCancel,
  onConfirm,
  pending = false,
  studentCount,
}: {
  courseCount: number;
  error?: ReactNode;
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
  pending?: boolean;
  studentCount: number;
}) {
  const { t } = useLayoutTranslation(['classes', 'common']);
  const affected = [
    { label: t('archive_dialog.affected_courses'), value: courseCount },
    { label: t('archive_dialog.affected_students'), value: studentCount },
  ].filter(({ value }) => value > 0);

  return (
    <Modal onOpenChange={(next) => (next ? null : onCancel())} open>
      <ModalContent
        description={t('archive_dialog.body')}
        title={t('archive_dialog.heading')}
      >
        <div className="px-6 py-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <Archive className="size-5" />
            </span>
            <p className="min-w-0 break-words pt-2 text-[15px] font-bold text-ink">
              {name}
            </p>
          </div>

          {affected.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {affected.map(({ label, value }) => (
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
          ) : null}

          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-success/5 px-3.5 py-3 text-[13.5px] leading-5 text-sub">
            <RotateCcw className="mt-0.5 size-4 shrink-0 text-success" />
            <p>{t('archive_dialog.preserved')}</p>
          </div>
          {error ? (
            <p className="mt-3 text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
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
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
            disabled={pending}
            onClick={onConfirm}
            type="button"
          >
            <Archive className="size-4" />
            {pending
              ? t('archive_dialog.submitting')
              : t('archive_dialog.confirm')}
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
