'use client';

import { Check } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

export const importStages = ['prepare', 'upload', 'review', 'result'] as const;
export type ImportStage = (typeof importStages)[number];

/**
 * Where you are in an import, and what is still ahead.
 *
 * Numbered, which is a decision rather than a default. §4.2 makes this a real
 * sequence with an enforced order — Review cannot be skipped, and Result cannot
 * be reached without confirming — so the numbers carry information the reader
 * needs: they say how many steps are left, and they say that the order is not
 * theirs to choose. A set of unnumbered labels would imply four tabs.
 *
 * Completed steps take a tick rather than keeping their number, because once a
 * step is behind you its position stops mattering and its state starts to.
 */
export function StageRail({ stage }: { stage: ImportStage }) {
  const { t } = useTranslation('content-import');
  const activeIndex = importStages.indexOf(stage);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {importStages.map((name, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;

        return (
          <li className="flex items-center gap-1" key={name}>
            <span
              aria-current={active ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-[13px] font-bold transition-colors',
                active && 'bg-ink text-card',
                done && 'text-success',
                !active && !done && 'text-sub',
              )}
            >
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-[11.5px] font-extrabold tabular',
                  active && 'bg-card/20 text-card',
                  done && 'bg-success/12 text-success',
                  !active && !done && 'bg-muted text-sub',
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={3} /> : index + 1}
              </span>
              {t(`stage.${name}` as const)}
            </span>
            {index < importStages.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'h-px w-5 sm:w-8',
                  done ? 'bg-success/40' : 'bg-border',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
