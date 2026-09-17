/**
 * Whether this browser can render the app's styles.
 *
 * Tailwind v4 relies on `color-mix()` and registered custom properties
 * (`@property`), which set its floor at Chrome 111, Safari 16.4, and Firefox
 * 128. `CSSPropertyRule` is the rule `@property` parses into, so its presence
 * is the check for the later half; `color-mix()` covers the rest. Feature
 * tests rather than user-agent parsing: in-app browsers report whatever they
 * like.
 */
export function meetsBrowserBaseline(env: {
  supports?: (property: string, value: string) => boolean;
  hasPropertyRule: boolean;
}): boolean {
  if (!env.supports) return false;
  return (
    env.hasPropertyRule &&
    env.supports('color', 'color-mix(in srgb, red, red)')
  );
}

export function currentBrowserMeetsBaseline(): boolean {
  if (typeof window === 'undefined') return true;
  return meetsBrowserBaseline({
    supports:
      typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
        ? (property, value) => CSS.supports(property, value)
        : undefined,
    hasPropertyRule: typeof window.CSSPropertyRule !== 'undefined',
  });
}
