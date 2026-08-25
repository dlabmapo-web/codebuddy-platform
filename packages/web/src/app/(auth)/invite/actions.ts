'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { authDestination } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';

export type InvitationActionState = { message?: string };

export async function acceptInvitationAction(): Promise<InvitationActionState> {
  const { t } = await getServerTranslation(['auth']);
  const cookieStore = await cookies();
  const token = cookieStore.get('cove_invitation')?.value;
  if (!token) return { message: t('error.invitation_missing') };

  try {
    await createServerORPCClient().academyInvitations.accept({ token });
  } catch {
    return { message: t('error.invitation_failed') };
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
    destination = authDestination(await createServerORPCClient().auth.me({}));
  } catch {
    // An unreadable account still gets out of here; the welcome page resolves
    // where they belong on its own.
  }
  redirect(destination);
}
