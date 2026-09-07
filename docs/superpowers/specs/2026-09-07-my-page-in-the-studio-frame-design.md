# My Page in the Studio Frame, and a Row in the Rail

**Date:** 2026-09-07
**Branch:** written on `feat/applicant-lobby`; implementation branch TBD
**Status:** Draft — awaiting approval

## 1. Purpose

**The rail disappears.** Opening My Page drops the reader out of the studio
entirely. `/account` renders its own chrome — a back link, a title, and nothing
else — so the sidebar they were navigating a second ago is gone, and the only
way back into the academy is the one link at the top left.

**And there is only one door to it.** That door is the avatar in the top-right
corner. It is a good door and it stays exactly as it is; it is just the only
one, and the reader's own page is the most personal destination in the product
with no place at all in the navigation they actually use.

This document moves My Page inside the academy frame so the rail persists, and
adds a second entrance to it: a row in the rail itself, wearing the reader's
face where every other row wears a glyph.

## 2. Diagnosis

### 2.1 My Page was deliberately built outside the academy

`MyPageShell` says so
(`packages/web/src/app/(studio)/account/_components/my-page-shell.tsx:9`):

> Not `StudioShell`: that shell is built around one academy and its sidebar,
> and this page is about the account — which may belong to two academies or to
> none. Borrowing an academy sidebar here would put a navigation tree for one
> academy beside a form about all of them.

There is a test enforcing the separation
(`packages/web/src/app/(studio)/account/account-route-independence.spec.ts`).
It fails the build if anything under `/account` imports `useAcademySlug` or the
academy route provider, because one such import once blanked the page for every
signed-in member: the hook throws rather than returning null when the provider
is not mounted above it.

### 2.2 But My Page already shows exactly one academy at a time

The docstring's objection — "a form about all of them" — is no longer what the
page does. `MyPageWorkspace` resolves a single selected academy and expands
only that one
(`packages/web/src/app/(studio)/account/_components/my-page-workspace.tsx:41`),
through `selectAcademy`, which takes the `?academy=` query, then the academy
this browser looked at last, then the first active membership
(`packages/web/src/app/(studio)/account/_lib/academy-selection.ts:23`).

So the page is already single-academy. It carries its own switcher for choosing
which one, and remembers the choice in `localStorage` under
`cove_my_page_academy`. A sidebar for the selected academy would not be a
navigation tree beside a form about all of them; it would be a navigation tree
beside a form about the same one.

### 2.3 The chrome is a layout for a reason, and `/account` is outside it

`StudioChrome`'s docstring
(`packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-chrome.tsx:36`)
records why the frame is a layout rather than something each page renders:

> Next does not re-render a shared layout on navigations beneath it, so the
> sidebar and the header stay on screen — and stay interactive — while the next
> page loads. […] It also means the sidebar keeps its scroll position, its open
> groups, and the focus ring, none of which survived being rebuilt per page.

`/account` is not beneath that layout, so entering it tears the frame down and
rebuilds nothing. **Any solution that keeps My Page at a global URL and gives
that URL its own sidebar re-introduces exactly the remount this layout exists
to avoid.** That is the argument that decides §3.1.

### 2.4 The rail has no row for the reader

Every row in `StudioSidebar` names a part of the academy — the overview, the
curriculum, the classes, the people — and takes a `lucide` glyph to match. The
one destination that is about the *reader* is not in the list at all; it is
behind the avatar in the header, a different control in a different corner, and
on the collapsed icon rail there is no trace of it whatsoever.

### 2.5 The header avatar is doing its job

`ProfileControl` (`packages/web/src/components/studio/header-controls.tsx:149`)
holds the identity block, the link to My Page, and the "View as" role switcher,
which renders only when `held.length > 1`. It sits between the bell and the edge
of the bar, where a product's account control is expected to be. Nothing in this
document moves it or takes anything out of it.

## 3. Decisions

### 3.1 My Page moves into the academy frame

A new framed route:

```text
/academy/{academySlug}/me
```

It sits at
`packages/web/src/app/(studio)/academy/[academySlug]/(framed)/me/page.tsx`, so
it inherits `FramedAcademyLayout` and therefore `StudioChrome`: the sidebar,
the sticky header, the collapse state, the academy switcher, and `loading.tsx`
replacing only the content column. None of that is written twice.

