import { cookies } from 'next/headers';
import { redirect, RedirectType } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { createServerORPCClient } from '@/lib/orpc-server';

import { AuthCard } from '../_components/auth-card';
import { socialProviders } from '../_components/social-providers';
import { clientAddress } from '../_lib/client-address';
import { currentAccountDestination } from '../_lib/signed-out-only';
import { SignupForm } from './_components/signup-form';

/**
 * The academy an invited visitor is signing up into, read from the invitation
 * rather than from the address bar.
 *
 * The form locks the academy by id and looks its *name* up in
 * `academies.listForSignup`, which returns `ACTIVE` academies only — so an
 * invitation into a suspended one renders a locked field showing the
 * placeholder. The id in the hidden input is still right and the sign-up still
 * works; it simply looks blank at the moment the recipient is deciding whether
 * to trust the page. Nobody could reach that state while only a manager could
 * invite, because a suspended academy has no working manager surface. A
 * platform operator can.
 *
 * Widening `listForSignup` would be the wrong fix: it is unauthenticated and
 * its list is a public directory. The invitation is already here — the
 * `cove_invitation` cookie is set on `/` by the link the recipient followed —
 * so the page asks it, and gets a name that is true whatever state the academy
 * is in.
 *
 * It also removes the form's dependence on `?academy=`, which is a spoofable
 * label. Harmless today, because the membership comes from the invitation row
 * at accept time and not from this form — but a label that can lie is worth
 * not having.
 */
async function invitedAcademy(): Promise<
  { id: string; name: string } | null
> {
  const token = (await cookies()).get('cove_invitation')?.value;
  if (!token) return null;
  try {
    const preview = await createServerORPCClient(
      undefined,
      await clientAddress(),
    ).academyInvitations.preview({ token });
    return { id: preview.academyId, name: preview.academyName };
  } catch {
    // An unreadable invitation is not a reason to refuse a sign-up. The page
    // falls back to the ordinary picker, and `/invite` is where the expired or
    // already-used cases are explained.
    return null;
  }
}

/**
 * A provider's own name for itself, from the one list that holds them.
 *
 * Matched on the bare id as well as the contract id, because Supabase reports
 * a custom OIDC provider under its short name in `app_metadata` while Cove
 * addresses it as `custom:naver`. An id that matches neither yields nothing,
 * and the panel falls back to its provider-less sentence rather than printing
 * whatever was in the query string.
 */
function socialProviderLabel(provider?: string): string | undefined {
  if (!provider) return undefined;
  return socialProviders.find(
    ({ id }) => id === provider || id === `custom:${provider}`,
  )?.label;
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{
    invited?: string;
    academy?: string;
    error?: string;
    provider?: string;
  }>;
}) {
  const destination = await currentAccountDestination();
  if (destination) {
    redirect(destination, RedirectType.replace);
  }

  const query = await searchParams;
  const [{ t }, invited] = await Promise.all([
    getServerTranslation(['auth']),
    invitedAcademy(),
  ]);
  // `no-account` is deliberately not one of these. It is not an error the
  // academy picker should carry — the visitor did nothing wrong — so it gets
  // its own panel above the form instead of red text beside a field.
  const socialError = query.error === 'academy-required'
    ? t('error.academy_required')
    : query.error === 'oauth'
      ? t('error.oauth_failed')
      : undefined;
  const noAccount = query.error === 'no-account';
  return (
    <AuthCard
      description={t('signup.description')}
      title={t('signup.title')}
    >
      <SignupForm
        invitedAcademy={invited}
        invitedAcademyId={
          invited?.id ?? (query.invited === '1' ? query.academy : undefined)
        }
        noAccount={noAccount}
        socialError={socialError}
        socialProvider={socialProviderLabel(query.provider)}
      />
    </AuthCard>
  );
}
