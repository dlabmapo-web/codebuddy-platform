import Link from 'next/link';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { routes } from '@/lib/routes';

import { dismissInvitationAction } from '../actions';

/**
 * Both doors, for a visitor with no session.
 *
 * An invitation says nothing about whether its recipient already has a Cove
 * account — a manager invited to a second academy has one, a new student does
 * not — and this page cannot tell. So it does not decide: it names the two
 * paths and lets the person who knows the answer pick. The invitation cookie
 * outlives either trip, and both `loginAction` and `signupAction` come back
 * here when it is set.
 */
export async function InvitationChoice({
  message,
  signedIn,
  signupHref,
}: {
  message?: string;
  signedIn?: boolean;
  signupHref?: string;
}) {
  const { t } = await getServerTranslation(['auth']);
  return (
    <div className="space-y-5">
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <p className="text-sm leading-6 text-sub">
        {message ? t('invitation.unavailable_help') : t('invitation.choice_help')}
      </p>
      {signedIn ? (
        // Only reachable for an invitation that cannot be used. Offering "sign
        // in" to somebody who already is would be no exit at all; the dismiss
        // action drops the cookie and sends them where they belong.
        <form action={dismissInvitationAction}>
          <button
            className="flex h-11 w-full items-center justify-center rounded-xl bg-brand font-semibold text-on-brand transition-colors hover:bg-brand-deep"
            type="submit"
          >
            {t('invitation.dismiss')}
          </button>
        </form>
      ) : (
        <>
          <Link
            className="flex h-11 w-full items-center justify-center rounded-xl bg-brand font-semibold text-on-brand transition-colors hover:bg-brand-deep"
            href={routes.login}
          >
            {t('invitation.sign_in')}
          </Link>
          <Link
            className="flex h-11 w-full items-center justify-center rounded-xl border border-border font-semibold text-sub transition-colors hover:text-ink"
            href={signupHref ?? routes.signup}
          >
            {t('invitation.sign_up')}
          </Link>
        </>
      )}
    </div>
  );
}
