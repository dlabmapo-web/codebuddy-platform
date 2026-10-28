import { turtleBrowserRuntimeIdSchema, turtleBrowserProfileId, turtleHelperVersion, type TurtleBootstrap, type TurtleBrowserProfile } from '@cove/shared';

export function turtleBrowserAccess(bootstrap: TurtleBootstrap, configured: boolean) {
  const profile = configured ? bootstrap.browser : undefined;
  return { profile, unavailable: (bootstrap.preferredEngine === 'browser' || !!bootstrap.browser) && !profile };
}

// Only non-secret metadata is serialized to the public page. A grant still has
// to select the pilot; preparing an interpreter alone gives no run authority.
export function turtleBrowserConfig(env: Record<string, string | undefined>): TurtleBrowserProfile | undefined {
  if (env.TURTLE_TRIAL_BROWSER_ENABLED !== 'true' || env.TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED !== 'true') return;
  try {
    const origin = new URL(env.TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN ?? '');
    const site = new URL(env.NEXT_PUBLIC_SITE_URL ?? 'https://cs.coveedu.com');
    if (origin.origin !== env.TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN || origin.hostname === site.hostname || origin.username || origin.password ||
      (origin.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(origin.hostname))) || !turtleBrowserRuntimeIdSchema.safeParse(env.TURTLE_TRIAL_BROWSER_RUNTIME_ID).success) return;
    return { engine: 'browser', profile: turtleBrowserProfileId, protocol: 1, origin: origin.origin, runtimeId: env.TURTLE_TRIAL_BROWSER_RUNTIME_ID!, helperVersion: turtleHelperVersion };
  } catch { return; }
}
