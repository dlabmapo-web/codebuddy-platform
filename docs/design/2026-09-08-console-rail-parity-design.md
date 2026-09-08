# Console Rail Parity — Three Rows, and the Cookie That Decides Two of Them

**Date:** 2026-09-08

**Branch:** `feat/cove-studio-v2`

**Status:** Proposed — not implemented

**Implements:** §5.A of [The platform console, next phase](2026-09-08-platform-console-next-phase-design.md),
whose §3 gap classes, §4 decisions, and §7 document contract this follows.

## 1. Purpose

Three rows an operator reported missing: **Settings** and **Point policy**,
reachable from an academy in the console; and **My Page**, in the console's own
rail as it is in the studio's.

The parent document estimated this at hours rather than days, and that estimate
holds — but only because two of the three are links to pages that already work.
The reason it is worth a document anyway is that the obvious implementation of
those two links is wrong in a way that fails silently, up to twenty-four hours
after the mistake, and the third row is not the gap it was reported as.

### 1.1 In scope

| # | Change |
|---|---|
| 1 | Two named destinations on the console's academy detail page: Settings, Point policy |
| 2 | Two canonical route helpers, so neither destination is a hand-built path |
| 3 | A My Page row in the console rail, sharing the studio's component |
| 4 | The way back out of My Page, for an operator who arrived from the console |

### 1.2 Deferred

- Any console-owned settings *page*. The switchboard is §5.D of the parent and
  a different product question (§4.1 there); this document only opens the
  academy's own page.
- Rail re-grouping. §8.1 of the parent recommends renaming the **Operations**
  group to **Accountability**; that rename belongs to whichever workstream first
  needs the word, and doing it here would mix a rename into a parity change.
- Every other studio row. §12 records what was checked and deliberately left.

## 2. Which gap class this closes

§3.1 of the parent — **navigation gaps** — for all three rows. Nothing here adds
authority, a contract, a permission, or a table.

But the three are not equally shaped, and one was misreported.

**Settings and Point policy are true §3.1 gaps.** An operator standing as
Manager already holds `academy.settings.manage`
(`packages/api/src/authorization/academy-access.service.ts:325`), and
`ManagerScopeService` accepts them like any manager
(`packages/api/src/manage/manager-scope.service.ts:92`). Both pages open today
for an operator who walks in. Nothing points at them.

**My Page is not missing from the console.** `PlatformShell` already reads the
operator's avatar and passes it to `HeaderControls`
(`packages/web/src/app/(platform)/admin/_components/platform-shell.tsx`), whose
`ProfileControl` links to `routes.account` — and the comment there names the
console explicitly as one of the two places the bare `/account` is the right
answer (`packages/web/src/components/studio/header-controls.tsx:275`). An
operator has a My Page link. It is in the header menu.

The real gap is **asymmetry**: the studio puts My Page in the rail *and* in the
header menu, and the console has only the header. Since `PlatformShell`'s own
purpose is that "an operator moving between the console and an academy should
feel one product", the row should exist — but this document is adding a second
route to a reachable page, not rescuing an unreachable one. That distinction
decides the acceptance test in §10: nothing here may be justified by "the
operator could not get there", because they could.

## 3. The questions, in the words of whoever asks them

Per §7.2 of the parent.

| Row | The question |
|---|---|
| Settings | *"This academy says points are switched off — where do I turn them on?"* |
| Point policy | *"They say a solved problem paid the wrong amount. What is it set to?"* |
| My Page | *"Where's my profile? It's in the sidebar when I'm in an academy."* |

All three are support questions, asked while the operator is already looking at
the academy. That is the argument for putting the first two on the academy
detail page rather than in the rail: the rail is scoped to the platform, and
these two are about one academy the operator has already opened.

## 4. What exists today

