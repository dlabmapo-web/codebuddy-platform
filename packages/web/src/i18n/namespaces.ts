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
 * The signed-out screens: sign in, sign up, invitations, approval, and the
 * three-screen password recovery route.
 *
 * Moved out of `layoutNamespaces` rather than raising the root-payload budget,
 * which is what that budget's note asks the next feature to do. Nobody reads
 * this copy after they are signed in, and the shell above these pages —
 * the theme switch, the language switch, the sign-out control — keeps using
 * `common` from the layout instance, so it is unaffected.
 */
export const authNamespaces = ["auth"] as const;

/**
 * The student exercise workspace.
 *
 * `monitoring` because a teacher may join at any moment and the indicator's
 * copy has to be in hand before that happens; `python-errors` because the
 * terminal can raise one on any run. The sixteen explanation sentences are
 * page-scoped rather than folded into `learn`: `learn` is a layout namespace,
 * and the Korean root payload has a few hundred bytes of headroom against the
 * budget in `@cove/i18n`'s `locales.spec.ts`, which asks the next feature to
 * split rather than raise the cap.
 */
export const exerciseNamespaces = [
  "monitoring",
  "python-errors",
  "errors",
] as const;

/**
 * The teaching routes: live monitoring plus Solution status.
 *
 * `teach` is a large namespace used by one role and two routes, so it stays
 * out of `layoutNamespaces` and is paid for here. Both teaching surfaces mount
 * the same list because a teacher moves between them through the class header.
 */
export const teachNamespaces = [
  "monitoring",
  "teach",
  // §5.1 of the student points design: staff see the identical board their
  // students see, inside the class page they already open — which means this
  // route needs the board's own vocabulary rather than a second copy of it.
  "points",
  "errors",
] as const;

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
 * The manager control tower and the people directory beneath it.
 *
 * Its own list for the same reason `teaching` has one: it is a large namespace
 * belonging to one role on two routes, and a Student loading their catalog
 * should not pay for the academy's audit vocabulary in their RSC payload.
 */
export const managerNamespaces = ["manager", "audit", "errors"] as const;

/**
 * The student's own academy overview.
 *
 * Its own list for the same reason `teaching` and `manager` have one. `learn`
 * is already a layout namespace carrying the catalog, the workspace, and
 * Answer records, and folding a whole dashboard's copy into it would push both
 * the per-namespace and the root-payload budgets in `@cove/i18n`'s
 * `locales.spec.ts`. This copy belongs to one role on one route and is paid
 * for there.
 */
export const learningNamespaces = ["learning", "errors"] as const;

/**
 * The Team Lead's curriculum overview.
 *
 * Its own list for the same reason `teaching`, `manager`, and `learning` have
 * one: it is a large namespace belonging to one role on one route, and a
 * Student loading their catalog should not pay for the vocabulary of seven
 * curriculum defects in their RSC payload.
 */
export const leadNamespaces = ["lead", "errors"] as const;

/**
 * The people-operations surfaces: the directory, import, bulk changes, and
 * invitation delivery.
 *
 * Split out of `manager` when the control tower's copy and the people
 * operations copy together passed the per-namespace budget in `@cove/i18n`'s
 * `locales.spec.ts`. The split is also the honest one: a manager reading the
 * control tower never opens the import wizard, and the wizard's forty error and
 * outcome codes should not be in their payload.
 *
 * `manager` travels with it because the people tables print the same role and
 * status vocabulary the tower does, and two spellings of "Team lead" in one
 * product is worse than one extra namespace on one route.
 */
export const peopleOpsNamespaces = [
  "manager",
  "people-ops",
  "errors",
] as const;

/**
 * The audit action vocabulary, on its own.
 *
 * Split out of `manager` when the two together passed the per-namespace budget
 * in `@cove/i18n`'s `locales.spec.ts`. It is also the right seam: this list
 * mirrors a server-side vocabulary that grows with every feature that writes an
 * audit record, so it is the part of the manager copy that will keep growing
 * while the rest is stable.
 */

/**
 * The platform operator's console.
 *
 * Its own list, and never a layout namespace: this copy is read by a handful
 * of Cove staff, and a student's RSC payload should not carry the vocabulary
 * for suspending their academy. `errors` travels with it because every action
 * on this surface is a mutation that can be refused.
 */
export const platformNamespaces = [
  'platform',
  'platform-audit',
  'platform-applications',
  'platform-content',
  'platform-invitations',
  'platform-library',
  'platform-ranking',
  'platform-users',
  'platform-support',
  'errors',
] as const;

/**
 * The support banner, on its own.
 *
 * Mounted by the academy layout whenever a grant is live, which is a handful
 * of sessions a week — so it carries the banner's own namespace and not the
 * console's. A student loading their catalog must never pay for the vocabulary
 * of Cove staff being inside their academy, and `platform-support` is already
 * split from `platform` because the two together passed the per-namespace
 * budget in `@cove/i18n`'s `locales.spec.ts`.
 */
export const supportNamespaces = ['platform-support'] as const;

/**
 * The curriculum importer.
 *
 * Its own list for the same reason `lead` and `people-ops` have one: it is a
 * large namespace belonging to one role on one route, and it carries a
 * vocabulary nothing else needs — forty issue codes, five planned outcomes, and
 * the copy of a four-stage wizard. A Student loading their catalog should not
 * pay for the sentence explaining what a stable key is.
 *
 * `content` travels with it because the wizard names modules, lectures, and
 * problems constantly and two spellings of "lecture" in one product is worse
 * than one extra namespace on one route. `errors` because every step here is a
 * call that can be refused.
 */
export const contentImportNamespaces = [
  'content',
  'content-import',
  'errors',
] as const;

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

/**
 * The student's points page.
 *
 * Its own list for the same reason `learning` has one: a Student's catalog
 * should not carry a leaderboard's vocabulary, and an academy without the
 * points flag never loads this at all.
 */
export const pointsNamespaces = ["points", "errors"] as const;

/**
 * The academy's view of the content library.
 *
 * Its own list rather than a slice of `courses`: this copy is read on one
 * route by curriculum staff, and `courses` is a layout namespace — putting it
 * there sent the library's whole vocabulary in the RSC payload of every page a
 * student loads, which is exactly what the Korean payload budget in
 * `@cove/i18n` refused.
 */
export const academyLibraryNamespaces = ["academy-library", "errors"] as const;

export type PageNamespace =
  | (typeof authNamespaces)[number]
  | (typeof monitoringNamespaces)[number]
  | (typeof exerciseNamespaces)[number]
  | (typeof teachNamespaces)[number]
  | (typeof teachingNamespaces)[number]
  | (typeof managerNamespaces)[number]
  | (typeof learningNamespaces)[number]
  | (typeof leadNamespaces)[number]
  | (typeof peopleOpsNamespaces)[number]
  | (typeof destructiveNamespaces)[number]
  | (typeof platformNamespaces)[number]
  | (typeof supportNamespaces)[number]
  | (typeof contentImportNamespaces)[number]
  | (typeof sessionNamespaces)[number]
  | (typeof profileNamespaces)[number]
  | (typeof pointsNamespaces)[number]
  | (typeof academyLibraryNamespaces)[number];

/**
 * The confirmation copy for deleting a course or a class.
 *
 * Its own list rather than more keys in `courses` and `classes`, which are
 * layout namespaces: the words for an irreversible act two staff surfaces
 * offer should not ride in every student's payload. The budget in
 * `@cove/i18n`'s `locales.spec.ts` asked for exactly this split.
 */
export const destructiveNamespaces = ['destructive'] as const;
