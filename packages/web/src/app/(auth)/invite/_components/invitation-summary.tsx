import type { AcademyRole } from '@cove/shared';

import { getServerTranslation } from '@/i18n/server/get-server-translation';

/**
 * What this invitation is, before anybody is asked to act on it.
 *
 * The address is the reason this component exists. Acceptance is refused when
 * the signed-in email is not the invited one, and until this the recipient had
 * no way to know which of their addresses that was — so the mismatch was only
 * discovered after an account had already been created under the wrong one.
 */
export async function InvitationSummary({
  academyName,
  email,
  role,
}: {
  academyName: string;
  email: string;
  role: AcademyRole;
}) {
  const { t } = await getServerTranslation(['auth', 'common']);
  return (
    <dl className="mb-6 space-y-3 rounded-xl border border-border bg-canvas px-4 py-3.5 text-[14px] leading-6">
      <Row label={t('invitation.field_academy')} value={academyName} />
      <Row
        label={t('invitation.field_role')}
        value={t(`common:role.${role}`)}
      />
      <Row label={t('invitation.field_email')} value={email} mono />
    </dl>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <dt className="text-sub">{label}</dt>
      <dd
        className={`min-w-0 break-words text-right font-semibold text-ink ${
          mono ? 'font-mono text-[13px]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
