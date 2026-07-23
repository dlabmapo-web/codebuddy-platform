# Authentication and Academy Onboarding E2E Review

Date: 2026-07-23  
Environment: local Next.js (`localhost:3000`), local NestJS (`localhost:4000`), configured Supabase development project, configured PostgreSQL development database  
Branch: `feat/cove-studio-v2`  
Base commit: `5b64a0f` with uncommitted implementation changes  
Initial verdict: **Conditional pass**  
Remediation verdict: **Pass**

The core authentication and academy-approval workflow works end to end for email/password and Naver OAuth. Google OAuth also completes correctly for an existing academy member. Authorization is enforced by the API for pending, suspended, and non-manager users.

All six actionable findings were fixed and retested on 2026-07-23. The original findings remain below as the audit trail.

## Remediation verification

| Finding | Status | Verification |
| --- | --- | --- |
| AUTH-E2E-001: previous-account cache state | Resolved | Rejected user signed out, manager signed in, and the first destination was the manager academy with no previous-user state. |
| AUTH-E2E-002: missing active-user sign-out | Resolved | Sign-out passed from pending, approved, welcome, and studio surfaces. A subsequent protected-page request redirected to `/auth/login`. |
| AUTH-E2E-003: suspended user shown as pending | Resolved | Suspended login showed `Academy access suspended`, `Suspended`, no cancel/reapply actions, and retained manual status check and sign-out. |
| AUTH-E2E-004: cancelled/rejected copy | Resolved | Rejected and cancelled states displayed correct descriptions, labels, colors, and actions. |
| AUTH-E2E-005: manager links visible to other roles | Resolved | Student academy and direct manager pages contained no manager navigation; direct access remained API-denied. |
| AUTH-E2E-006: welcome redirect flicker | Resolved | Account destination is resolved on the server. Active users went directly to the academy, application users directly to pending, and the no-academy admin remained on welcome. |

Remediation checks:

- Web unit tests: 8 passed
- Shared tests: 9 passed
- API tests: 28 passed
- Full workspace typecheck: passed
- Focused changed-file ESLint: passed
- Browser console warnings/errors during the regression run: none
- E2E test member restored to `ACTIVE / STUDENT`
- E2E cancellation account left with latest request `CANCELLED`

## Implemented remediation

The approved server-first repair was implemented in these areas:

- `packages/web/src/lib/academy-access-state.ts`
  - Centralizes active, suspended, application, and welcome state resolution.
  - Provides one destination rule for email/password and OAuth authentication.
  - Restricts academy-management navigation to the `MANAGER` role.
- `packages/web/src/app/(v2-auth)/auth/welcome/page.tsx`
  - Resolves the account on the server and redirects before rendering an incorrect state.
  - Shows the welcome page only when the account has no membership or application.
- `packages/web/src/app/(v2-auth)/auth/callback/route.ts`
  - Uses the shared destination resolver after OAuth completion.
- `packages/web/src/app/(v2-auth)/auth/pending/page.tsx`
  - Loads the authenticated account on the server and passes identity-specific initial data.
- `packages/web/src/app/(v2-auth)/auth/pending/_components/pending-approval.tsx`
  - Uses an identity-scoped query key.
  - Renders dedicated active, suspended, pending, approved, rejected, cancelled, and no-relationship states.
  - Preserves manual status checks without adding polling.
- `packages/web/src/app/(v2-auth)/auth/_components/sign-out-control.tsx`
  - Provides one reusable Supabase sign-out control for authenticated surfaces.
- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/_components/studio-shell.tsx`
  - Shows manager navigation only to active academy managers.
  - Exposes sign-out to every active role.
  - Redirects unauthenticated protected-page requests to `/auth/login`.
- `packages/web/src/app/(v2-studio)/studio/academies/[academyId]/_components/academy-overview.tsx`
  - Resolves academy access server-side instead of using identity-unsafe client cache data.
- `packages/web/src/lib/academy-access-state.spec.ts`
  - Covers destination precedence, suspended routing, application-state behavior, welcome routing, and manager navigation permissions.

The obsolete client-side welcome bootstrap component was removed because account routing is now resolved before rendering.

## Verification caveats

- Repository-wide web lint still fails on pre-existing legacy application files and bundled Pyodide JavaScript. Focused lint for every changed authentication file passes.
- A new Google identity was not available; Google OAuth was verified using an existing active member.
- Kakao remains intentionally unconfigured.
- The report and remediation spec are under ignored `docs` paths and will not enter a normal Git commit unless the ignore policy is changed or the files are force-added.

## Scope and method

Testing used the running application through a real browser session. State changes were verified in the UI and then cross-checked with read-only PostgreSQL queries. Browser console warnings and errors were checked after the scenarios.

The test covered:

- Email/password signup with academy selection
- Pending approval experience
- Manager application listing
- Approval with a selected academy role
- Email/password login after approval
- Social signup academy validation
- Google OAuth callback for an existing member
- Naver OAuth signup, pending request, approval, and subsequent login
- Invalid credential handling
- Role changes
- Membership suspension and restoration
- Last-active-manager protection
- Application cancellation, reapplication, and rejection
- Authorization boundaries for pending, suspended, teacher, and student accounts

## Test results

| Scenario | Result | Evidence |
| --- | --- | --- |
| Email signup requires an academy | Pass | The account form remained disabled until academy, name, email, and valid password were supplied. |
| Email signup creates a pending request | Pass | Signup redirected to `/auth/pending`; the selected academy and `Pending` state appeared. |
| Pending user cannot enter academy features | Pass | Direct academy access displayed `You do not have active access to this academy.` |
| Pending user cannot list applications | Pass | Direct manager-page access displayed `You cannot view this academy's applications.` |
| Manager can see new email application | Pass | The new applicant appeared on the manager applications page. |
| Manager can select approval role | Pass | The email user was approved as `TEACHER`; the resulting membership used that role. |
| Approved email user can log in | Pass | Login showed the correct email and `TEACHER` membership, then allowed academy entry. |
| Non-manager cannot manage applications | Pass | The approved teacher received the authorization-denied state. |
| Manager can change a member role | Pass | The E2E member changed from `TEACHER` to `STUDENT`; database membership became `STUDENT`. |
| Manager can suspend a member | Pass | Membership changed to `SUSPENDED`; academy access was denied. |
| Manager can restore a member | Pass | Membership returned to `ACTIVE` with the `STUDENT` role. |
| Last manager cannot be demoted | Pass | The UI restored `MANAGER` and showed `The academy must retain one active manager.` |
| Last manager cannot be suspended | Pass | Manager stayed `ACTIVE`; the same protection message appeared. |
| Social signup requires academy selection | Pass | Google signup without an academy stayed on signup and showed `Choose an academy first.` |
| Google OAuth callback | Pass (existing user) | The OAuth intent was consumed and the existing Google user entered the academy as `TEACHER`. |
| Naver OAuth creates a pending request | Pass | Naver OAuth returned to `/auth/pending`; the request appeared in the manager queue. |
| Manager approves Naver user | Pass | The Naver user was approved with the default `STUDENT` role. |
| Approved Naver user can log in | Pass | Naver login returned directly to the academy with `STUDENT` access. |
| Invalid login is generic | Pass | The page stayed on `/auth/login` and showed `The email or password is incorrect.` |
| User can cancel an application | Pass with UI issue | Database state became `CANCELLED`, and the page offered `Apply again`. |
| User can reapply | Pass | A new pending request was created and appeared in the manager queue. |
| Rejection requires a reason | Pass | `Reject` stayed disabled until a note was entered. |
| Manager can reject an application | Pass with UI issue | Request became `REJECTED`; the user saw the manager's rejection reason. |
| Browser console | Pass | No warning or error entries were captured during the final diagnostic check. |

## Database evidence

At the end of the run:

- `e2e.student.1784787244065@cove.test`
  - Membership: `ACTIVE / STUDENT`
  - Original approved role: `TEACHER`
  - Role was deliberately changed to `STUDENT` during the role-management test.
- `jurabek0304@naver.com`
  - Membership: `ACTIVE / STUDENT`
  - Join request: `APPROVED / STUDENT`
- `samiev.jurabek@bk.ru`
  - Existing membership remained `ACTIVE / TEACHER`
- `e2e.cancel.1784787244065@cove.test`
  - One `CANCELLED` request
  - One `REJECTED` request with reason `E2E rejection reason`
  - No academy membership
- Recent one-time OAuth intents:
  - `custom:naver`: consumed
  - `google`: consumed
- Pending applications remaining in the academy: `0`

These records were intentionally left in the development environment as E2E evidence. They should be removed by a future repeatable E2E cleanup routine rather than by an ad hoc production-style delete.

## Findings

### AUTH-E2E-001 — Resolved: account switches could render the previous user's cached academy state

