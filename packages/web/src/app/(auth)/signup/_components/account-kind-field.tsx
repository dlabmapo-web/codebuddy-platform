'use client';

import { useTranslation } from 'react-i18next';
import { signupKinds, type SignupKind } from '@cove/shared';

/**
 * The first question the signup form asks, and the only one that changes what
 * it asks next.
 *
 * Deliberately not a role. Choosing 학생 does not make anybody a student — an
 * academy role still comes only from a manager approving the join request this
 * signup creates, exactly as it did before. What this decides is whether Cove
 * asks for an email address, because an elementary student does not have one
 * and requiring it kept them out of the platform entirely.
 *
 * A segmented control rather than a dropdown: there are two options, both fit
 * on one line, and the choice governs whether a field below appears — which a
 * reader should be able to connect to something already on screen rather than
 * to a menu they have closed.
 */
export function AccountKindField({
  value,
  onChange,
}: {
  value: SignupKind;
  onChange: (kind: SignupKind) => void;
}) {
  const { t } = useTranslation('auth');
  return (
    <fieldset>
      <legend className="mb-1.5 block text-[14px] font-semibold text-ink">
        {t('field.account_kind')}
      </legend>
      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-surface p-1"
        role="radiogroup"
      >
        {signupKinds.map((kind) => {
          const selected = value === kind;
          return (
            <button
              aria-checked={selected}
              className={[
                'h-10 rounded-lg text-[14px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
                selected
                  ? 'bg-brand text-on-brand'
                  : 'text-sub hover:text-ink',
              ].join(' ')}
              key={kind}
              onClick={() => onChange(kind)}
              role="radio"
              type="button"
            >
              {t(`field.account_kind_${kind === 'STUDENT' ? 'student' : 'staff'}`)}
            </button>
          );
        })}
      </div>
      {/*
        Says what this control changes, and only that: whether an email is
        asked for. It used to also say that a manager sets the real role —
        which the notice at the foot of the form says too, two hundred pixels
        below. One sentence, one job; the notice keeps the role message.
      */}
      <p className="mt-1.5 text-[13px] leading-5 text-sub">
        {t('field.account_kind_hint')}
      </p>
    </fieldset>
  );
}
