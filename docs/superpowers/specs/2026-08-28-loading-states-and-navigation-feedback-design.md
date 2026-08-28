# Loading States and Navigation Feedback Design

**Date:** 2026-08-28
**Branch:** `feat/loading-ux`
**Status:** Draft — awaiting approval

## 1. Purpose

Every page in Cove Studio is an async Server Component that awaits all of its
data before returning any HTML. The app has no `loading.tsx`, no `error.tsx`,
and no `<Suspense>` boundary anywhere:

```
$ find packages/web/src/app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx'
(no results)

$ grep -rn "Suspense" packages/web/src --include=*.tsx
(no results)
```

The consequence is the complaint this document answers. A person clicking
anything in the studio gets **no acknowledgement at all** until the server has
finished:

- **On a client navigation**, the browser holds the previous page, frozen and
  fully interactive-looking, for the whole server round trip. Clicking a
  sidebar link appears to do nothing. People click it again.
- **On a cold load or a refresh**, the browser shows a blank white document
  for the same duration.

This is not a slow-network edge case. It is every navigation, every time.

## 2. Diagnosis

### 2.1 The shell is rendered by the page, not by a layout

`StudioShell` — sidebar, sticky header, account controls, page heading — is
imported and rendered inside each `page.tsx`, and awaits `auth.me()` itself
(`packages/web/src/app/(studio)/academy/[academySlug]/_components/studio-shell.tsx:50`).

Two things follow. The chrome is re-fetched and re-rendered from scratch on
every navigation even though nothing in it changed, and there is nothing on
screen that can stay put while the next page loads — the whole viewport is
inside the boundary that is blocked.

### 2.2 The account is fetched three times per studio page

`auth.me()` has twenty call sites. Exactly one of them is deduplicated: the
`cache()` wrapper in `packages/web/src/lib/academy-route.ts:16`. Rendering
`/academy/[slug]` calls it four times through three uncached paths:

| Caller | Line | Deduplicated |
| --- | --- | --- |
| `resolveAcademyRoute` | `lib/academy-route.ts:16` | yes (`react.cache`) |
| `AcademyLayout` | `(studio)/academy/[academySlug]/layout.tsx:49` | no |
| `AcademyPage` | `(studio)/academy/[academySlug]/page.tsx:57` | no |
| `StudioShell` | `_components/studio-shell.tsx:50` | no |

Three redundant network round trips to the API, mostly sequential, on the
critical path of every studio page. This is not a rendering problem that
better loading UI papers over — it is a real and removable part of the delay
people are waiting through.

### 2.3 Where skeletons do exist, they are duplicated and inconsistent

Four separate `OverviewSkeleton` functions exist, one per role workspace
(`manager`, `teacher`, `student`, `lead`), plus `RankingSkeleton` and
`ChartSkeleton`. They disagree on the details that matter:

| | `aria` | Field colour | Reduced motion |
| --- | --- | --- | --- |
| `manager-overview-workspace.tsx:238` | `aria-live="polite"` + `sr-only` label | `bg-accent` | `motion-reduce:animate-none` |
| `lead-overview-workspace.tsx:490` | `aria-hidden` | `bg-muted` | none |
| `chart.tsx:380` | `aria-live="polite"` + `sr-only` label | `bg-accent` | `motion-reduce:animate-none` |

Two of the three announce themselves to a screen reader, one hides itself; two
respect reduced motion, one animates regardless. All of them are the same idea
written three times.

### 2.4 What the reference project does

`~/docquery` solves the equivalent problem with `useSuspenseQuery` under
explicit `<Suspense>` boundaries, a one-line `Skeleton` primitive, and layout
scaffolds (`PanelSkeleton`, `LayoutChat`) that keep the frame on screen while
only the panel contents swap. The transferable idea is the third one: **the
frame persists, the contents suspend.** That is precisely what §2.1 prevents
here, and fixing it is the enabling change for everything below.

## 3. Design principles

Four rules, in priority order. Every decision below derives from them.

**A loading state is a promise about the shape of what is coming.** Its job is
to reserve the exact geometry the real content will occupy so that nothing
reflows when data lands. The codebase already argues this to itself in
`manager-overview-workspace.tsx:235` — "every block is roughly the height of
what replaces it… so the page does not reflow" — and this design makes it the
rule rather than one component's good habit.

