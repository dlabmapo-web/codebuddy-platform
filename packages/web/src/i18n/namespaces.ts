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

export type PageNamespace = (typeof monitoringNamespaces)[number];
