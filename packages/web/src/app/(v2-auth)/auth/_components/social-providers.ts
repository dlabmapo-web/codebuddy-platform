import type { SocialAuthProvider } from '@cove/shared';

import { publicConfig } from '@/lib/config';

import { GoogleIcon, KakaoIcon, NaverIcon } from './provider-icons';

export type SocialProviderPresentation = {
  id: SocialAuthProvider;
  /** A provider's own name for itself, so it is never translated. */
  label: string;
  Icon: (props: { className?: string }) => React.JSX.Element;
};

/**
 * Every provider Cove has implemented, in the order they are offered.
 *
 * Availability is not part of the entry. A provider is either built or it is
 * not, and Kakao is built: the action, the callback, the icon, and the
 * provider type all exist and stay tested. What varies per deployment is
 * whether its credentials are configured, which `availableSocialProviders`
 * reads and this list does not encode.
 */
export const socialProviders: readonly SocialProviderPresentation[] = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'kakao', label: 'Kakao', Icon: KakaoIcon },
  { id: 'custom:naver', label: 'Naver', Icon: NaverIcon },
];

/**
 * Whether a provider may be started in this deployment.
 *
 * Read on the server before an onboarding intent is created as well as in the
 * browser before the row is rendered. A hidden button is a UI decision; this
 * is the one that makes a hand-written POST for `kakao` fail too.
 */
export function isSocialProviderAvailable(
  provider: SocialAuthProvider,
): boolean {
  return provider === 'kakao' ? publicConfig.kakaoAuthEnabled : true;
}

/**
 * The providers to render.
 *
 * Filtered rather than disabled: a greyed-out Kakao button, a lone logo, or a
 * reserved empty column all say "Kakao is coming", which is a promise no one
 * has made. An unavailable provider leaves no trace in the row.
 */
export function availableSocialProviders(): SocialProviderPresentation[] {
  return socialProviders.filter(({ id }) => isSocialProviderAvailable(id));
}
