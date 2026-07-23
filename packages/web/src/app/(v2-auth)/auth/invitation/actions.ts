'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerORPCClient } from '@/lib/orpc-server';

export type InvitationActionState = { message?: string };

export async function acceptInvitationAction(): Promise<InvitationActionState> {
  const cookieStore = await cookies();
  const token = cookieStore.get('cove_invitation')?.value;
  if (!token) return { message: 'This invitation link is missing or expired.' };

  try {
    await createServerORPCClient().academyInvitations.accept({ token });
  } catch {
    return { message: 'The invitation could not be accepted. Confirm that you signed in with the invited email.' };
  }
  cookieStore.delete('cove_invitation');
  redirect('/auth/welcome');
}
