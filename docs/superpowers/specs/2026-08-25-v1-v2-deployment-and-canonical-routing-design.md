# V1/V2 Deployment Separation and Canonical Routing Design

**Date:** 2026-08-25
**Branch:** `feat/cove-studio-v2`
**Status:** Approved for implementation planning

## 1. Problem

Cove MVP and Cove Studio v2 currently coexist inside `packages/web`. The Phase
0 migration intentionally moved the v1 application intact and added v2 beside
it. That preserved production behavior during development, but it left two
competing applications behind one web interface:

- `/` and `/login` still use the v1 session and route implementation;
- v2 authentication is exposed under `/auth/*`;
- v2 academy pages are exposed under `/studio/academies/:academyId/*`;
- the proxy contains both the v1 JWT adapter and v2 Supabase adapter; and
- hundreds of callers construct route strings directly.

Next.js route groups such as `(v2-auth)` and `(v2-studio)` do not create public
URL segments. The visible `auth`, `studio`, and `platform` prefixes come from
real folders beneath those groups.

V2 needs a clean public URL interface without deleting the operating v1
codebase or database.

## 2. Goals

- Preserve Cove MVP as an independent deployment from the `main` branch.
- Make the v2 web package a standalone Cove Studio deployment.
- Give Cove Studio one Supabase authentication seam.
- Replace UUID-based academy URLs with stable, readable academy slugs.
- Concentrate Cove Studio route knowledge in one deep canonical route module.
- Remove redundant implementation prefixes from human-facing URLs.
- Keep technical authentication callbacks explicit and stable.
- Verify every product independently before changing public DNS.

## 3. Non-goals

- Deleting or migrating the v1 database.
- Changing v1 behavior on the `main` branch.
- Merging v1 and v2 sessions or authentication providers.
- Performing the final v1 data migration or production cutover.
- Consolidating distinct student, teacher, and management page behavior merely
  because some pages concern the same resource.
- Supporting every pre-launch v2 URL forever.

## 4. Deployment topology

Each product surface has an independent deployment seam:

| Host | Deployment | Source |
|---|---|---|
| `coveedu.com` | Cove Home | `packages/home` on the v2 branch |
| `cs.coveedu.com` | Cove Studio v2 | `packages/web` on the v2 branch |
| `api.coveedu.com` | Cove Studio API | `packages/api` on the v2 branch |
| `mvp.coveedu.com` | Cove MVP v1 | the v1 application from `main` |

Removing v1 modules from `feat/cove-studio-v2` does not remove them from
`main`, Git history, the v1 deployment, or the v1 database.

During this transition, `main` remains the v1 source branch. Promoting v2 to
`main` is a later cutover decision and is outside this design.

## 5. Canonical Cove Studio routes

### 5.1 General and authentication

```text
/                              signed-in or signed-out dispatcher
/login                         password and social login
/signup                        account creation
/forgot-password               password recovery request
/reset-password                recovery password update
/welcome                       academy discovery and application entry
/pending                       pending/suspended application state
/invite/:token                 invitation entry
/invite                        invitation acceptance state
/account                       personal account settings
```

Only technical authentication endpoints retain the `/auth` prefix:

```text
/auth/callback                 Supabase OAuth/email callback
/auth/recovery/confirm         recovery token confirmation interstitial
```

The root dispatcher uses one v2 authentication implementation:

1. signed-out visitor → `/login`;
2. active academy member → `/academy/:academySlug`;
3. platform administrator without an active academy → `/admin`;
4. user with no academy relationship → `/welcome`; and
5. pending, rejected, cancelled, suspended, or approved-transition state →
   `/pending`, using the existing access-state policy.

### 5.2 Academy routes

```text
/academy/:academySlug
/academy/:academySlug/classes
/academy/:academySlug/classes/:classId
/academy/:academySlug/content/courses
/academy/:academySlug/content/courses/:courseId
/academy/:academySlug/learn/courses
/academy/:academySlug/learn/courses/:courseId
/academy/:academySlug/learn/classes
/academy/:academySlug/learn/classes/:classId
/academy/:academySlug/learn/records
/academy/:academySlug/learn/exercises/:materialId
/academy/:academySlug/teach/classes
/academy/:academySlug/teach/classes/:classId
/academy/:academySlug/teach/students
/academy/:academySlug/people
/academy/:academySlug/people/:membershipId
/academy/:academySlug/applications
/academy/:academySlug/invitations
/academy/:academySlug/points
```