| Fact | Evidence |
|---|---|
| The academy detail page already owns the way in, as a panel | `admin/academies/[academySlug]/_components/enter-academy.tsx` |
| That panel offers three roles and exactly one destination — the overview | same file, `routes.academy(academy.slug)` |
| `enterAcademyAs` writes `cove_view_role`, `max-age=86400`, then hard-navigates | `admin/_lib/enter-academy.ts` |
| A route with no cookie resolves the operator as **MANAGER**, the widest | `packages/web/src/lib/academy-route.ts:33` |
| …but a cookie left by an earlier trip is honoured for 24 hours | same, `platformViewRole()` |
| The settings page 404s for a non-manager role | `(framed)/settings/page.tsx`, `canManageAcademySettings` |
| The point policy page 404s for a non-manager **and** when points are explicitly off | `(framed)/settings/points/page.tsx` |
| There is no `academySettings` or `academyPointPolicy` route helper | `packages/web/src/lib/routes.ts` |
| The studio hand-builds both from `base` | `studio-sidebar.tsx:614,620` |
| A lint forbids hand-written academy paths | `packages/web/scripts/check-canonical-routes.mjs`, `pnpm --filter @cove/web routes:lint` |
| `MyPageRow` exists, is not exported, and lives inside the studio sidebar | `studio-sidebar.tsx` |
| `PlatformSidebar` takes no props at all | `admin/_components/platform-sidebar.tsx` |
| `PlatformShell` already resolves the viewer, and never fails to an absent one | `platform-shell.tsx`, `readViewer()` |
| `nav.my_page` already exists, and `nav` is already a layout namespace | `packages/i18n/src/locales/en/nav.json:37`, `packages/i18n/src/settings.ts:73` |
| The console's own API client deliberately ignores the role cookie | `orpc-server.ts`, `createPlatformServerORPCClient` |
| `/account` already sends a platform admin back to `/admin`… | `(studio)/account/page.tsx` |
| …unless they also hold a membership, which wins | same, `firstAcademySlug ?` before `isPlatformAdmin ?` |
| …and the back link reads "Back to Studio" either way | `profile.json:5`, `back_to_studio` |

## 5. Decisions

### 5.1 Both destinations force `MANAGER`. Neither is a plain `<Link>`

**This is the decision the document exists for.**

A plain `<Link href={routes.academySettings(slug)}>` appears to work. It usually
does work. `resolveAcademyRoute` falls through to its platform branch for an
operator with no membership, and `platformViewRole()` defaults to `MANAGER` when
the cookie is absent — so the page opens, and a developer testing it in a clean
session sees exactly what they expected.

It breaks for an operator who used **Enter academy as Teacher** earlier. The
cookie lives for 86,400 seconds, so for the rest of that day the same link
resolves `roles: ['TEACHER']`, `canManageAcademySettings` is false, and the page
answers `notFound()`. A 404 on a link that worked this morning, on an academy
that is fine, with nothing in any log, and no way for the operator to connect it
to a radio button they pressed before lunch.

So both destinations go through `enterAcademyAs('MANAGER', destination)`, which
sets the cookie on the way, exactly as the panel's existing button does. They
are buttons, not anchors — `enterAcademyAs` writes a cookie and calls
`window.location.assign`, and it must be the same navigation that carries it.

Two consequences to accept deliberately:

1. **They override the panel's role radio.** An operator who selected *Teacher*
   and then pressed *Settings* is put in as Manager. That is correct — the page
   does not exist for a Teacher — but it must be *said*, in the control's own
   copy (§7), not left as a surprise.
2. **They change the operator's standing role for later navigations.** That is
   already true of every trip this panel offers, and is not new here.

### 5.2 Two route helpers, used by both rails

`routes.academySettings(slug)` and `routes.academyPointPolicy(slug)` join
`routes.ts` beside `academyPoints`, and `studioNavGroups` switches to them at
`studio-sidebar.tsx:614,620`.

The console could hand-build these from `routes.academy(slug)` as the studio
does today and the canonical-routes lint would pass, because the lint catches
hand-written `/academy/${...}` literals rather than concatenation onto a helper's
result. That is exactly why the helpers should exist: the lint's intent is one
definition per address, and a second call site appending `/settings/points` to a
base is the drift the lint was written to prevent, in the form it cannot see.

### 5.3 The destinations live in `EnterAcademyPanel`

Not the rail, and not a new panel.

The rail is scoped to the platform; these are about one academy. The panel is
already titled as the way in, already holds the role choice these override, and
already carries a footer row of secondary links — *Open a support session*,
*Activity* — which is precisely the shape a named destination wants.

The panel's primary button keeps its meaning: the role radio, then **Enter
academy**, landing on the overview. The two destinations are a distinct
group beneath it, labelled as shortcuts that go in as Manager.

Rejected: adding a destination selector beside the role selector. It doubles the
panel's decision surface to serve two shortcuts, and reads as though every
combination of role and destination were meaningful, when only one is.

### 5.4 Points being off is stated, not hidden

The studio hides the Point policy row when the academy does not run points, and
its comment gives the reason: a nav link to an empty board is worse than no link
(`studio-chrome.tsx`, `academyPointsEnabled`).

