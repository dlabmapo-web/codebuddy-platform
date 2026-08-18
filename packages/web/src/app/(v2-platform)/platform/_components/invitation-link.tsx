'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The invitation link, shown once and copyable.
 *
 * Only the token's hash is stored, so this is the one moment it can be
 * displayed — the same reason and the same treatment the manager's invitation
 * modal gives it.
 *
 * It is not a development convenience, though it is what makes the console
 * usable on a machine with no email provider. Delivery can fail anywhere: a
 * bounced address, a provider outage, a manager whose filter ate it. The person
 * who created the academy is the one who can still reach its manager by hand,
 * and this is the only window in which they can.
 */
export function InvitationLink({ token, academyId }: {
  token: string;
  academyId: string;
}) {
  const { t } = useTranslation('platform');
  const [copied, setCopied] = React.useState(false);

  // Built in the browser so the link always matches the origin the operator is
  // actually using, rather than whatever the server thinks it is.
  const [href, setHref] = React.useState('');
  React.useEffect(() => {
    setHref(
      `${window.location.origin}/auth/invitations/${token}?academy=${academyId}`,
    );
  }, [academyId, token]);

  return (
    <div className="rounded-xl border border-brand/25 bg-brand-soft/50 p-4 text-left">
      <p className="text-[13px] font-bold text-brand-deep">
        {t('invite_link.notice')}
      </p>
      <div className="mt-2 flex gap-2">
        <input
          aria-label={t('invite_link.label')}
          className="min-w-0 flex-1 rounded-lg border border-border bg-card px-3 py-2 font-mono text-[12px] text-ink"
          readOnly
          value={href}
        />
        <button
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-bold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2_000);
            } catch {
              // A refused clipboard is not a failure worth a banner: the field
              // beside this button holds the link and can be selected by hand.
            }
          }}
          type="button"
        >
          {copied ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? t('invite_link.copied') : t('invite_link.copy')}
        </button>
      </div>
    </div>
  );
}