**Never draw a placeholder for something already known.** The sidebar's nav
items, the header controls, a table's column headers, its pagination chrome,
the page title — these are static, or already in hand, and they render *for
real* during loading. Only the genuinely unknown becomes a grey block: row
cells, metric values, chart plots, avatars, names. This is the rule that
separates the result from a generic skeleton library, and it is the one
readers will feel without being able to name.

**A skeleton that flashes is worse than no skeleton.** A placeholder shown and
removed inside 200ms reads as a glitch. Skeletons therefore start invisible and
fade in after a delay, so a fast navigation never shows one.

**Failure is a loading state that ended badly.** A page that cannot load is the
same complaint as a page that never loads. Error and not-found boundaries ship
in the same change as the skeletons, or the work is half done.

## 4. Visual language

No new colours, no new typefaces. The token system in `globals.css` is mature
and this work lives inside it.

### 4.1 Field and highlight

| Role | Light | Dark | Token |
| --- | --- | --- | --- |
| Placeholder field | `#F1F5F9` | `#1E2532` | `var(--accent)` |
| Sweep highlight | near-white | brand blue at 7% | see below |

The dark highlight borrows `--brand` at very low alpha rather than a lighter
grey: a grey-on-grey shimmer on the dark canvas reads as noise, while the
faintest blue reads as light. It is the one place this design spends any
colour, and it is spent below the threshold where anyone would call it blue.

Nothing here uses `--primary` or a saturated `--brand`. A loading state does
not get to be the loudest thing on a page.

### 4.2 Motion — a sweep, not a pulse

Replace Tailwind's `animate-pulse` with a directional sweep.

`animate-pulse` oscillates opacity on the whole block. At the scale of a real
page — twenty placeholder blocks at once — twenty independent opacity throbs
read as anxious flicker. A highlight travelling left to right across a field
held at constant opacity reads instead as *being filled in*, and it follows
reading direction.

```css
@keyframes cove-skeleton-sweep {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

.cove-skeleton {
  background-color: var(--accent);
  background-image: linear-gradient(
    90deg,
    transparent 20%,
    color-mix(in srgb, var(--card) 65%, transparent) 50%,
    transparent 80%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  opacity: 0;
  animation:
    cove-skeleton-fade 160ms ease-out 120ms forwards,
    cove-skeleton-sweep 1600ms linear 120ms infinite;
}

.dark .cove-skeleton {
  background-image: linear-gradient(
    90deg,
    transparent 20%,
    color-mix(in srgb, var(--brand) 7%, transparent) 50%,
    transparent 80%
  );
}
```

Every skeleton in one `loading.tsx` mounts in a single commit, so their
animations start on the same tick and the page shimmers **in phase** — one
sheet of paper being scanned, rather than twenty rectangles each doing their
own thing. This is the signature of the system, and it costs nothing beyond
sharing one keyframe name and one duration.

The `120ms` delay on both animations, paired with `opacity: 0` at rest, is the
anti-flash rule from §3: a navigation that resolves inside 120ms never paints a
skeleton at all. This mirrors the treatment the Next.js documentation
recommends for `useLinkStatus` hints.

### 4.3 Reduced motion

`globals.css` already ends its motion block with a `prefers-reduced-motion`
override, and this joins it — a static `--accent` field at full opacity, no
sweep, no fade:

```css
@media (prefers-reduced-motion: reduce) {
  .cove-skeleton {
    animation: none !important;
    background-image: none;
    opacity: 1;
  }
}
```

## 5. The component kit

One new file, `packages/web/src/components/studio/skeletons.tsx`, holding the
composed shapes. The existing `Skeleton` in `primitives.tsx` stays where it is
and is re-implemented on `.cove-skeleton` — every current caller keeps working
and inherits the new motion for free.

```tsx
SkeletonText     // n lines, last line short, at a given line height
SkeletonBlock    // a sized rectangle: the generic reservation
SkeletonCircle   // avatars and rank markers
SkeletonPanel    // a bordered card with a real title and placeholder body
SkeletonTable    // real column headers + real pagination chrome, placeholder cells
SkeletonMetrics  // a row of stat tiles: real labels, placeholder figures
SkeletonForm     // real section headings + real field labels, placeholder inputs
```

The last four carry §3's second rule in their signatures. `SkeletonTable` takes
the actual `columns: string[]` and renders them as genuine `<th>` text;
`SkeletonForm` takes real `labels`. A caller that has the real strings is
required to pass them, because it always does — they are static copy, not data.

## 6. Route-level loading

### 6.1 The chrome must move first

