'use client';

import { AlertTriangle, Check, Undo2, X } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';

import type { CourseBuilderState } from '../_hooks/use-course-builder';

/** Long enough to notice a wrong move and reach for undo; short enough to leave. */
const NOTICE_MS = 10_000;

/**
 * What a move did, with a way to take it back.
 *
 * A status region rather than an alert, and it never takes focus: the author
 * is looking at the outline where the row just landed, and pulling focus down
 * here would scroll them away from it.
 */
export function MoveToast({ builder }: { builder: CourseBuilderState }) {
  const { t } = useTranslation('content');
  const errorText = useErrorText();
  const { notice, dismissNotice } = builder;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissNotice, NOTICE_MS);
    return () => clearTimeout(timer);
    // Restarted per notice, not per render: `dismissNotice` is a new function
    // every render and must not keep pushing the deadline back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
      role="status"
    >
      {notice ? (
        <div className="cove-hint-in pointer-events-auto flex max-w-xl items-center gap-3 rounded-xl bg-ink px-4 py-3 text-[14px] font-semibold text-card shadow-2xl">
          {notice.kind === 'moved' || notice.kind === 'undone' ? (
            <Check aria-hidden className="size-4 shrink-0" />
          ) : (
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning" />
          )}
          <span className="min-w-0 flex-1">
            {notice.kind === 'moved'
              ? t('move.moved_toast', {
                  title: notice.move.title,
                  destination: notice.destination,
                })
              : notice.kind === 'undone'
                ? t('move.undone')
                : notice.kind === 'undo_unavailable'
                  ? t('move.undo_unavailable')
                  : notice.kind === 'move_failed'
                    ? `${t('move.move_failed')} ${errorText(notice.error, '')}`.trim()
                    : `${t('move.undo_failed')} ${errorText(notice.error, '')}`.trim()}
          </span>
          {notice.kind === 'moved' ? (
            <button
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[13.5px] font-bold text-brand-soft underline-offset-2 transition-colors hover:underline disabled:opacity-50"
              disabled={builder.movePending}
              onClick={() => void builder.undoMove(notice.move)}
              type="button"
            >
              <Undo2 aria-hidden className="size-3.5" />
              {t('move.undo')}
            </button>
          ) : null}
          <button
            aria-label={t('move.dismiss')}
            className="grid size-7 shrink-0 place-items-center rounded-md text-card/70 transition-colors hover:text-card"
            onClick={dismissNotice}
            type="button"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
