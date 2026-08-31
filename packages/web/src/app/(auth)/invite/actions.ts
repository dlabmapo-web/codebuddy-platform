'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { authDestination } from '@/lib/academy-access-state';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient, getAccount } from '@/lib/orpc-server';

export type InvitationActionState = { message?: string };

/**
 * Accept, and say what happened when it does not.
 *
 * The catch used to be bare, and every refusal came back as one sentence about
 * signing in with the invited email. The API has always been more precise than
 * that — expired, already a member, address mismatch, unverified email, a
 * suspended account — and `errors` already carries a written sentence for each
 * code. Discarding them told somebody who was already a member of the academy
 * to check which address they had signed in with, which is advice that cannot
 * work, for a problem they did not have.
 */
export async function acceptInvitationAction(): Promise<InvitationActionState> {
  const { t } = await getServerTranslation(['auth', 'errors']);
  const cookieStore = await cookies();
  const token = cookieStore.get('cove_invitation')?.value;
  if (!token) return { message: t('error.invitation_missing') };

  try {
    await createServerORPCClient().academyInvitations.accept({ token });
  } catch (error) {
    const { code } = toApiError(error);
    // An invitation that can never succeed is not left in the cookie jar to be
    // retried for the rest of its hour. Already a member is the case that
    // matters: the person is *in* the academy, and the way out is the welcome
    // page, not this button.
    if (code === 'MEMBERSHIP_ALREADY_EXISTS') {
      cookieStore.delete('cove_invitation');
    }
    return {
      message: code ? t(`errors:${code}`) : t('error.invitation_failed'),
    };
  }
  cookieStore.delete('cove_invitation');
  redirect('/welcome');
}

/**
 * Leave an invitation alone and carry on to wherever this account belongs.
 *
 * The invitation cookie is set by *visiting* a link, and sign-in then routes to
 * this page for whoever signs in next on that browser — which need not be the
 * person invited. Without a way out, one look at an invitation link stranded
 * every subsequent sign-in here for the cookie's full hour, on a page whose
 * only button would fail for anyone but the invitee.
 *
 * Dropping the cookie is the whole action. The invitation itself is untouched
 * and still valid: this declines to act on it now, and does not revoke it.
 */
export async function dismissInvitationAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('cove_invitation');

  let destination = '/welcome';
  try {
    destination = authDestination(await getAccount());
  } catch {
    // An unreadable account still gets out of here; the welcome page resolves
    // where they belong on its own.
  }
  redirect(destination);
}
