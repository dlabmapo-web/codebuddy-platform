# QA-04 — My Page appears twice

> **Status: fixed on `qa-feedback`**, in both the studio and the console. `MyPageRow` and its spec were deleted.

Registered 2026-11-06 · Sunny · P1 · Brooks OK

## Request

The top-right avatar menu's **마이 페이지** and the **마이 페이지** row at the bottom of the left panel do the same thing. Remove the left-panel one **for every role (manager, teacher, student)**.

## Current behaviour

- **Left panel row.** `MyPageRow` ([components/studio/nav/my-page-row.tsx](../../../packages/web/src/components/studio/nav/my-page-row.tsx)) is rendered in the `SidebarFooter` of [studio-sidebar.tsx:195-201](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx#L195-L201) and links to `routes.academyMe(slug)`. The same component is also in the platform console rail, [platform-sidebar.tsx:292-299](../../../packages/web/src/app/(platform)/admin/_components/platform-sidebar.tsx#L292-L299), linking to `/account?from=admin`.
- **Header.** `ProfileControl` in [header-controls.tsx](../../../packages/web/src/components/studio/header-controls.tsx) is the avatar dropdown with My Page and Sign out. Inside an academy it links to the same `routes.academyMe(slug)`.
- `studio-chrome.tsx` renders the header for **every academy role**, including students ([studio-chrome.tsx:242-265](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-chrome.tsx#L242-L265)). `viewer` is never null on a rendered page: a failed account read redirects to `/login`. So once the row is gone, the header remains a reliable entry for every role, on desktop and on mobile, where the header stays visible while the sidebar is a sheet.

## Implementation plan

### Academy studio (required)

1. In [studio-sidebar.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx):
   - Delete the `<SidebarFooter>` block (lines 195-201) and the `MyPageRow` import.
   - Remove `myPageHref` (line 154) and its entry in the `activeNavHref` candidates (line 163). Without the overview prefix (see QA-02), no other row claims `/me`, so no row is highlighted on My Page. That is correct, because the page is reached from the header.
   - Remove the `viewer` prop from `StudioSidebar` and its `MyPageViewer` type import. In `studio-chrome.tsx` stop passing `viewer={viewer}` to the sidebar (line 181), but keep `viewer` for `HeaderControls`. Update the comment at `studio-chrome.tsx:115` ("Feeds both ways into My Page…").
   - The `maintenance` group keeps `mt-auto` and stays pinned to the bottom of `SidebarContent`. Check that its top border still reads as a divider once the footer is gone.

### Platform console (recommended, needs a decision)

The QA text names academy roles. For one consistent rule ("My Page lives in the avatar menu"), remove the row from `platform-sidebar.tsx` as well. Before doing so:

- Make the console header's `ProfileControl` link to `routes.accountFrom('admin')` instead of the bare `/account`, so the account page's back button still returns to the console ([account/back-destination.ts](../../../packages/web/src/app/(studio)/account/back-destination.ts)). Pass an `accountHref` prop, or `origin: 'admin'`, through `HeaderControls` from [platform-shell.tsx:101](../../../packages/web/src/app/(platform)/admin/_components/platform-shell.tsx#L101).
- Then delete the console footer, and `PlatformSidebar`'s `viewer` prop.

If both rails drop the row, `my-page-row.tsx` and `my-page-row.spec.tsx` have no callers and should be deleted. If the console keeps it, leave the component.

## Tests

- `studio-sidebar.spec.ts`: assert that the rail renders no My Page link for manager, teacher and student view roles.
- `e2e/specs/my-page.spec.ts:74` (*"My Page is reachable from the rail and from the header…"*) clicks the rail link at line 85. Rewrite it as *reachable from the header menu*, assert the rail has **no** My Page link, and keep the check that the rail stays on screen on `/me`.
- `e2e/specs/platform-administration.spec.ts:61` clicks a My Page **link** (the console rail). If the console row is removed, switch it to the avatar button and menuitem flow used at line 68, and assert that the back link returns to `/admin`.
- `my-page-row.spec.tsx`: delete it with the component, if the component is deleted.
- In the browser, check each of manager, teacher and student. The rail footer is gone, the avatar menu opens My Page, and on mobile the sheet has no footer while the header avatar works. Check light and dark, KO and EN.

## Scope

- Web only. No API or statement-count changes. Removing the `viewer` prop from the sidebar does not remove any read, because the header still uses the same `getAccount()` result.