After signing out the new student and signing in as `manager@cove.test`, the first redirect returned to the previous student's pending page. Navigating to `/auth/welcome` then showed the correct manager identity and membership.

The likely cause is that both authentication components use the shared TanStack Query key `['auth', 'me']`, while the pending query has `staleTime: Infinity`. The cache is not cleared or scoped when the Supabase identity changes. The two components also use different operations (`auth.me` and `auth.bootstrap`) behind the same cache key.

Impact:

- Incorrect redirect immediately after an account switch
- Previous-account academy/application state can be rendered in a shared browser
- Manager login can appear to fail even though the Supabase session changed correctly

Recommended fix:

- Clear the entire authentication query cache on login and logout.
- Use distinct query keys for `auth.me` and `auth.bootstrap`, or make the key identity-scoped.
- Prefer a hard navigation after changing identity if the query client persists across server-action redirects.
- Add an automated two-account switching regression test.

Relevant code:

- `packages/web/src/app/(v2-auth)/auth/pending/_components/pending-approval.tsx`
- `packages/web/src/app/(v2-auth)/auth/welcome/_components/account-bootstrap.tsx`
- `packages/web/src/app/(v2-auth)/auth/actions.ts`

### AUTH-E2E-002 — Resolved: active users had no visible sign-out control

The pending application branch has a `Sign out` form, but the active-membership branch returns before rendering it. The welcome and studio pages also expose no sign-out control.

Impact:

- Approved users and managers cannot safely end their session through the UI.
- Shared-device users must replace the session by signing in as another user.
- The missing sign-out path contributes to the account-switch behavior above.

Recommended fix:

- Add a persistent account menu with `Sign out` to the studio layout.
- Keep `Sign out` available in every pending-page branch, including approved and suspended states.
- Add a logout E2E assertion that protected pages redirect to login afterward.

### AUTH-E2E-003 — Resolved: suspended membership was presented as a pending application

Security enforcement worked: the suspended user could not enter the academy. However, login redirected to `/auth/pending` and displayed `Waiting for academy approval`, even though the application was already approved and the membership was suspended.

The pending component only checks for an `ACTIVE` membership, then falls back to the most recent application. It has no explicit suspended-membership state.

Recommended fix:

- Detect `SUSPENDED` memberships before processing join requests.
- Show a dedicated `Academy access suspended` state with support/contact guidance.
- Do not offer cancellation or reapplication for an already-approved membership.

### AUTH-E2E-004 — Resolved: cancelled and rejected application copy was internally inconsistent

Observed issues:

- A cancelled application displayed the heading `Application cancelled` but the status card still said `Pending`.
- A rejected application displayed `Application not approved` and the rejection reason, but the description still said the academy `is reviewing your application`.

Recommended fix:

- Render the status value from `application.status` rather than hardcoding `Pending`.
- Give `PENDING`, `CANCELLED`, and `REJECTED` separate descriptions and visual treatments.

### AUTH-E2E-005 — Resolved: unauthorized roles could see manager navigation

Pending users, teachers, and students could see `Applications`, `Members`, and `Invitations` links. The API correctly denied access, so this was not a data exposure in the test.

Recommended fix:

- Hide management navigation unless the active membership role can use it.
- Continue retaining the API checks as the authoritative security boundary.

### AUTH-E2E-006 — Resolved: welcome page could show “no academy” before pending redirect

For an account with a valid pending request, `/auth/welcome` rendered the no-membership message before its client effect redirected to `/auth/pending`.

Recommended fix:

- Resolve the destination on the server or render a neutral loading state while checking memberships and applications.
- Avoid showing the no-academy message when applications exist.

## Coverage gaps

The following were not fully validated in this run:

- A completely new Google identity: Google OAuth was tested with an existing active member.
- Kakao OAuth: the provider is intentionally not configured yet.
- OAuth expiration and replay through the browser: these are covered by service tests, not this E2E run.
- Invitation acceptance workflow.
- Production HTTPS, secure-cookie behavior, reverse proxies, multiple API instances, and production rate-limiter infrastructure.
- Concurrent approval, role-change, or suspension requests.

## Release decision

The reviewed authentication and academy-onboarding workflow passes the implemented development E2E scope. The six findings in this report are resolved.

Production rollout still requires the environment-level items listed under coverage gaps, especially production HTTPS/cookie verification, distributed deployment behavior, provider-specific production credentials, and concurrency/load testing.
