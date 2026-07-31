/**
 * Every namespace the root layout loads into `LayoutTranslationsProvider`.
 *
 * These ship in the RSC payload of every v2 page, so the set has a budget:
 * ≤50 KB per locale in total, and no single namespace over 15 KB. When one
 * outgrows it, drop it from this list and load it on its own route with
 * `PageTranslationsProvider`. `i18n/payload-budget.spec.ts` enforces both.
 */
export const layoutNamespaces = [
  "common",
  "nav",
  "auth",
  "academy",
  "members",
  "applications",
  "invitations",
  "courses",
  "content",
  "learn",
  "errors",
  "validation",
] as const;

export type LayoutNamespace = (typeof layoutNamespaces)[number];