**The console inverts this**, and §4.1 of the parent is why. The manager's
question is *what does my academy have on*; hiding the row answers it. The
operator's question is the one in §3 — *they say points are off, where do I turn
them on* — and a row that is simply absent answers nothing at all, leaving the
operator to conclude the console is broken.

So where points are off, the panel states it and points at Settings, which is
where it is switched on. Where the read fails, follow the studio: treat unknown
as off for the destination, but say the read failed rather than asserting the
academy's configuration.

The console page reads this with `createPlatformServerORPCClient()` —
`academyFeatures.list({ academyId })` needs `academy.read`, which the platform
Manager set holds, and that client deliberately ignores any role cookie, so the
answer cannot change because of an earlier diagnostic trip. No contract changes:
`PlatformAcademyDetail` is `.strict()` and stays as it is.

### 5.5 `MyPageRow` is extracted, not copied

Moved to `packages/web/src/components/studio/my-page-row.tsx`, beside
`profile-avatar.tsx`, and imported by both rails.

Its comment — why the row wears a face rather than a glyph, why it sits outside
every group, why the collapsed rail needs an `!important` override to keep the
avatar visible — is the reason to share rather than reimplement. A second copy
in the console would lose it and then drift.

`academyImageUrl` becomes optional. The console has no academy, so the operator's
global photo is the only one there is, and `readViewer()` already returns exactly
the three fields the row needs, never null — which matches what the row already
tolerates.

`PlatformSidebar` gains a `viewer` prop, passed by `PlatformShell` from the
`readViewer()` result it already has. No new fetch.

**The row can never light.** `/account` lives under `(studio)`, renders
`MyPageShell`, and does not mount the console chrome — so `activeNavHref` will
never match it while `PlatformSidebar` is on screen. This is correct and should
be commented rather than worked around: the studio's row can be active because
its My Page is inside the frame; the console's cannot, because leaving the
console is what the link does.

### 5.6 The way back belongs to this change

Adding the row without this leaves an operator on a page whose back link sends
them somewhere they did not come from.

`/account` already prefers `routes.admin` for a platform admin — but only after
`firstAcademySlug`, so an operator who *also* manages an academy is returned to
that academy from a page they opened in the console. And `backLabel` is
`t('back_to_studio')`, which is the wrong word for the console in either case.

`routes.account` gains an optional origin, the console's row passes it, and
`/account` prefers the console when it is present, keeping today's behaviour when
it is not. A new `profile:back_to_console` key supplies the label for that case.

Rejected: making `isPlatformAdmin` outrank membership. It fixes this trip and
breaks the opposite one — an operator-manager clicking My Page from inside their
own academy would be thrown into the console.

## 6. Web surface

| File | Change |
|---|---|
| `packages/web/src/lib/routes.ts` | Add `academySettings`, `academyPointPolicy`; add the origin option to `account` |
| `…/(framed)/_components/studio-sidebar.tsx` | Use the two new helpers; export nothing else; remove the local `MyPageRow` |
| `packages/web/src/components/studio/my-page-row.tsx` | **New.** The extracted row, `academyImageUrl` optional |
| `…/admin/_components/platform-sidebar.tsx` | Accept `viewer`; render `MyPageRow` last, outside every group |
| `…/admin/_components/platform-shell.tsx` | Pass `viewer` to `PlatformSidebar` |
| `…/admin/academies/[academySlug]/page.tsx` | Read the academy's features; pass `pointsEnabled: boolean \| null` |
| `…/admin/academies/[academySlug]/_components/academy-detail.tsx` | Thread it to the panel |
| `…/admin/academies/[academySlug]/_components/enter-academy.tsx` | The destinations group |
| `packages/web/src/app/(studio)/account/page.tsx` | Prefer the console when the origin says so; pick the label to match |
| `packages/i18n/src/locales/{en,ko}/platform-support.json` | Destination copy (§7) |
| `packages/i18n/src/locales/{en,ko}/profile.json` | `back_to_console` |

No API package, no shared package, no schema, no permission, no migration.

## 7. Copy

Korean is required alongside English; the translation check is part of CI.

`platform-support.json`:

| Key | English |
|---|---|
| `destination.title` | Go straight to |
| `destination.hint` | These open as **Manager**, whichever role is selected above — they are a manager's pages. |
| `destination.settings` | Academy settings |
| `destination.point_policy` | Point policy |
| `destination.points_off` | This academy does not run points. Turn them on in Academy settings. |
| `destination.points_unknown` | Could not read this academy's features. |