Existing deeper authoring, live-teaching, progress, and submission-review paths
remain beneath the corresponding canonical prefix. This migration changes
route ownership and academy identity; it does not combine distinct page
implementations.

### 5.3 Platform administration

```text
/admin
/admin/academies
/admin/academies/new
/admin/academies/:academySlug
```

The v1 `/admin/*` implementation is absent from the v2 deployment, so the
canonical v2 platform-administration routes have no conflict.

## 6. Canonical Route Module

Cove Studio gains one deep canonical route module. Its interface owns:

- general and authentication destinations;
- academy-scoped paths from an academy slug;
- platform-administration paths;
- post-authentication destination policy;
- invitation and password-recovery paths; and
- the small set of temporary compatibility redirects.

Callers pass typed identifiers and route-specific inputs. They do not assemble
canonical paths through string interpolation. The module implementation may be
internally divided for locality, but callers see one route policy interface.

The canonical route module is the test surface. Every exported destination has
an exact expected URL test, and a source guard rejects new direct uses of the
retired `/studio/academies` and human-facing `/auth/login` forms.

## 7. Academy slug resolution

The browser URL uses `academy.slug`; internal database and API operations keep
using `academy.id`.

An academy route resolves the slug once, verifies that the current user may
access the academy, and then passes the internal ID into existing page modules.
The resolver forms a deep module: callers learn one interface and do not repeat
slug lookup, status, membership, or not-found rules.

Security behavior:

- unknown and unauthorized slugs return the same not-found result;
- inactive academies retain the existing status-specific access rules without
  revealing extra information;
- API authorization continues to verify internal academy IDs independently;
  and
- a readable URL never substitutes for authorization.

Academy names may change. Academy slugs are immutable after creation for this
project so bookmarks, invitations, and shared links remain stable. A future
slug-change feature would require stored redirect history and is outside this
design.

The existing organization-scoped slug uniqueness constraint remains valid.
The platform currently creates academies inside one platform organization, so
the canonical URL interface is unambiguous.

## 8. Authentication seam

The v2 deployment uses only the Supabase adapter. The v1 `pc_token` JWT adapter,
v1 role map, and v1 route protection are removed from the v2 branch with their
private callers.

The proxy refreshes Supabase sessions for every protected Cove Studio route,
including `/academy/*`, `/account`, `/admin/*`, `/welcome`, `/pending`, and
invitation/recovery flows. Authorization remains in the server/API modules;
the proxy is not treated as the authorization authority.

The v2 root page delegates to the existing academy-access policy through the
canonical route module. It contains no v1 role destinations.

## 9. Compatibility policy

V2 has not launched publicly, so deep pre-launch
`/studio/academies/:academyId/*` URLs have no permanent compatibility promise.
Supporting them would require repeated ID-to-slug lookups and preserve an
obsolete public interface.

The following simple temporary redirects remain for one release because they
are cheap and may exist in local bookmarks or provider configuration:

```text
/auth/login          → /login
/auth/signup         → /signup
/auth/forgot         → /forgot-password
/auth/reset-password → /reset-password
/studio/my-page      → /account
```

They are compatibility adapters, not canonical destinations. New code and
provider configuration never generate them.

When `coveedu.com` changes from v1 to Cove Home, hosting rules preserve
unambiguous v1 deep links by redirecting them to the same path on
`mvp.coveedu.com`. The overlapping `/login` and `/signup` entry points require
an explicit transition announcement: Cove Home sends new users to Cove Studio,
while the visible MVP link sends existing v1 users to `mvp.coveedu.com/login`.

## 10. V1 retirement from the v2 branch

The following v1 implementation areas are removed only from the v2 branch:

- v1 pages and layouts;
- v1 Next.js route handlers after confirming they have a v2 replacement;
- v1 JWT session, password, and role-routing modules;
- v1-only navigation and private UI; and
- v1-only tests, configuration, and proxy rules.

Deletion follows an import/dependency inventory. Implementations still used by
v2—such as editor or coding-workspace code—are first moved into clearly named
v2 modules. The deletion test determines whether a suspected compatibility
module is earning depth or merely retaining old structure.

