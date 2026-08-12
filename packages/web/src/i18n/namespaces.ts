export { layoutNamespaces, type LayoutNamespace } from "@cove/i18n/settings";

/**
 * Namespaces a single route mounts for itself with `PageTranslationsProvider`.
 *
 * Live monitoring is a Teacher-only surface, so its copy is paid for by the
 * teaching routes rather than by every page's RSC payload. The budget in
 * `@cove/i18n`'s `locales.spec.ts` measures the layout list only, and caps
 * each namespace separately.
 */
export const monitoringNamespaces = ["monitoring", "errors"] as const;

/**
 * The teaching routes: live monitoring plus Solution status.
 *
 * `teach` is a large namespace used by one role and two routes, so it stays
 * out of `layoutNamespaces` and is paid for here. Both teaching surfaces mount
 * the same list because a teacher moves between them through the class header.
 */
export const teachNamespaces = ["monitoring", "teach", "errors"] as const;

export type PageNamespace =
  | (typeof monitoringNamespaces)[number]
  | (typeof teachNamespaces)[number];
