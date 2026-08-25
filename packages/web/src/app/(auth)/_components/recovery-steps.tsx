'use client';

import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Where the person is in the recovery route.
 *
 * Numbered because this flow genuinely is an ordered sequence, and an unusual
 * one: it leaves this tab for an inbox and can come back in a different
 * browser on a different device. The lit stop answers the question that
 * hand-off creates — "did that work, and what happens next?" — which no amount
 * of body copy on a single screen can.
 */
export type RecoveryStep = 'username' | 'email' | 'password';

const order: RecoveryStep[] = ['username', 'email', 'password'];

const line = 'mt-[15px] h-[2px] flex-1 rounded-full';

export function RecoverySteps({ current }: { current: RecoveryStep }) {
  const { t } = useTranslation('auth');
  const activeIndex = order.indexOf(current);

  const labels: Record<RecoveryStep, string> = {
    username: t('recovery.step_username'),
    email: t('recovery.step_email'),
    password: t('recovery.step_password'),
  };

  return (
    <nav aria-label={t('recovery.steps_label')} className="mb-8">
      <ol className="flex items-start">
        {order.map((step, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li className="flex flex-1 items-start" key={step}>
              <span
                aria-hidden
                className={`${line} ${index <= activeIndex ? 'bg-success' : 'bg-border'} ${
                  index === 0 ? 'invisible' : ''
                }`}
              />
              <span className="flex w-24 shrink-0 flex-col items-center gap-2">
                <span
                  aria-current={active ? 'step' : undefined}
                  className={[
                    'flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold tabular-nums transition-colors',
                    done ? 'bg-success text-on-success' : '',
                    active ? 'bg-brand text-on-brand ring-4 ring-brand/15' : '',
                    !done && !active ? 'border border-border bg-card text-sub' : '',
                  ].join(' ')}
                >
                  {done ? <Check aria-hidden size={16} strokeWidth={3} /> : index + 1}
                  <span className="sr-only">
                    {done
                      ? t('recovery.step_done')
                      : active
                        ? t('recovery.step_current')
                        : t('recovery.step_upcoming')}
                  </span>
                </span>
                <span
                  className={`text-center text-[12px] leading-4 ${
                    active ? 'font-semibold text-ink' : 'text-sub'
                  }`}
                >
                  {labels[step]}
                </span>
              </span>
              <span
                aria-hidden
                className={`${line} ${index < activeIndex ? 'bg-success' : 'bg-border'} ${
                  index === order.length - 1 ? 'invisible' : ''
                }`}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
