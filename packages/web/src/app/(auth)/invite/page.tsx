import { cookies } from 'next/headers';

import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { toApiError } from '@/lib/api-errors';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

import { AuthCard } from '../_components/auth-card';
import { clientAddress } from '../_lib/client-address';
import { InvitationAcceptance } from './_components/invitation-acceptance';
import { InvitationChoice } from './_components/invitation-choice';
import { InvitationSummary } from './_components/invitation-summary';

/**
 * Where every invitation link now lands, signed in or not.
 *
 * The page reads the invitation before deciding anything, because the two
 * questions it used to conflate are separate: whether this browser has a
 * session, and whether the invited *person* has an account. Only the first is
 * knowable here, so the signed-out branch stops guessing at the second and
 * offers both — with the invited address printed, which is the one fact that
 * makes either door work.
 */
export default async function InvitationPage() {
  const { t } = await getServerTranslation(['auth', 'errors']);
  const token = (await cookies()).get('cove_invitation')?.value;
  const signedIn = await hasSession();

  // A dead end for the invitation is not a dead end for the person. Somebody
  // already signed in is offered their own way onward — which also drops the
  // cookie, so a link that can never work stops redirecting them here for the
  // rest of its hour.
  function unavailable(message: string) {
    return (
      <AuthCard
        description={t('invitation.unavailable_description')}
        title={t('invitation.unavailable_title')}
      >
        <InvitationChoice message={message} signedIn={signedIn} />
      </AuthCard>
    );
  }

  if (!token) return unavailable(t('error.invitation_missing'));

  const preview = await previewInvitation(token);
  if ('error' in preview) return unavailable(preview.error);

  return (
    <AuthCard
      description={
        signedIn
          ? t('invitation.description')
          : t('invitation.choice_description')
      }
      title={t('invitation.title')}
    >
      <InvitationSummary
        academyName={preview.academyName}
        email={preview.email}
        role={preview.role}
      />
      {signedIn ? (
        <InvitationAcceptance />
      ) : (
        <InvitationChoice
          signupHref={routes.withQuery(routes.signup, {
            invited: '1',
            academy: preview.academyId,
          })}
        />
      )}
    </AuthCard>
  );
}

/**
 * Unauthenticated on purpose — the whole point is to be readable by somebody
 * who has no account. A failure is named rather than swallowed: "expired" and
 * "already used" send the recipient to different places, and one shared
 * sentence sent them nowhere.
 */
async function previewInvitation(token: string) {
  const { t } = await getServerTranslation(['auth', 'errors']);
  try {
    return await createServerORPCClient(undefined, await clientAddress())
      .academyInvitations.preview({ token });
  } catch (error) {
    const { code } = toApiError(error);
    return {
      error: code ? t(`errors:${code}`) : t('error.invitation_unreadable'),
    };
  }
}

async function hasSession(): Promise<boolean> {
  const { data } = await (await createClient()).auth.getClaims();
  return Boolean(data?.claims);
}
