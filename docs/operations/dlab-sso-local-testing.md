# DLAB SSO local testing guide

This guide records the October 16 controlled student setup. For the October 21 student/staff expansion, use the [current SSO runbook](dlab-sso.md). Run `pnpm test:dlab` for the isolated automated suite; the new hosted migration and real HQ role tests are separate release steps. The historical readiness statements below do not certify the expanded implementation.

Test the DLAB student login flow from your local Cove website through the real DLAB OS and back into Cove.

Branch: `feat/dlab-os-sso`. Last updated: 2026-10-16.

**Current status:** The supplied Daechi test student is mapped to **Daechi SSO Demo Academy** in the development database. Real DLAB login, automatic Cove account creation, academy landing, refresh, logout, repeated login, and Mapo access denial have passed. Start with section 2, then section 4. Section 3 is already complete on this computer.

## 1. What is already prepared

The local API uses the development/test Supabase project confirmed by the user. These setup steps are already complete on this computer:

- API and Studio private `.env.local` files are configured, with SSO enabled.
- The supplied DLAB client credentials and independent incoming API key are stored privately on the API side.
- The supplied test student is on the login allowlist.
- The SSO database migration and Supabase credential guards are installed in the development project.
- Authenticated local Redis connections are configured on port 6380.

Do not replace the private env files with `.env.example`; examples disable SSO and do not contain your credentials. Never copy client secrets, API keys, login numbers, or session tokens into this guide or Git.

| Setting | Local value |
| --- | --- |
| Cove Studio | `http://localhost:3000` |
| Cove API | `http://localhost:4000` |
| Login start | `http://localhost:3000/sso/start` |
| Callback | `http://localhost:3000/sso/callback` |
| DLAB OS API base | `https://os.dlabcampus.com/v1` |
| DLAB client ID | `cove` |

The localhost callback worked in the real test. HQ cannot send incoming campus/user requests to your localhost API. Those requests require a public test API address or the local simulation below.

## 2. Start the servers

Run commands from the repository root. If the servers are already running, use those instances instead of starting duplicates.

Make sure Docker Desktop is running. Start the existing local Redis container if needed:

```bash
docker start cove-redis
```

Terminal 1:

```bash
pnpm dev:api
```

Wait for `Found 0 errors` and `Nest application successfully started`.

Terminal 2:

```bash
pnpm dev:web
```

Studio must use port **3000**, because the callback is configured for that port. If Next offers port 3001, check whether an existing Cove server already owns port 3000.

Terminal 3, check API readiness:

```bash
curl -i http://localhost:4000/api/health/ready
```

Expected: `HTTP/1.1 200 OK`.

Open `http://localhost:3000/login`. The page should include **Log in with DLAB**. Restart the API after changing its private env file, and restart Studio after changing its private env file.

## 3. Prepare the campus mapping once

This section changes only the configured development database. It is not part of each login test.

**Already applied in development:** campus `a8637c48-c053-4d11-89ae-b2a0bc1edd99` maps to demo academy `b11a7322-b5d4-4134-a836-e4ad5490579a`, slug `daechi-sso-demo`. Do not rerun the mapping with another academy ID. The following steps document how to prepare a fresh test environment.

The verified DLAB test campus ID is:

```text
a8637c48-c053-4d11-89ae-b2a0bc1edd99
```

The isolated test destination now used is:

| Field | Demo academy |
| --- | --- |
| Name | Daechi SSO Demo Academy |
| Slug | `daechi-sso-demo` |
| Academy ID | `b11a7322-b5d4-4134-a836-e4ad5490579a` (development only) |

Do not connect Daechi to Mapo or Gangnam by guessing from a campus name. In another environment, create the isolated demo academy first and use its actual ID; the development ID does not identify a production academy.

### 3a. Register the test campus locally

With the API running, paste this entire block into a terminal at the repository root. It simulates HQ's authenticated campus PUT using the confirmed campus name and an active development fixture. It does not contact or modify DLAB OS, and it does not create an academy or grant membership.