`loading.tsx` is a Suspense fallback and therefore renders synchronously. It
cannot fetch. So while `StudioShell` lives inside `page.tsx` (§2.1), any
`loading.tsx` must replace the entire viewport including the sidebar — and the
sidebar would flicker into grey bars on every single navigation. That trades
one bad experience for another.

**`StudioShell` splits in two.**

- `StudioChrome` — `SidebarProvider`, `StudioSidebar`, the sticky header,
  `HeaderControls`. Async, fetches `auth.me()` **once**, and moves into
  `(studio)/academy/[academySlug]/layout.tsx`. Because Next does not re-render
  a shared layout on navigations beneath it, the sidebar and header now persist
  across every studio navigation, keeping scroll position, open groups, and
  focus.
- `StudioPage` — the `max-w-6xl` container, the page heading, `actions`, and
  the optional content card. **Synchronous, no data access.** It keeps
  `title`, `description`, `actions`, `bleed`, and `showPageHeading`, so the
  ~30 call sites change only their component name and drop the now-unused
  `academyId` prop.

The sticky header's title moves to naming the academy, which the layout knows.
Today it repeats the page heading rendered directly beneath it, so this removes
a duplication rather than losing information.

`AcademyLayout` and `StudioChrome` both need the account, and both now live in
the same layout, so they share a single `cache()`-wrapped read (§8.2).

### 6.2 The map

Sixteen files. `loading.tsx` cascades to nested segments, so these cover all 46
routes; a segment appears here only where its shape genuinely differs from its
parent's.

| File | Shape |
| --- | --- |
| `(auth)/loading.tsx` | Centred auth card: real brand mark, placeholder fields |
| `(platform)/loading.tsx` | Platform chrome + table |
| `(studio)/loading.tsx` | Studio chrome skeleton — cold entry only (see below) |
| `(studio)/account/loading.tsx` | Section cards |
| `…/[academySlug]/loading.tsx` | Overview panel column |
| `…/[academySlug]/people/loading.tsx` | `SkeletonTable`, people columns |
| `…/[academySlug]/people/[membershipId]/loading.tsx` | `SkeletonForm`, profile sections |
| `…/[academySlug]/classes/loading.tsx` | `SkeletonTable`, class columns |
| `…/[academySlug]/invitations/loading.tsx` | `SkeletonTable` |
| `…/[academySlug]/applications/loading.tsx` | `SkeletonTable` |
| `…/[academySlug]/settings/loading.tsx` | `SkeletonForm` |
| `…/[academySlug]/content/loading.tsx` | Course grid, then builder columns |
| `…/[academySlug]/learn/loading.tsx` | Catalog cards |
| `…/[academySlug]/learn/exercises/[materialId]/loading.tsx` | Split-pane frame: real toolbar, placeholder panes |
| `…/[academySlug]/teach/loading.tsx` | Roster table |
| `…/[academySlug]/points/loading.tsx` | Board + ranking column |

`(studio)/loading.tsx` is the one that renders chrome as a skeleton, and it is
correct that it does: it covers **cold entry** into the studio, where
`academy/[academySlug]/layout.tsx` is itself rendering and there is no real
sidebar to keep. Once inside, every navigation hits one of the segment files
below it, the layout is not re-rendered, and the real chrome stays on screen.

### 6.3 What is deliberately not adopted

**Cache Components and `unstable_instant`.** Next 16.2 offers build-time
validation that a route produces an instant static shell
(`node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`). It
requires `cacheComponents: true`, which demands that *every* uncached data
access in the app sit behind an explicit `<Suspense>` boundary or a `use cache`
directive. For an app that is dynamic end to end behind authentication — every
page reads cookies — that is a re-architecture, not a loading fix. Worth
revisiting once §6.1 has landed and the boundaries exist; out of scope here.

## 7. Navigation feedback

With §6 in place, navigation paints a skeleton immediately and no global
progress bar is warranted. The Next documentation is explicit that route-level
fallbacks and prefetching are the first answer and `useLinkStatus` is the patch
for what they miss.

One targeted use survives: **the clicked sidebar item marks itself pending.**
A single small indicator on the item that was clicked says *which* destination
is loading — information a global top bar cannot carry. `StudioSidebar` already
renders each item as a `next/link` (`studio-sidebar.tsx:168`), so this is a
`useLinkStatus()` hook in a leaf component inside the `<Link>`.

Per the documentation's warning about layout shift, the indicator is a
fixed-size element that is always rendered and only changes opacity, and it
carries the same 120ms delay as §4.2 so a prefetched navigation never flashes
it. No global progress bar.