V2-specific Next.js route handlers, including the learning draft beacon and
submission stream, remain.

## 11. Configuration updates

The route migration updates these external and runtime interfaces together:

- Supabase Site URL: `https://cs.coveedu.com`;
- Supabase allowed redirects:
  - `https://cs.coveedu.com/auth/callback`;
  - `https://cs.coveedu.com/auth/recovery/confirm`;
- API `WEB_ORIGIN=https://cs.coveedu.com`;
- web `NEXT_PUBLIC_SITE_URL=https://cs.coveedu.com`;
- Home `NEXT_PUBLIC_STUDIO_URL=https://cs.coveedu.com`;
- invitation links generated from the canonical route module;
- password-recovery redirects generated from the technical confirmation path;
  and
- social-provider callbacks and email templates that refer to Cove Studio.

## 12. Migration sequence

1. Record the deployment and routing domain language in `CONTEXT.md`.
2. Inventory v1 modules and identify implementations still consumed by v2.
3. Add the canonical route module and its exact URL tests.
4. Add the academy-slug resolver and authorization tests.
5. Move v2 pages to canonical paths one vertical route family at a time.
6. Replace all v2 navigation, redirect, email, and action callers with the
   canonical route interface.
7. Replace the mixed proxy and v1 root dispatcher with Supabase-only v2 logic.
8. Add the narrow temporary compatibility redirects.
9. Move retained shared implementations out of v1-owned folders.
10. Remove remaining v1 modules and handlers from the v2 branch.
11. Update deployment and external-provider configuration.
12. Build and smoke-test Cove Home, Cove Studio, API, and MVP independently.
13. Deploy `main` to `mvp.coveedu.com` before changing `coveedu.com` DNS.
14. Change public DNS only after all acceptance checks pass.

## 13. Verification

### 13.1 Automated

- Canonical route tests cover every exported destination.
- Academy resolver tests cover known, unknown, unauthorized, and inactive
  academies.
- Route tests cover student, teacher, team lead, manager, and platform-admin
  entry destinations.
- Authentication tests cover login, signup, logout, social callbacks,
  invitation acceptance, password recovery, and password update.
- Direct-route tests cover courses, classes, exercises, people, applications,
  invitations, points, teaching, and progress.
- Proxy tests prove that protected v2 routes refresh Supabase sessions.
- Source guards reject new canonical callers containing
  `/studio/academies`, `/auth/login`, or `/auth/signup`.
- Independent builds pass for Home, Studio, API, and the unchanged v1 branch.

### 13.2 Production smoke tests

- `coveedu.com` renders Cove Home and links to Studio and MVP.
- `cs.coveedu.com` signs a user in and dispatches by v2 account state.
- A member opens an academy through its slug and navigates every permitted
  route family.
- `api.coveedu.com` serves health, application, and email-webhook endpoints over
  HTTPS.
- `mvp.coveedu.com` signs an existing v1 user in and preserves v1 workflows.
- Invitation and recovery emails contain `cs.coveedu.com` canonical links.
- Supabase and Resend callbacks complete on the new hosts.

## 14. Failure handling and rollback

- Unknown and unauthorized academy slugs use the same not-found response.
- A missing or ambiguous slug resolution never falls back to an arbitrary
  academy.
- A retired v2 URL not covered by the narrow compatibility policy returns not
  found rather than opening unrelated content.
- Deployment health checks run before DNS changes.
- If Home or Studio fails before meaningful v2 writes, DNS may be restored to
  the prior deployment.
- Cove MVP remains independently deployable from `main`; its code and database
  are not changed by this project.
- Any rollback after meaningful v2 writes requires the separate data
  reconciliation policy already identified by the v2 system design.

## 15. Acceptance criteria

The project is complete when:

1. Cove Studio exposes the approved canonical URLs with academy slugs.
2. No canonical v2 caller constructs retired route prefixes directly.
3. Cove Studio has one Supabase authentication implementation.
4. V1 route/session modules are absent from the v2 branch and intact on
   `main`.
5. All automated and four-deployment smoke tests pass.
6. Supabase, Resend, Home, Studio, API, and MVP configuration use the approved
   hosts.
7. Public DNS changes only after the production checklist is signed off.
