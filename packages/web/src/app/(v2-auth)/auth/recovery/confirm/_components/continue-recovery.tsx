'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { RecoverySteps } from '../../../_components/recovery-steps';
import { confirmPasswordRecoveryAction } from '../../actions';

/**
 * The interstitial that spends the recovery token.
 *
 * The token is spent by this POST and by nothing else. Mail scanners, link
 * previewers, and corporate proxies follow the link in an email as a GET, and
 * a one-time token already spent by a scanner is a recovery link that fails
 * for the only person it was meant for.
 */
export function ContinueRecovery({ tokenHash }: { tokenHash: string }) {
  const { t } = useTranslation('auth');

  return (
    <div>
      <RecoverySteps current="email" />

      <form action={confirmPasswordRecoveryAction} className="space-y-6">
        <input name="token_hash" type="hidden" value={tokenHash} />
        <input name="type" type="hidden" value="recovery" />

        <div className="flex gap-3.5 rounded-2xl border border-brand/25 bg-brand-soft p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
            <ShieldCheck aria-hidden size={20} strokeWidth={2} />
          </span>
          <p className="text-[14px] leading-6 text-ink">
            {t('confirm.explanation')}
          </p>
        </div>

        <ContinueButton />
      </form>
    </div>
  );
}

function ContinueButton() {
  const { t } = useTranslation('auth');
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-brand text-[17px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      <KeyRound aria-hidden size={20} strokeWidth={2} />
      {pending ? t('confirm.submitting') : t('confirm.submit')}
    </button>
  );
}
