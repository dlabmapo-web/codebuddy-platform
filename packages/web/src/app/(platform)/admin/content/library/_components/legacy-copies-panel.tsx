'use client';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

type Copy = {
  courseId: string;
  academyName: string;
  title: string;
  linked: boolean;
  releaseId: string | null;
};
export function LegacyCopiesPanel({
  courseId,
  initial,
}: {
  courseId: string;
  initial: Copy[];
}) {
  const { t } = useTranslation('platform-library');
  const errorText = useErrorText();
  const [copies, setCopies] = React.useState(initial);
  const [review, setReview] = React.useState<{
    id: string;
    hash: string;
    count: number;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  async function preview(id: string) {
    setBusy(true);
    setError(null);
    try {
      const p = await orpc.platformLibrarySync.linkPreview({
        copyCourseId: id,
      });
      setReview({ id, hash: p.hash, count: p.nodeCount });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function link() {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      await orpc.platformLibrarySync.linkCopy({
        courseId,
        copyCourseId: review.id,
        expectedHash: review.hash,
      });
      setCopies((c) =>
        c.map((row) =>
          row.courseId === review.id ? { ...row, linked: true } : row,
        ),
      );
      setReview(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const pending = copies.filter((c) => !c.linked);
  if (!pending.length) return null;
  return (
    <section className="mb-4 rounded-card border border-border bg-card p-4">
      <h2 className="font-bold">{t('legacy.title')}</h2>
      <p className="mt-1 text-sm text-sub">{t('legacy.description')}</p>
      {error ? <p role="alert">{errorText(error)}</p> : null}
      <ul className="mt-3 space-y-2">
        {pending.map((c) => (
          <li
            key={c.courseId}
            className="flex items-center justify-between gap-3"
          >
            <span>
              {c.academyName} · {c.title}
            </span>
            <Button
              disabled={busy || !c.releaseId}
              onClick={() => void preview(c.courseId)}
            >
              {t('legacy.preview')}
            </Button>
          </li>
        ))}
      </ul>
      {review ? (
        <div className="mt-3 rounded border border-border p-3">
          <p className="mb-2 text-sm">
            {t('legacy.review', { count: review.count })}
          </p>
          <Button disabled={busy} onClick={() => void link()}>
            {t('legacy.link')}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => setReview(null)}
          >
            {t('legacy.cancel')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