## 8. Adjacent work in this branch

### 8.1 Error and not-found boundaries

Six files, matching the loading map: `(auth)/error.tsx`, `(platform)/error.tsx`,
`(studio)/error.tsx`, `(studio)/academy/[academySlug]/not-found.tsx`, a root
`not-found.tsx`, and `app/global-error.tsx`.

Each says what happened, in the interface's voice, and offers the one action
that helps — `reset()` for a boundary, a route home for a not-found. They do
not apologise and they do not guess at a cause. The existing failure copy in
`classes/page.tsx` (`forbidden_title` versus `unavailable_title`) sets the
standard: a permission answer and an unreachable server are different
sentences, because telling a Manager they lack a role they hold sends them to
ask for it again.

### 8.2 Deduplicate `auth.me`

Introduce `getAccount()` in `packages/web/src/lib/orpc-server.ts`, wrapped in
`react.cache`, and route the uncached server call sites in §2.2 through it.
Per-request memoisation makes the three redundant round trips one.

This is the only item here that makes pages genuinely faster rather than
better-behaved while slow, and it is the reason it belongs in this branch
rather than a later one.

### 8.3 Consolidate the four `OverviewSkeleton`s

Replace all four, plus `RankingSkeleton`, with `SkeletonPanel` compositions
from §5. This settles the §2.3 inconsistencies on one answer:
`aria-busy="true"` on the container with an `sr-only` label, `--accent` as the
field, reduced motion respected — chosen because a screen reader that is told
nothing simply reports an empty region.

## 9. Out of scope

- **`cacheComponents` / `unstable_instant`** — §6.3.
- **The `(compatibility)` route group** — pinned to `.theme-light` and removed
  at the v1 cutover. Adding loading UI to code with a deletion date is waste.
- **Optimistic mutation UI.** Mutation pending states (`disabled` + label swap)
  are already applied consistently at the sites that have them. Reworking them
  into optimistic updates is a different design with different risks.
- **Changing any data-fetching strategy.** No page moves from server-rendered
  to client-fetched or the reverse. This work changes what is shown while
  existing fetches run, and removes duplicate fetches. Nothing else.

## 10. Phasing

| Phase | Content | Files |
| --- | --- | --- |
| 0 | Motion tokens in `globals.css`; `skeletons.tsx`; `Skeleton` re-based | 3 |
| 1 | `StudioShell` → `StudioChrome` + `StudioPage`; `getAccount()` | ~35 |
| 2 | The sixteen `loading.tsx` files | 16 |
| 3 | Error and not-found boundaries | 6 |
| 4 | Sidebar `useLinkStatus` hint; consolidate the four skeletons | ~7 |

Phase 1 is the largest and is almost entirely mechanical — a component rename
and a dropped prop across the studio pages. It is sequenced before Phase 2
because writing chrome skeletons first and deleting them after is wasted work.

Each phase is a commit. Phases 0–2 are the answer to the original complaint;
3 and 4 are the rest of the same idea.

## 11. Verification

- `pnpm --filter @cove/web typecheck` and `pnpm --filter @cove/web lint` after
  each phase.
- `pnpm --filter @cove/web test` — the existing suites under
  `src/components/studio` and `src/lib` must stay green through the Phase 1
  rename.
- `pnpm --filter @cove/web i18n:check` — new copy in §7 and §8.1 needs `en` and
  `ko` entries. `common.json` already carries `state.loading`; the error
  boundaries need their own keys.
- Manual, with the network throttled: every navigation in §6.2 paints within
  one frame, the sidebar does not move or flicker, and nothing reflows when
  data lands.
- Manual, with reduced motion enabled at the OS level: no sweep, no fade,
  static fields.
- Both themes, at mobile and desktop widths.

## 12. Resolved decisions

1. **The sticky header title** (§6.1) shows the **academy's name**, and the
   page title stays in the heading beneath it. The layout already resolves the
   academy, so this needs no plumbing, and it removes the duplication where the
   bar and the heading say the same words twice. `StudioPage` therefore does not
   publish its title upward, and no context is introduced.
2. **Phase 1 lands in this branch**, as its own commit ahead of Phase 2 rather
   than as a separate PR. The change is a component rename and a dropped prop
   across the studio pages, so the review cost of splitting it exceeds the
   review cost of reading it in place — and keeping it here means the loading
   work is testable end to end in one branch.
