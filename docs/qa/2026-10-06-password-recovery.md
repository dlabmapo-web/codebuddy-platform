# Staff password recovery

Branch: `fix/password-recovery-email`, based on `fix/restore-google-login`.

## Production investigation

Visited `https://cs.coveedu.com/forgot-password`. The public request page requires
a Cloudflare challenge. Native browser control was unavailable; Playwright was
used to inspect the live pages. The CAPTCHA-protected public form was not
automatically submitted.

Validated the five supplied accounts through Supabase using their supplied
passwords. All authenticated successfully. The manager, team lead, teacher, and
`john10` have active password identities, non-placeholder addresses, and matching
Cove/Supabase emails. The platform admin uses a `cove.test` address and needs a
real, owned address before email recovery can work for that account.

With the user's authorization, created a temporary production teacher and an
isolated temporary mailbox. The deployed password-recovery service successfully
delivered its message from `no-reply@mail.coveedu.com`. Its link used the configured
Cove confirmation interstitial with `token_hash` and `type=recovery`. A later
request through the deployed web server's trusted API client returned HTTP 200
and delivered a second message to the mailbox. An earlier rapid repeat was
accepted by Cove but logged a provider failure; it was within a minute of the
first message. Existing users' inboxes were unavailable, so their individual
delivery was not verified.

## Defect and fix

Confirmation issued `cove_password_recovery` with `Path=/auth` and redirected to
`/reset-password`. Browser path filtering excluded the capability from both the
reset page and its Server Action. The page rejected a valid recovery session
instead of displaying the password form. Unit tests used a name-only cookie map
and did not simulate path filtering.

Scope this cookie to `/reset-password`. Keep HttpOnly, SameSite=Lax, production
Secure, the fifteen-minute TTL, subject binding, and the existing Supabase session
requirement. Deletion already uses the same shared cookie options. A browser
regression checks delivery to the reset URL and absence on studio/login routes.

This change repairs the reset step; controlled testing confirmed SMTP delivery
already works. No SMTP settings or existing users' passwords were changed.

## Rollout

Deploy a rebuilt web image containing the fix. Users should request a fresh
recovery link after deployment; sessions issued by the previous version retain
the old cookie scope.

## Verification results

- The live confirmation flow issued a `/auth` cookie; the browser excluded it
  from `/reset-password`, and the password inputs were absent.
- Changing only that valid cookie's scope in the controlled test browser to
  `/reset-password` made the live form appear and allowed the temporary teacher
  to save a new password. The new password authenticated successfully; the old
  password was rejected with `invalid_credentials`. This was a browser-only
  diagnostic correction, not a production deployment.
- 41 recovery unit tests and one Playwright browser cookie regression passed.
  Web/e2e type checks, targeted lint, `git diff --check`, and the optimized
  Next.js production build passed.
- Temporary production teacher, membership, Supabase identity, and mailbox were
  removed after verification. Existing users' passwords were unchanged.

The web code fix is local and still needs deployment.

## Follow-up browser checks for every staff role

At the user's request, created separate temporary ADMIN, MANAGER, TEAM_LEAD,
and TEACHER accounts, each with a separate controlled mailbox. Tested the fixed
optimized production build in Chromium at `http://localhost:3000`, connected to
the actual production Supabase project and Cove API. The deployed site was not
changed. Repository environment files were not modified.

The local browser test omitted the Cloudflare widget. No production CAPTCHA
setting was changed. Received email links retained their real production token
hash; only the link origin was changed to the local fixed build. Unlike the
initial diagnostic, these checks made no browser cookie edits: the fixed Server
Action itself issued the correct Secure, HttpOnly cookie.

| Role | Browser request and real email | Browser confirmation and password save | Used link rejected | New password accepted / old rejected | Same identity and roles |
| --- | --- | --- | --- | --- | --- |
| Platform admin | Passed | Passed | Passed | Passed | Passed |
| Manager | Passed | Passed | Passed | Passed | Passed |
| Team lead | Passed | Passed | Passed | Passed | Passed |
| Teacher | Passed | Passed | Passed | Passed | Passed |

Each browser check also verified that a GET preview did not issue a capability,
the password form opened without cookie intervention, successful reset redirected
to `/login?reset=success`, and the capability was cleared afterward. Password
authentication and identity/role preservation were verified through server-side
Supabase and Prisma checks.

The browser login screen was also attempted with the new password for every
role. Supabase required a CAPTCHA token, which the local test intentionally did
not supply. All four were rejected with the security-verification message.
These results verify password recovery and actual new credentials, but do not
claim completion of CAPTCHA-protected browser login or live-site acceptance
after deployment. The existing `cove-admin` test-domain address still requires
replacement with a real account-owned address for email recovery.

All four temporary profiles, academy memberships, Supabase identities, and
mailboxes were removed. Existing users' passwords were unchanged. The normal
local build configuration was restored after the production-connected tests.

## Existing production staff account audit

Read-only audit of platform admins and users with active manager, team lead,
or teacher memberships found 21 accounts after temporary-account cleanup:

- 9 password accounts have a recovery username, matching Cove/Supabase email,
  and a non-placeholder, non-test-domain address. This checks configuration,
  not receipt in each existing user's inbox.
- 3 accounts have social-only identities and use their social provider for
  sign-in; the existing recovery policy intentionally excludes them.
- 9 password accounts have no deliverable recovery address: `aaaaa`, `brooks`,
  `cove-teacher2`, `mapo-teamlead`, `cove-teacher`, `cove-manager`, `cove-admin`,
  `cove-teamlead`, and `mapo-teacher`. These require real account-owned addresses
  before email recovery is possible. They were not silently reassigned to
  another person's email.

All four representative role browser resets passed, but recovery cannot be
claimed to work for every existing staff account while these data issues remain.
