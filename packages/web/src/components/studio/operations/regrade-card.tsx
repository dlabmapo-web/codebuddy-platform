'use client';

import type { StaleProblemRow } from '@cove/shared';
import { Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';

/**
 * One operation, with its blast radius stated before the button.
 *
 * A card rather than a toolbar button, because what an operator needs here is
 * not a control — it is a paragraph. This page is opened rarely, under
 * pressure, by somebody who has not read the code, and the copy is the safety
 * mechanism: it says what changes, what does not, and what cannot be undone,
 * in sentences a tired person reads correctly at the end of a shift.
 *
 * The paragraph leads with the consequence rather than the mechanism, and says
 * plainly that points can be *earned* — that is the only irreversible thing
 * this operation does, and burying it under "re-runs submissions" would be
 * dishonest about what the operator is agreeing to.
 */
export function RegradeCard({
  disabled,
  error,
  onPlan,
  pending,
  selected,
}: {
  disabled: boolean;
  error: string | null;
  onPlan: () => void;
  pending: boolean;
  selected: StaleProblemRow | null;
}) {
  const { t } = useTranslation('platform-operations');

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 px-5 pt-5">
        <span
          aria-hidden
          className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
        >
          <Wrench className="size-[1.05rem]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-ink">
            {t('regrade.title')}
          </h2>
          {/* Three paragraphs from one key: the copy is one argument, and
              splitting it into three keys would let a translator reorder it. */}
          {t('regrade.description')
            .split('\n\n')
            .map((paragraph) => (
              <p
                className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-sub"
                key={paragraph.slice(0, 32)}
              >
                {paragraph}
              </p>
            ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold uppercase tracking-wide text-sub">
            {t('regrade.problem_label')}
          </p>
          <p className="truncate text-[14px] font-semibold text-ink">
            {selected?.problemTitle ?? t('regrade.problem_placeholder')}
          </p>
          {error ? (
            <p className="mt-1 text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <Button
          disabled={disabled || !selected || pending || Boolean(selected.inFlightRunId)}
          onClick={onPlan}
        >
          {pending ? t('regrade.planning') : t('regrade.submit')}
        </Button>
      </div>
    </section>
  );
}