```bash
(
  cd packages/api || exit 1
  node --input-type=module <<'JS'
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config({ path: ['.env.local', '.env'], quiet: true });
const key = process.env.DLAB_INBOUND_SERVER_KEY;
if (!key) throw new Error('Missing private incoming API key');

const response = await fetch(
  'http://localhost:4000/api/integrations/dlab/v1/campuses/a8637c48-c053-4d11-89ae-b2a0bc1edd99',
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Request-Id': randomUUID(),
    },
    body: JSON.stringify({ name: '대치캠퍼스', status: 'active' }),
  },
);
console.log('Campus registration HTTP status:', response.status);
if (!response.ok) process.exitCode = 1;
JS
)
```

Expected: HTTP status `200`. Repeating the same campus request is safe. This is a local test fixture; it does not prove HQ's network delivery works.

### 3b. Review and apply the mapping

Replace `<approved-academy-id>` and `<active-platform-admin-user-id>` before running. The operator ID is a Cove `users.id` for an active platform ADMIN, not the DLAB student's ID or a Supabase auth ID. In the current development fixture, `cove-admin` has user ID `30000000-0000-4000-8000-000000000001`; verify it remains active before use.

Dry run from the repository root:

```bash
(
  cd packages/api || exit 1
  pnpm exec tsx --env-file=.env --env-file=.env.local \
    src/integrations/dlab/scripts/map-campus.ts \
    a8637c48-c053-4d11-89ae-b2a0bc1edd99 \
    <approved-academy-id> \
    <active-platform-admin-user-id>
)
```

Expected: JSON with `mode: "dry-run"` and the intended academy slug. Both env files are loaded explicitly so this CLI uses the same local overrides as the API.

If the target is correct, run the same command with `--apply` at the end:

```bash
(
  cd packages/api || exit 1
  pnpm exec tsx --env-file=.env --env-file=.env.local \
    src/integrations/dlab/scripts/map-campus.ts \
    a8637c48-c053-4d11-89ae-b2a0bc1edd99 \
    <approved-academy-id> \
    <active-platform-admin-user-id> \
    --apply
)
```

Expected: `mode: "apply"`. The command records the operator and mapping time. It refuses an inactive campus/academy/operator, an academy already assigned to another campus, or reassignment of an existing mapping to a different academy.

## 4. Test the real student login

1. Open a separate browser profile or an incognito window to keep your teacher/admin session separate.
2. Visit `http://localhost:3000/login` and click **Log in with DLAB**. Alternatively, open `http://localhost:3000/sso/start` directly.
3. Confirm the browser goes to `dlab-os.onrender.com`.
4. Choose **대치캠퍼스**, enter the test student name exactly as HQ supplied it, and enter the six-digit login number from the private message. If DLAB already remembers the account, choose **Continue with** that student.
5. Complete login promptly. The Cove transaction expires after five minutes; the returned DLAB code is single-use and short-lived.
6. The browser should return through `/sso/callback` and then open `/academy/<chosen-academy-slug>` on localhost.

For the configured demo academy, the final URL is:

```text
http://localhost:3000/academy/daechi-sso-demo
```

A successful first login should create a Cove student account and membership automatically, without asking the student to choose a Cove password or submit an academy join request. An empty course list is expected unless you separately assign the student to a class with courses.

Start again from `/sso/start` after a failure. Do not refresh or reuse a callback URL containing a code. Avoid sharing screenshots or logs containing callback queries, login numbers, cookies, or tokens.

## 5. Confirm the login works beyond the redirect

| Test | Action | Expected result |
| --- | --- | --- |
| Student identity | Check the visible account and academy | Correct test student and chosen academy |
| Page reload | Refresh the academy page | Student stays signed in |
| Authenticated navigation | Open an available student page | Page loads without a login loop or authorization error |
| Repeated login | Sign out of Cove, start DLAB login again | Same Cove user and membership are reused |
| Logout | Sign out of Cove and revisit a protected student page | Protected content requires login |
| Academy isolation | Try a different academy's protected student page | No other academy's private student data is accessible |
| Managed fields | Open account/profile settings | DLAB-owned identity fields and local password/email changes are unavailable |

Cove logout and DLAB logout are separate. DLAB may remember the test account and offer it again; that alone does not mean Cove logout failed.

To verify provisioning in the development Supabase SQL editor, run this read-only query:

