# Legacy Route and Authentication History Hardening Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Awaiting written-spec review

## 1. Problem

A long-lived development tab can still contain history entries created before
the canonical v2 route migration. Walking backward far enough can therefore
reach retired UUID routes such as:

```text
/studio/academies/:academyId/content/courses
```

The current application no longer generates those academy routes, but it has
no adapter for old history entries or bookmarks. Signed-in users may also view
`/login`, so an old login entry can interrupt an otherwise authenticated Back
journey. Finally, a few current account controls still generate the retired
`/studio/my-page` compatibility address instead of canonical `/account`.

The reference application uses ordinary browser history. Cove should do the
same while ensuring obsolete and authentication-only entries resolve to valid
destinations rather than attempting to replace the browser's history system.

## 2. Goals

- Preserve the equivalent canonical page for recognized legacy academy URLs.
- Prevent signed-in users from remaining on login or signup screens.
- Stop current source code from generating retired `/studio/*` destinations.
- Use replacement-style compatibility navigation so redirects do not add a
  new Back entry.
- Keep legacy academy lookup authorization-safe.
- Make the compatibility boundary removable after the transition period.

## 3. Non-goals

- Erasing arbitrary entries already stored in a user's browser history.
- Building a global custom history stack.
- Supporting legacy v1 pages or sessions inside the v2 deployment.
- Preserving malformed, unknown, or unauthorized legacy paths exactly.
- Changing canonical Cove Studio URLs.

## 4. Legacy academy adapter

A dedicated compatibility route owns:

```text
/studio/academies/:academyId
/studio/academies/:academyId/*
```

It authenticates the current account and resolves `academyId` only through an
active academy membership visible to that account. A missing session follows
the normal login policy. An unknown or unauthorized academy uses the same
not-found behavior so the adapter does not reveal whether an academy exists.

For an authorized academy, the adapter replaces the UUID prefix with the
academy slug:

```text
/studio/academies/:academyId/content/courses
    -> /academy/:academySlug/content/courses
```

The adapter preserves the remaining path only when its first segment belongs
to a recognized canonical academy family:

- `classes`
- `content`
- `learn`
- `teach`
- `people`
- `applications`
- `invitations`
- `points`

An empty suffix maps to academy Overview. An unrecognized suffix also falls
back to Overview rather than forwarding unknown structure into the canonical
route tree. Path segments are decoded and re-encoded individually; no suffix
is accepted as an absolute or protocol-relative URL.

The redirect uses Next.js replacement semantics. Reaching the legacy entry
through browser Back therefore settles on the canonical destination without
adding a second legacy/canonical loop.

## 5. Signed-out-only authentication entry points

`/login` and `/signup` become signed-out-only pages. Before rendering either
page, the server checks the existing account session:

- no valid account: render the requested authentication page;
- valid account: replace-navigate to `authDestination(account)`.

`authDestination` remains the single post-authentication policy, so active
members, platform administrators, pending users, and users without an academy
continue to land on their existing destinations.

Password recovery, invitation, pending, and welcome routes retain their
current policies. They are not made signed-out-only merely because they share
the authentication route group.

## 6. Canonical account destinations

Current generators of `/studio/my-page` are replaced with the canonical route
module:

- the global profile control links to `routes.account`;
- account academy-selection state uses `/account?academy=...`; and
- related tests assert the canonical address.

The existing `/studio/my-page -> /account` compatibility redirect remains for
one release so an old bookmark still works. New source code never emits it.

## 7. Route-policy enforcement

The canonical-route source guard rejects new direct generation of:

```text
/studio/my-page
/studio/academies
```

Only the canonical route policy and the dedicated compatibility adapter may
mention retired forms. Tests and migration documentation remain exempt from
runtime source scanning.

The Supabase session proxy includes `/studio/:path*` during the compatibility
period so the adapter receives refreshed authentication cookies. This matcher
is removed together with the adapter at retirement.

## 8. Failure and security behavior

- Unauthenticated legacy academy navigation follows the existing login flow.
- Unknown and unauthorized academy IDs return indistinguishable not-found
  responses.
- Malformed or unrecognized suffixes go to authorized academy Overview.
- Redirect destinations are constructed exclusively from canonical route
  helpers and encoded path segments.
- Query parameters from legacy academy URLs are not forwarded unless a
  specific canonical mapping explicitly supports them; the initial adapter
  forwards none.
- A compatibility failure never redirects to caller-supplied external input.

## 9. Test strategy

Tests cover:

- UUID-to-slug resolution for an active membership;
- exact preservation of every recognized academy route family;
- Overview fallback for empty and unrecognized suffixes;
- rejection of unknown and unauthorized academy IDs;
- replacement redirect semantics;
- signed-in login and signup destination policy;
- signed-out login and signup rendering;
- canonical `/account` generation and the temporary old bookmark redirect;
- source-guard rejection of new retired route generators; and
- the proxy matcher covering the temporary adapter.

The complete web test suite, route guard, type-check, lint, production build,
and a signed-in browser Back journey must pass before handoff.

## 10. Retirement

The adapter and `/studio/:path*` proxy matcher are temporary. After the
transition window, removal consists of deleting the compatibility route and
its tests, removing the proxy matcher, and deleting the remaining simple
`/studio/my-page` redirect. Canonical pages and callers require no change.
