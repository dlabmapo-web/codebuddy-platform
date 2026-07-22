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
};