`destination.hint` is the load-bearing sentence, and §5.1 is why: it is the only
place an operator is told that the shortcut overrides the radio they just set.

`profile.json`: `back_to_console` — *Back to console*.

## 8. Audit vocabulary

**None, and that is the correct answer here** — recorded because §7.3 of the
parent requires the question to be answered rather than skipped.

Nothing in this document performs an action. The two destinations navigate; any
change the operator then makes is written by the academy's own endpoints, which
already audit it — `AcademyFeaturesService.setEnabled` writes through
`AuditService`, and the point policy service does the same. Auditing the
navigation as well would file an entry saying an operator opened a page, which
`platform.audit.read` readers would then have to filter past to find the entries
that record what was done.

§4.3's correlation identifier is likewise not introduced: it belongs to work that
enters a queue, and nothing here queues anything. §5.B of the parent introduces
it.

## 9. Blast radius

**No destructive operation, so no blast-radius copy** — again recorded rather
than skipped, per §7.4.

The nearest thing to a side effect is `enterAcademyAs` writing the role cookie,
which changes what the operator's *next* pages show for up to a day. It is not
destructive, it is already how the panel's existing button behaves, and §7's
`destination.hint` is where it is disclosed.

## 10. Testing

**Unit**

- `routes.spec.ts` — the two new helpers produce the addresses the studio's rail
  produces today, so the extraction cannot move a page.
- `studio-sidebar.spec.ts` — unchanged expectations still pass after §5.2. The
  suite tests `studioNavGroups`, which keeps its shape; a diff here means the
  helper is wrong.
- `my-page-row` — renders the operator shape (no `academyImageUrl`) and the
  empty shape `readViewer()` returns on failure, without throwing.
- `account-route-independence.spec.ts` — extend for §5.6: an operator with a
  membership *and* the console origin goes back to the console; without the
  origin, today's answer is unchanged.

**Integration / e2e**

One spec, and it must be the cookie case from §5.1, because that is the failure
a unit test cannot see: enter an academy as **Teacher**, return to the console,
press **Academy settings**, and land on the settings page rather than a 404. A
test that only visits the destination from a clean session passes against the
bug.

Follow the existing e2e conventions — `e2e/support/auth.ts` for sign-in, and the
class-context helpers if the academy fixture needs them.

**Checks**

`pnpm --filter @cove/web routes:lint` and the translation check both gate this
change: the first because §5.2 adds addresses, the second because §7 adds keys
in two languages.

## 11. Build order

1. Route helpers, and switch the studio rail onto them. Nothing visible changes;
   the sidebar suite proves it.
2. Extract `MyPageRow`. Still nothing visible; the studio renders the shared
   component.
3. Console rail: `viewer` through the shell, the row rendered.
4. `/account` origin and label (§5.6). Steps 3 and 4 ship together — a row whose
   return trip is wrong is not finished.
5. Feature read on the academy page, and the destinations group.

Each step is independently revertable, and the first two are refactors that
cannot change behaviour — which is what makes the estimate hold.

## 12. What this deliberately does not do

Per §7.5. The studio rail was walked row by row against the console's; these were
the rows where an operator plausibly has an equivalent question, and each was
left out on purpose.

- **Members, Applications, Invitations.** The console has its own cross-academy
  directories for all three. Per §4.1 those answer the operator's question, and
  a per-academy link would be the studio's question asked twice.
- **Classes, Courses.** Already reachable through `AcademyContent` on the same
  page.
- **Class ranking, Student analytics.** The console has `/admin/ranking`. Whether
  an operator needs one academy's board is a real question and not this one's.
- **My courses, My classes, Answer records, My points.** A student's rows. §4.6
  of the parent, and `platformViewRoles` excludes `STUDENT`.
- **Renaming the Operations group.** §1.2.
- **Anything the operator could not already do.** If a change here required a new
  permission or contract, it would not be a §3.1 gap, and it would belong to a
  different document.

## 13. Open question

**Should the destinations group also offer the academy's own People page?**

It is the one row in §12 where the reasoning is genuinely close. The console's
Users directory answers *who is this person across the platform*; a support call
is more often *who is in this academy, and in what role* — the studio's People
page, one click from an academy the operator has already opened.

Left out because it is a third destination justified by a different argument
from the first two — those are pages the console has no equivalent of at all,
and this one has an equivalent that is merely shaped differently. It should be
decided on its own, with the §4.1 test applied properly, rather than added here
because the group happens to exist.