The academy is fixed by the URL segment. The in-page academy switcher's
*selection logic* and the `localStorage` memory are retired — the address bar is
the memory. The strip of academies at the foot of the identity card stays, and
becomes navigation between each academy's own My Page.

### 3.2 `/account` stays, and stays global

`/account` is not deleted and does not become a redirect for everyone. It
remains the account's own address, rendered in `MyPageShell` as today, and is
the answer for every reader who is not standing inside an academy:

- somebody with **no active membership** — which spec §6.1 of
  `2026-08-14-my-page-account-academy-profile-design.md` requires be served,
  and which an applicant in the lobby is;
- a **platform operator** in the console, who may hold no membership at all;
- an **old bookmark**, and the existing `/studio/my-page` compatibility
  redirect that already lands here (`packages/web/src/lib/routes.ts:144`).

For a reader who *does* have memberships it shows the identity card and the
global account sections, and the strip of academies as the way into each one's
profile — rather than expanding one of them inline. One academy profile is
edited in one place, and that place is inside the academy.

`/account?academy={academyId}` is honoured as a compatibility redirect to
`/academy/{slug}/me` when the id names an active membership, and otherwise has
the query dropped — the same forgiveness `shouldReplaceUrl` applies today to a
stale bookmark.

### 3.3 My Page joins the navigation, wearing the reader's face

A row at the foot of `SidebarContent`, below the labelled groups and outside
all of them:

```text
┌──────────────────────────┐
│ [D]  Dlab-Mapo       ⌄   │   the academy switcher, unchanged
│      ● Manager           │
├──────────────────────────┤
│  ACADEMY                 │
│  ⊞   Overview            │
│  LEARNING                │
│  ⌾   My courses          │
│  …                       │
│  SETTINGS                │
│  ⚙   Academy settings    │
│                          │
│ (◕)  My page             │   ← last, and an avatar rather than a glyph
└──────────────────────────┘
```

**Ungrouped, and last.** My Page belongs to no group here. Filed under Learning
it would sit beside "My courses" and read as a student's page, which it is not;
filed under Academy it would read as a setting of the academy, which it also is
not.

At the end rather than the head because the rail is read top-down as the shape
of the academy, and the reader is not part of that shape. It is also the one
position that is the same for everybody: a student's rail carries three groups
above it and a manager's carries five, and both find this row in the same place
without counting.

**An avatar, not an icon.** Every other row names a part of the academy and
takes the glyph its subject deserves. This one leads to the reader, and their
own photograph says so faster than any glyph could — most of all on the
collapsed rail, where a row *is* nothing but its icon.

**Smaller than the header's.** `ProfileAvatar` gains an `xs` size at 20px. Two
reasons, and neither is arbitrary: the rail draws its icons at `1.05rem`, and a
32px face among them is a row that shouts; and the header avatar is 32px, so
repeating that measure would put the same face at the same size in two corners
of one screen and read as one control drawn twice.

It has to be the `size` prop and not a class. `ProfileAvatar` writes its width
and height as inline styles — deliberately, to keep Safari from sizing the
wrapper off the image's intrinsic dimensions — so a `size-*` utility is simply
overridden and the avatar stays 32px.

One further implementation note that is not optional: `SidebarMenuButton` hides
every direct `<span>` child at icon width, which is what removes the label. The
avatar is a span too, so it needs an explicit override or the collapsed row is
empty.

### 3.4 The top right does not change

`HeaderControls` keeps language, theme, the bell and `ProfileControl`. The
avatar menu keeps its identity block, its My Page link and its "View as" role
switcher. Nothing is removed from this corner and nothing is added to it.

Two doors to one page is the intent, not an oversight. The header is where a
reader who has learned any other product looks for their account; the rail is
where this reader is already working. They differ in what they are grouped
*with* — the header groups the account with theme and language, the rail groups
it with navigation — and both are cheap.

The one thing that changes is where the header's link *lands*: inside an academy
it points at `routes.academyMe(academySlug)` rather than `routes.account`, so
both doors open the same page. `/account` remains the destination where there is
no academy to scope to — the console, the lobby, an account with no membership.

### 3.5 "View as" stays in the header avatar menu

Considered and rejected: moving the role switcher to the head of the rail, onto
the academy control that already displays the role.

