'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
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
  redirect('/auth/welcome');
}
