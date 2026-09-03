import { redirect, RedirectType } from 'next/navigation';

import { getServerTranslation } from '@/i18n/server/get-server-translation';

import { AuthCard } from '../_components/auth-card';
import { socialProviders } from '../_components/social-providers';
import { currentAccountDestination } from '../_lib/signed-out-only';
import { SignupForm } from './_components/signup-form';

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
  const { t } = await getServerTranslation(['auth']);
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
        invitedAcademyId={query.invited === '1' ? query.academy : undefined}
        noAccount={noAccount}
        socialError={socialError}
        socialProvider={socialProviderLabel(query.provider)}
      />
    </AuthCard>
  );
}