The case for moving it is real — switching role rebuilds the navigation, and a
control that reshapes the rail sits more naturally above the rail than in
another corner. The case against is that it works, it is where this product's
readers have already learned to find it, and the change would drag
`ResponsiveSelector` into growing sections and search-scoping for a control
almost nobody sees, since `held.length > 1` is rare.

If it is ever revisited, the correct move is to make the **header chip itself**
the trigger — the thing that shows the state becomes the thing that changes it —
not to add a fourth control to the header bar.

## 4. Information architecture

### 4.1 Routes

| Route | Frame | Academy | Who reaches it |
| --- | --- | --- | --- |
| `/academy/{slug}/me` | framed studio | the slug | any member, from the rail or the header |
| `/account` | `MyPageShell` | none | no membership; console; lobby; bookmarks |
| `/account?academy={id}` | — | — | redirects to the framed route, or drops the query |
| `/studio/my-page` | — | — | existing redirect to `/account`, unchanged |

`routes.ts` gains `academyMe(academySlug)`. `myPagePath` in
`account/_lib/academy-selection.ts` is deleted along with the selection logic it
served; `lastAcademyStorageKey` and `remembered-academy.ts` go with it.

### 4.2 Where My Page is linked from

| Caller | Today | After |
| --- | --- | --- |
| `header-controls.tsx:274` | `routes.account` | `routes.academyMe(slug)` inside an academy, `routes.account` otherwise |
| studio rail, new row | — | `routes.academyMe(slug)` |
| `status-plate.tsx:95` "Open My Page" | `routes.account` | unchanged — an applicant has no membership |
| identity card's academy strip | in-page selection | `routes.academyMe(slug)` per academy |

### 4.3 What does not get a row

The lobby rail and the console rail keep their footers exactly as they are:
`SignOutControl` and nothing else. Neither has an academy-scoped My Page to
point at — an applicant belongs to no academy yet, and an operator's authority
comes from the platform axis rather than a membership — and in both the header
avatar is already the way to `/account`.

## 5. Component changes

| File | Change |
| --- | --- |
| `.../(framed)/_components/studio-sidebar.tsx` | new `MyPageRow` at the foot of `SidebarContent`; new `viewer` prop; My Page joins the set `activeNavHref` resolves against. |
| `components/studio/profile-avatar.tsx` | new `xs` size at 20px, for a face standing among navigation glyphs. |
| `.../(framed)/_components/studio-chrome.tsx` | passes `viewer` to `StudioSidebar` as well as to `HeaderControls`. The data is already assembled there (`studio-chrome.tsx:114`). |
| `components/studio/header-controls.tsx` | the My Page link takes `academySlug` into account. Nothing else. |
| `.../(framed)/me/page.tsx`, `loading.tsx` | **new.** Resolves the academy from `params`, renders the shared workspace with the academy fixed. |
| `(studio)/account/page.tsx` | renders the global sections and the academy strip; performs the `?academy=` redirect. |
| `components/studio/profile/my-page/*` | the workspace, its sections, hooks and helpers, moved out of the `/account` subtree so both routes may import them. |
| `account/_lib/remembered-academy.ts` | deleted. |
| `account/_lib/academy-selection.ts` | reduced to `redirectSlugFor`, which resolves the compatibility redirect and nothing else. |
| `lobby-sidebar.tsx`, `platform-sidebar.tsx` | untouched. |

### 5.1 The independence test stays, and widens

`account-route-independence.spec.ts` still applies to `/account`, which remains
academy-context-free. The shared section components move out of that subtree so
both routes may import them, and the same rule applies to them: the academy
travels as a **prop**, never through `useAcademySlug`, because the global route
mounts no provider. The spec is extended to cover the shared directory — where
it matters most, since those files render under a provider on one route and
under none on the other.

## 6. States and edge cases

| Case | Behaviour |
| --- | --- |
| Member with one academy | rail persists; the My Page row reads as active |
| Member with several | the rail's academy switcher moves between them; the identity strip does too; the URL carries which |
| **No active membership** | `/account`, standalone shell, global sections only |
| **Applicant in the lobby** | no membership, so `/account` from the header avatar; the lobby rail is unchanged |
| **Platform operator in the console** | `/account` from the header avatar; the console rail is unchanged |
| **Operator inside an academy on a support grant** | the row renders and leads to the academy-scoped page; `requireAcademyRoute` answers for it as it does for every other framed page |
| Collapsed icon rail | the row is the avatar alone, with "My page" in its tooltip — the one row still recognisable at that width |
| Any role | the row is last in every rail, so a student with three groups and a manager with five find it in the same place |
| Mobile | the rail is a `Sheet`; the header avatar is the entrance that needs no drawer, which is one reason both exist |
| Membership revoked while on `/academy/{slug}/me` | the framed layout's existing guard answers, as for every other page under it |

