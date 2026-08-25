'use client';

import { Eye, LoaderCircle, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Two exercises at once, said plainly.
 *
 * The header prints where the screen is; this prints where the student is, and
 * the gap between them is the entire reason preview mode needs a persistent
 * banner rather than a badge. It is the only place both facts appear together,
 * so a teacher can never be reading ahead while believing they are watching.
 */
export function PreviewBanner({
  liveTitle,
  onReturn,
  previewTitle,
  returning,
}: {
  /** Null when the student is not on a monitorable exercise right now. */
  liveTitle: string | null;
  onReturn: () => void;
  previewTitle: string;
  returning: boolean;
}) {
  const { t } = useTranslation('monitoring');

  return (
    <div
      aria-live="polite"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-brand/25 bg-brand-soft px-4 py-2"
    >
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand">
        <Eye aria-hidden className="size-3" />
        {t('preview.badge')}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand">
        {liveTitle
          ? t('preview.banner', { preview: previewTitle, live: liveTitle })
          : t('preview.banner_unavailable', { preview: previewTitle })}
      </p>
      {liveTitle ? (
        <button
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 text-[12.5px] font-bold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60"
          disabled={returning}
          onClick={onReturn}
          type="button"
        >
          {returning ? (
            <LoaderCircle aria-hidden className="size-3 animate-spin" />
          ) : (
            <Radio aria-hidden className="size-3" />
          )}
          {returning ? t('preview.returning') : t('preview.return')}
        </button>
      ) : null}
    </div>
  );
}
