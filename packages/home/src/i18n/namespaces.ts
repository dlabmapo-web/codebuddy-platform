/**
 * The marketing site's namespaces.
 *
 * Deliberately absent from `layoutNamespaces` in `@cove/i18n/settings`: that
 * list is `@cove/web`'s root RSC payload budget, and marketing copy has no
 * business being paid for by every authenticated page in the product.
 *
 * Split in two rather than one because `locales.spec.ts` caps any single
 * namespace at 15 KB, and a landing page plus a product page in one file would
 * approach it.
 */
export const siteNamespaces = ["marketing", "product"] as const;

export type SiteNamespace = (typeof siteNamespaces)[number];