## 7. Copy and i18n

No new namespace and no new strings. `nav.my_page` is already the label the
header menu uses, and the row uses the same one, so the two doors are named
identically. The framed page reuses the `profile` namespace, already mounted for
`/account` (`i18n/namespaces.ts:223`), through its own provider rather than
`layoutNamespaces` — that list is mounted for every student on every studio page
and is capped, and the profile vocabulary is read on exactly one of them.

## 8. What this supersedes

`docs/superpowers/specs/2026-08-14-my-page-account-academy-profile-design.md`:

- **§6.1** — the canonical route for a member becomes `/academy/{slug}/me`.
  `/account` is retained for the membership-less case that section requires, and
  `?academy=` becomes a redirect rather than a selector.
- **§6.1, final paragraph** — "My Page is opened from a profile control in the
  persistent Studio header" is **kept**, not replaced. That control stays where
  it is and keeps everything it holds; it is joined by a second entrance in the
  rail, and its link is re-pointed at the academy-scoped address. The avatar
  fallback chain the paragraph specifies — academy image, global Cove image,
  external OAuth image, generated initials — is unchanged, and the new row uses
  the same `ProfileAvatar`, so both doors show the same face.

Everything else in that document — the sections, their order, the image
pipeline, the authorization model — is untouched.

## 9. Rejected alternatives

**Keep `/account` global and give it a sidebar.** Honours §6.1 as written, but
the route is a different layout subtree, so the rail remounts on entry and loses
its scroll position and open groups — the exact regression `StudioChrome` was
made a layout to prevent (§2.3).

**Move the account control out of the header and into the rail's footer.**
Tried, and reverted. It reads well on paper — the reader beside their own
navigation — but it trades a known location for a novel one, and leaves the
top-right corner holding only settings when the corner was never the problem.
Two entrances cost almost nothing; taking one away costs everyone who already
knows where it is.

**A "My page" row inside the Learning or Academy group.** Puts the reader inside
a list of academy sections. Beside "My courses" it reads as a student's page;
under Academy it reads as a setting of the academy. It is neither.

**Moving "View as" to the head of the rail.** §3.5.

**A `lucide` glyph for the My Page row.** It would match its neighbours, which
is exactly the problem: the row does not lead where its neighbours lead, and on
the collapsed rail a face is the only icon that says whose page it is.

**The row first, above the groups.** Tried. It reads as a header rather than as
navigation, it pushes the academy's own shape down the rail, and it lands in a
different place from the header avatar it duplicates. Last is the position that
is identical for every role.

## 10. Test plan

- `account-route-independence.spec.ts`, extended to the shared section
  directory: no academy route hook in anything the global route renders.
- Unit: `redirectSlugFor` — an active membership, an inactive one, an unknown
  id, no query at all, an account with no memberships.
- E2E: from an academy page, open My Page from the rail row; assert the URL is
  the academy-scoped one and the sidebar is still mounted.
- E2E: the header avatar's My Page link lands on the same academy-scoped page,
  not on `/account`.
- E2E: the identity strip still asks before discarding an unsaved academy
  profile — the switch is a navigation now, and `beforeunload` cannot see one.
- E2E: an account with no membership reaches `/account` and sees the global
  sections without a rail.
- E2E: `/account?academy={id}` for an active membership lands on
  `/academy/{slug}/me`; for a foreign id, lands on `/account` with the query
  gone.

## 11. Implementation order

1. Extract the My Page sections into shared components under
   `components/studio/profile/my-page/`, taking a resolved academy as a prop,
   with `/account` still the only route. No behaviour change.
2. Add `routes.academyMe` and the framed route with its `loading.tsx`.
3. Reduce `/account` to the global sections plus the academy strip, add the
   `?academy=` redirect, delete `remembered-academy.ts` and `myPagePath`.
4. Add `MyPageRow` to the studio rail and thread `viewer` through the chrome.
5. Re-point the header avatar's link at the academy-scoped address.
