# DLAB SSO demo and production connection

Historical controlled student demo. The [current SSO runbook](dlab-sso.md) describes the new domain, staff roles, campus rollout and migration. Do not treat the original demo credentials or mapping as proof that newer HQ fixtures share that campus.

The controlled Daechi test student can now use the DLAB account to sign in to local Cove. Cove creates its own linked account automatically; the student does not register or choose a second password. Existing Mapo accounts continue through the normal login options.

## Current working demo

| Item | Configured development value |
| --- | --- |
| Start login | `http://localhost:3000/sso/start` |
| DLAB campus | Daechi, `a8637c48-c053-4d11-89ae-b2a0bc1edd99` |
| DLAB test student ID | `a4290597-2aaa-4b78-8562-d7f1c5737f76` |
| Cove academy | Daechi SSO Demo Academy |
| Cove academy slug | `daechi-sso-demo` |
| Cove academy ID | `b11a7322-b5d4-4134-a836-e4ad5490579a` |
| Student landing | `http://localhost:3000/academy/daechi-sso-demo` |

These academy settings belong to the development database. Production has a separate database and needs a separately created academy with its own ID.

To show the team:

1. Start the servers as described in the [local testing guide](dlab-sso-local-testing.md).
2. Open the local SSO start URL.
3. Sign in with the HQ test student's campus, name, and privately supplied login number, or select that student if DLAB remembers them.
4. Show the student dashboard and the demo academy name.
5. Refresh the page, sign out, and sign in again. The student remains the same Cove account.

The academy currently has no classes or courses assigned. The empty learning catalog is expected. Avoid showing the private login number, callback queries, cookies, or token values on a shared screen.

## How the accounts connect

```text
DLAB campus external_campus_id
    -> Cove DlabCampus mapping
    -> one Cove academy

DLAB student external_user_id
    -> Cove DlabIdentity binding
    -> one Cove user and that academy's student membership
```

Cove matches people by the external ID, never by their name, email, or login number. On the first successful login, Cove provisions the linked user and membership. Later logins reuse them. DLAB owns the source name, grade, role, campus scope, and account status; Cove owns learning records and local preferences.

The campus mapping is prepared once per campus in each environment. It is not something a student chooses on the DLAB login page. Each additional campus needs its own verified mapping. During the controlled rollout, each additional student also needs their external ID added to the API allowlist. The current implementation does not allow every DLAB student automatically.

Do not attach Daechi to the existing Mapo academy. Do not convert or merge existing Mapo accounts by matching their names. Existing-account linking needs a separately reviewed identity migration.

## Production preparation

Production was inspected read-only. DLAB flags and credentials were not configured in the API/Studio env files. No production configuration or database was changed.

The safe release sequence is:

1. The feature branch includes the current v2 changes through `c1aea604`. Pass CI/build checks and review the change before merging it into the v2 release branch. The release workflow accepts a tagged commit only when it is contained in `origin/feat/cove-studio-v2`.
2. Resolve the session-cookie requirement with HQ. Cove currently uses its existing Supabase browser session model; only the SSO transaction cookie is HttpOnly. See the [operations runbook](dlab-sso.md).
3. Release the additive schema and application through the existing protected production workflow with DLAB SSO disabled. Install and verify the separate Supabase provider guard in the production project.
4. Verify ordinary Mapo login and representative student/teacher access while SSO remains disabled.
5. Configure production DLAB credentials privately on the API, retain the existing BFF/Redis settings, and set the callback to `https://cs.coveedu.com/sso/callback`.
6. Create **Daechi SSO Demo Academy** in production through platform administration. Record its actual production academy ID and the authorized production platform operator ID. The mapping CLI may be run in an operator checkout with production env selected explicitly; it needs the migration and dependencies installed.
7. Configure only the verified test student in the allowlist, validate with preflight, and enable SSO on API and Studio together. Receive the authenticated campus PUT, dry-run its mapping to the new demo academy, and apply it using the production operator. Until mapping is complete, login remains refused.
8. Repeat the controlled browser checks against the public domains, including existing Mapo login, isolation, logout, and deactivation. Record actual production results before announcing readiness.

The existing runbooks contain [release commands](production-deployment.md) and [DLAB configuration and rollback requirements](dlab-sso.md). Do not tag the unmerged feature branch or copy development database URLs into production.

## What HQ connects

| Purpose | Production address |
| --- | --- |
| Cove website | `https://cs.coveedu.com` |
| Cove card and DLAB login button destination | `https://cs.coveedu.com/sso/start` via GET |
| Registered callback | `https://cs.coveedu.com/sso/callback` |
| Integration API base | `https://api.coveedu.com/v1` |

The API base here supports the implemented campus/user routes. It is not a claim that course/enrollment endpoints are ready.

Signing in to the DLAB homepage alone does not open Cove. The DLAB hub needs a Cove card linking to the login-start address. When the student clicks it, DLAB can reuse its existing login and return the student to Cove through the registered callback.

Copyable coordination note for HQ; this has not been sent:

```text
안녕하세요. 대치 테스트 학생으로 Cove 로컬 SSO 로그인 및 자동 계정 생성까지 확인했습니다.
기존 마포 계정과 분리된 데모 학원으로 연결했으며, 운영 배포를 준비하고 있습니다.

운영 연동을 위해 아래 내용 확인 부탁드립니다.
1. DLAB 허브 Cove 카드의 연결 주소: GET https://cs.coveedu.com/sso/start
2. 등록된 콜백 주소: https://cs.coveedu.com/sso/callback
3. 캠퍼스/학생 정보 수신 API 기본 주소: https://api.coveedu.com/v1
   현재 캠퍼스/사용자 연동 범위이며, 코스/수강 연동은 별도 진행입니다.
4. 세션 쿠키 정책 확인: Cove는 기존 Supabase 로그인 세션을 사용하고,
   SSO state 확인용 쿠키에는 HttpOnly를 적용했습니다.
   브라우저 세션 쿠키까지 HttpOnly가 필수인지 확인 부탁드립니다.

운영 준비가 끝나면 테스트 가능 시점을 다시 공유드리겠습니다. 감사합니다.
```

Do not report the public production flow as working until that environment has passed its own tests.