```sql
SELECT
  i.external_user_id,
  i.account_status,
  i.user_role,
  i.provisioning_status,
  i.user_id,
  c.status AS campus_status,
  a.slug AS academy_slug,
  COUNT(DISTINCT b.membership_id) AS bound_memberships
FROM dlab_identities i
LEFT JOIN dlab_campuses c ON c.external_campus_id = i.external_campus_id
LEFT JOIN academies a ON a.id = c.academy_id
LEFT JOIN dlab_membership_bindings b ON b.external_user_id = i.external_user_id
WHERE i.external_user_id = 'a4290597-2aaa-4b78-8562-d7f1c5737f76'
GROUP BY i.external_user_id, c.status, a.slug;
```

After successful login, expect one row with `account_status = active`, `user_role = student`, `provisioning_status = READY`, a non-null `user_id`, the chosen academy slug, and `bound_memberships = 1`. Repeat after another login: `user_id` and membership count should stay the same.

## 6. Check rejection and recovery

Missing incoming API key:

```bash
curl -i -X PUT \
  http://localhost:4000/api/integrations/dlab/v1/users/a4290597-2aaa-4b78-8562-d7f1c5737f76 \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Repeat with an incorrect key by adding `-H 'Authorization: Bearer deliberately-wrong'`. Both requests should return **401**, without changing the student. Authentication runs before payload validation.

Open `http://localhost:3000/sso/callback` directly without starting login. Expected: the clean `/sso/error` page and no newly created login session. A fresh `/sso/start` should allow another normal attempt.

For a coordinated deactivation test, have HQ send a newer authenticated user update with `account_status: inactive` to a reachable test API, or simulate the same update only in development. Keep the source identity fields unchanged and restore `active` with a newer update afterward. Confirm authenticated requests are blocked while inactive and that reactivation requires a fresh login; it must not revive an old session. If testing sockets, confirm they disconnect on deactivation. Do not change the real student's status in DLAB OS as part of a local test.

## 7. Troubleshoot failures

The browser deliberately shows a generic error. Look in the API terminal for `DlabExceptionFilter` and its safe `reason` field.

| Symptom or reason | What to check |
| --- | --- |
| `campus_mapping_required` | Register the campus and apply its verified academy mapping in section 3 |
| `test_identity_not_enabled` | Exact external user ID in the API allowlist; restart the API after changes |
| `invalid_or_expired_attempt` | Start again in the same browser; finish within five minutes; avoid simultaneous login tabs |
| `code_exchange_failed` | Exact registered callback, private client credentials, and a fresh code; never retry a consumed code |
| `os_unavailable` | DLAB availability and network access; start a new attempt after recovery |
| `account_not_eligible` | Test account must be an active student; staff login is outside this phase |
| `identity_changed_during_login` | An update arrived during login; start a fresh attempt |
| `reactivation_update_required` | A newer source update must reactivate the identity before login |
| `sso_unavailable` | Feature flag and monitoring Redis availability |
| No DLAB button | Studio's private `DLAB_SSO_ENABLED=true`, then restart Studio |
| Immediate error with no API diagnostic | API readiness, matching BFF secrets, and Studio's API URL; failure may occur before an API call |
| Redis `NOAUTH` | Preserve the existing Redis password in both configured Redis URLs |
| Port 3000 occupied | Use the existing correct Studio instance or stop that instance before restarting; do not silently test on 3001 |

Keep secrets on the API side. Do not add DLAB credentials to `NEXT_PUBLIC_*` variables to fix a browser error.

## 8. Record the result

Current evidence: real DLAB authentication, local callback, code exchange, automatic account and membership creation, academy landing, page refresh, logout, repeated login, Mapo access denial, development deactivation/reactivation, and missing/wrong Bearer rejection have passed. See the readiness report for precise limits, including the distinction between page refresh and natural access-token refresh.

For further testing, record each test in section 5 as pass/fail, the date, and any safe failure reason in [the readiness report](../research/2026-10-16-dlab-sso-local-readiness.md). Record refresh, logout, isolation, and deactivation separately; a successful redirect alone does not prove them.

This phase covers student SSO plus campus/user updates. Staff permissions, enrollment import, and course synchronization are separate work. Production also needs the cookie-policy decision described in [the SSO operations runbook](dlab-sso.md).
