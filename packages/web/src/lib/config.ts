function requiredPublicEnvironment(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing public environment variable: ${name}`);
  return value;
}

export const publicConfig = {
  supabaseUrl: requiredPublicEnvironment(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabasePublishableKey: requiredPublicEnvironment(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  apiUrl: requiredPublicEnvironment(
    "NEXT_PUBLIC_API_URL",
    process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/rpc',
  ),
  siteUrl: requiredPublicEnvironment(
    "NEXT_PUBLIC_SITE_URL",
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  /*
   * Whether Kakao sign-in is offered.
   *
   * Strict on purpose. The implementation is complete and the provider type is
   * permanent; what is missing is a Kakao Developers application under the
   * deployment owner's control. Anything other than the exact string "true" —
   * unset, empty, "1", "TRUE" — leaves Kakao off, so a typo in a deployment
   * environment cannot publish a button that sends students to a broken
   * consent screen.
   */
  kakaoAuthEnabled: process.env.NEXT_PUBLIC_KAKAO_AUTH_ENABLED === 'true',
  /** Public Cloudflare Turnstile widget key. Supabase owns token validation. */
  turnstileSiteKey:
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null,
};
