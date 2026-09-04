'use client';

import { Check } from 'lucide-react';

import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

/**
 * Where somebody is in the process of becoming a member.
 *
 * Three steps, and the third is the reason this exists. Approval is not the
 * end — an approved student with no class still opens an empty class page, and
 * before this nothing in the product ever said that was expected. Naming
 * "Join a class" as a step means the emptiness after approval reads as a
 * position on a path rather than as a fault.
 *
 * The middle node is the only thing on the lobby that moves. It is the one
 * fact the page exists to communicate — something is happening, elsewhere,
 * without you — and a page about waiting that is entirely still reads as a
 * page that has stopped. Everything else here holds completely steady, which
 * is what lets one slow pulse carry meaning instead of reading as decoration.
 */
export function ApplicationTracker() {
  const { t } = useTranslation('lobby');
  const steps = [
    { id: 'account', state: 'done' as const },
    { id: 'review', state: 'current' as const },
    { id: 'join', state: 'todo' as const },
  ];

  return (
    <ol
      aria-label={t('steps.label')}
      className="flex items-start gap-0 pt-1"
    >
      {steps.map((step, index) => (
        <li
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center gap-2 text-center',
            // The connector belongs to the gap between two nodes, so it is
            // drawn by every step but the first — that way it can never
            // dangle off the end of the row.
            index > 0 && 'relative',
          )}
          key={step.id}
        >
          {index > 0 ? (
            <span
              aria-hidden
              className={cn(
                'absolute left-[calc(-50%+1.1rem)] right-[calc(50%+1.1rem)] top-[0.9rem] h-0.5 rounded-full',
                step.state === 'todo' ? 'bg-border' : 'bg-draft',
              )}
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              'relative z-10 grid size-[1.8rem] shrink-0 place-items-center rounded-full text-[12px] font-bold',
              step.state === 'done' && 'bg-success text-on-success',
              step.state === 'current' && 'bg-draft text-on-draft',
              step.state === 'todo' &&
                'border-2 border-dashed border-border bg-card text-sub',
            )}
          >
            {step.state === 'done' ? (
              <Check className="size-4" strokeWidth={3} />
            ) : step.state === 'current' ? (
              <span className="relative flex size-2.5">
                {/* Reduced motion takes the halo away and leaves the dot: the
                    step is still legibly the current one by colour and fill. */}
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-draft opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex size-2.5 rounded-full bg-on-draft" />
              </span>
            ) : (
              index + 1
            )}
          </span>
          <span
            className={cn(
              'text-[12px] font-bold leading-tight',
              step.state === 'todo' ? 'text-sub' : 'text-ink',
            )}
          >
            {t(`steps.${step.id}` as 'steps.account')}
          </span>
        </li>
      ))}
    </ol>
  );
}
