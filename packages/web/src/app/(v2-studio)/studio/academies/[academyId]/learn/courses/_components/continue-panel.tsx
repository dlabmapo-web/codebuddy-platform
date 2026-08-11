'use client';

import type { LearnDraftSummary } from '@cove/shared';
import { Code2, PenLine, X } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

/**
 * v1's `이어서 풀기` drawer, kept because it is the fastest route back into
 * work a student already started. Rebuilt on studio tokens.
 */
export function ContinuePanel({
  academyId,
  drafts,
  discard,
  discardingId,
}: {
  academyId: string;
  drafts: LearnDraftSummary[];
  discard: (materialId: string) => void;
  discardingId: string | null;
}) {
  const { t } = useLayoutTranslation('learn');

  if (drafts.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-card border border-brand/25 bg-brand-soft/40">
      <header className="flex items-center gap-2.5 px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-card text-brand">
          <PenLine className="size-4" />
        </span>
        <h2 className="text-[14px] font-bold">{t('continue.title')}</h2>
        <span className="text-[12.5px] text-sub">
          {t('continue.subtitle', { count: drafts.length })}
        </span>
      </header>

      <ul className="grid gap-px bg-border sm:grid-cols-2">
        {drafts.map((draft) => (
          <li className="flex items-center gap-3 bg-card px-4 py-3" key={draft.materialId}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas text-sub">
              <Code2 className="size-4" />
            </span>
            <Link
              className="min-w-0 flex-1 outline-none focus-visible:underline"
              href={`/studio/academies/${academyId}/learn/exercises/${draft.materialId}`}
            >
              <span className="block truncate text-[13.5px] font-semibold">
                {draft.exerciseTitle}
              </span>
              <span className="block truncate text-[11.5px] text-sub">
                {draft.courseTitle} ·{' '}
                {draft.lineCount > 0
                  ? t('continue.lines', { count: draft.lineCount })
                  : t('continue.empty_lines')}
              </span>
            </Link>
            <button
              aria-label={t('continue.discard')}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              disabled={discardingId === draft.materialId}
              onClick={() => discard(draft.materialId)}
              title={t('continue.discard')}
              type="button"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
