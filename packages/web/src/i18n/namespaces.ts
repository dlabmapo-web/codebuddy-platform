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

/**
 * The academy overview, which the Teacher's own landing page mounts.
 *
 * `teaching` is separate from `teach` rather than folded into it: the two
 * surfaces have different entry points — one is the academy root, the other is
 * a class — and a single namespace holding both would push past the per-file
 * budget in `@cove/i18n`'s `locales.spec.ts` and be paid for by whichever page
 * loaded first.
 */
export const teachingNamespaces = ["teaching", "errors"] as const;

/**
 * The student inactivity countdown, mounted by the academy layout.
 *
 * Its own list, and a very small one: it is the only copy every authenticated
 * student page needs regardless of what they are doing, and folding it into a
 * larger namespace would make a warning banner cost a teacher's analytics copy.
 */
export const sessionNamespaces = ["session"] as const;

/**
 * My Page and the manager's member-profile route.
 *
 * Its own list rather than a layout namespace: the copy covers six form
 * sections plus four controlled vocabularies, and every page in the product
 * would otherwise carry the labels for a form most readers open twice a year.
 */
export const profileNamespaces = ["profile", "errors"] as const;

export type PageNamespace =
  | (typeof monitoringNamespaces)[number]
  | (typeof teachNamespaces)[number]
  | (typeof teachingNamespaces)[number]
  | (typeof sessionNamespaces)[number]
  | (typeof profileNamespaces)[number];
