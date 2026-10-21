# Cove v2 — DLAB OS SSO registration and handoff

Prepared: 2026-10-15 (Asia/Tashkent)
Reviewed branch: `feat/cove-studio-v2`
Specification: DLAB integration v1.2.1, supplied in `TalkFile_dlab-integration-spec-v1.2.1-20261014.zip`

## Purpose and current status

This document explains head office's request, records Cove's registration details, and provides Korean and English messages to send Finn Jeong privately.

This is a repository review and registration proposal. It does not certify that SSO is implemented, deployed, or tested. No message has been sent to Finn. No new API key has been generated or configured as part of this handoff.

The supplied specification is reference material for the integration. Its requests to send messages or change code are not actions performed by this document.

## 1. What head office wants, in simple English

Students should be able to log into Cove using their DLAB account. The DLAB hub must also be able to send students directly into the login process through a normal link.

Send Finn four items privately:

1. Cove's permanent production address.
2. The callback URL where DLAB sends the student after authentication.
3. A GET URL that starts DLAB login.
4. A dedicated secret that DLAB uses when calling Cove's integration APIs.

Finn will then provide the SSO client ID and client secret privately. After sending the DM, leave a short confirmation in the original thread.

## 2. Registration details

| Item | Cove value | Status |
| --- | --- | --- |
| Student-facing production URL | `https://cs.coveedu.com` | Configured in repository deployment settings; live availability was not checked in this review. |
| API host | `https://api.coveedu.com` | Configured in repository deployment settings. |
| Callback (`redirect_uri`) | `https://cs.coveedu.com/sso/callback` | Proposed registration value; route implementation pending. |
| Login start URL | `https://cs.coveedu.com/sso/start` | Proposed registration value; GET route implementation pending. |
| Incoming API key | `DLAB_INBOUND_SERVER_KEY` | Dedicated key and request validation still required. No DLAB key found in checked local configuration. |
| Integration API base | `https://api.coveedu.com/v1` | Proposed; current API uses `/api`, so `/v1` needs explicit implementation/routing. |

The specification permits registering a planned callback before it exists. Registering these addresses does not mean they are ready for students.

### Repository evidence

- `CONTEXT.md`: Cove Studio v2 uses `cs.coveedu.com` and Supabase authentication.
- `deploy/caddy/Caddyfile`: routes `cs.coveedu.com` to Studio and `api.coveedu.com` to the API.
- `deploy/secrets/studio.env.example`: configured production site and API URLs.
- `packages/web/src/app/(auth)/auth/callback/route.ts`: existing callback exchanges a Supabase code; it is not a DLAB callback.
- `packages/api/src/main.ts`: current NestJS global prefix is `/api`.
- `packages/api/src/config/env.schema.ts`: no DLAB SSO configuration found.
- `packages/api/prisma/schema.prisma`: existing users, academy roles, library master courses, and academy course copies require integration mapping.

The local branch differed from its saved remote reference by one local-only commit and seven remote-only commits at review time. No merge, reset, or remote synchronization was performed. Recheck status before implementation.

## 3. The two separate secrets

| Secret | Created by | Used for |
| --- | --- | --- |
| `DLAB_INBOUND_SERVER_KEY` | Cove | DLAB OS authenticates requests to Cove's integration APIs using Bearer authentication. |
| `DLAB_CLIENT_SECRET` | DLAB OS | Cove's server authenticates the `/sso/token` request using Basic authentication with `client_id=cove`. |

These secrets belong only in server configuration. Do not put their values in this document, Git, browser code, or the shared thread. Do not reuse Supabase credentials or Cove's existing `BFF_SHARED_SECRET` as the integration key.

Head office suggests generating the incoming key with `openssl rand -hex 32`. Generation must be followed by secure storage and actual request validation. Missing or incorrect Bearer credentials must produce `401`.

### Expected configuration names

```dotenv
DLAB_OS_BASE_URL=https://dlab-os.onrender.com/v1
DLAB_CLIENT_ID=cove
DLAB_CLIENT_SECRET=<issued privately by DLAB OS>
DLAB_REDIRECT_URI=https://cs.coveedu.com/sso/callback
DLAB_INBOUND_SERVER_KEY=<generated and configured by Cove>
```

This block describes planned server configuration, not variables already supported by Cove. The specification says test and production use the same DLAB OS base URL and SSO credentials. Additional callback URLs must be registered before use.

## 4. Required login flow

1. The student opens `GET https://cs.coveedu.com/sso/start` from Cove or the DLAB hub.
2. Cove generates a random `state`, stores it securely, and redirects to `https://dlab-os.onrender.com/v1/sso/authorize` with `client_id`, `redirect_uri`, `state`, and `response_type=code`.
3. DLAB authenticates the student and redirects to Cove's callback with `code` and `state`.
4. Cove validates the stored state and consumes it once. Any saved return destination must be restricted to a safe Cove path.
5. Cove's server calls `POST https://dlab-os.onrender.com/v1/sso/token` using Basic authentication, JSON containing `grant_type=authorization_code`, `code`, and the same `redirect_uri`, and an `X-Request-Id` header.
6. The code expires after 60 seconds and is single-use. A failed exchange requires restarting login rather than retrying the code.
7. The response directly contains user information, not an access token. Cove blocks accounts whose `account_status` is not `active`, creates or updates the linked account by `external_user_id`, and establishes a session compatible with its existing authentication.
8. Cove redirects the student to an authorized destination.

Preserve existing login for external users. Add a “Log in with DLAB” button. DLAB-only accounts must not gain a separate Cove password or password recovery path. OS-owned identity and permission fields must be protected against local editing.

## 5. Required integration APIs

These are contract requirements, not existing working endpoints. With the proposed `/v1` base, the intended URLs are:

| Method | Proposed path | Purpose |
| --- | --- | --- |
| PUT | `/v1/campuses/{external_campus_id}` | Create/update campus data. |
| PUT | `/v1/users/{external_user_id}` | Create/update student and staff data. |
| PUT | `/v1/enrollments/{external_enrollment_id}` | Create/update an individual student's enrollment. |
| GET | `/v1/courses` | Let DLAB OS retrieve courses for template mapping. |

All four need incoming Bearer authentication. Follow the supplied schema, `X-Request-Id`, error format, and course pagination requirements (`updated_since`, `cursor`, `limit`).

- Repeated PUT requests must not create duplicates; match external IDs.
- An enrollment can arrive before the student account and must be retained for later linking.
- Inactive users and withdrawn enrollments retain historical records.
- When provided, `course_id` takes precedence over a template lookup. An unknown ID returns `400 invalid_field`.
- Grades, progress, feedback, works, and AI usage reporting are outside this specification's current implementation scope.

### Changes highlighted in v1.2.1

- Enrollment requests can include Cove's `course_id`.
- The actual DLAB OS base is `https://dlab-os.onrender.com/v1`.
- `/sso/token` returns user information directly.

## 6. Decisions to settle before rollout

| Topic | Why it matters | Next step |
| --- | --- | --- |
| Library versus academy course IDs | A master and its academy copies have different IDs. | Agree what `GET /courses` exposes and how an enrollment reaches the correct academy course. |
| Campus mapping | DLAB campus IDs differ from Cove academy IDs. | Define a stable mapping and preserve campus access boundaries. |
| Role mapping | DLAB has seven roles; Cove has four academy roles plus platform roles. | Agree explicit permissions; unknown roles must not gain elevated access. |
| Existing students | The attached contract assumes no existing Cove students; the code supports existing accounts. | Check real migration/linking needs. Use verified external IDs; do not automatically merge by name. |
| Session issuance | The DLAB response is user data rather than a Supabase session. | Design and validate a compatible session bridge. |
| API routing | Current `/api` routing differs from the proposed `/v1` contract base. | Implement and verify the public integration routes. |

## 7. Korean DM draft — ready to send with current status

안녕하세요 Finn님. 최신 연동 스펙 v1.2.1과 SSO 참고 구현을 확인했습니다. 이전 v1.1 대신 v1.2.1 기준으로 진행하겠습니다.

Cove v2 코드베이스와 운영 배포 설정 기준으로 아래 정보를 전달드립니다.

**1. 운영 서버 주소**

- 학생용 Cove Studio: https://cs.coveedu.com
- Cove API 서버: https://api.coveedu.com

**2. 로그인 콜백 주소 (`redirect_uri`)**

https://cs.coveedu.com/sso/callback

위 주소로 사전 등록 부탁드립니다. 현재 구현 전이며, 해당 경로로 구성할 예정입니다. 기존 `/auth/callback`은 Supabase 로그인용이므로 DLAB SSO는 별도 경로로 구현하겠습니다.

**3. 로그인 시작 주소**

https://cs.coveedu.com/sso/start

구현 예정 주소입니다. [디랩 계정으로 로그인] 버튼과 OS 허브의 Cove 카드가 같은 주소를 사용하고, 링크로 바로 열 수 있도록 GET 방식으로 구현하겠습니다.

**4. 서버 전용 키**

별도 랜덤 키를 생성하여 서버 환경변수 `DLAB_INBOUND_SERVER_KEY`로 관리하고, 설정 완료 후 개인 DM으로 전달드리겠습니다. 들어오는 `Authorization: Bearer` 값을 검증하여 누락되거나 일치하지 않으면 `401`을 반환하도록 구현하겠습니다. OS에서 발급해 주시는 SSO client secret과는 별도로 관리하겠습니다.

**확인한 구현 요구사항**

- OS 주소는 `https://dlab-os.onrender.com/v1`을 사용하겠습니다.
- `/sso/token`은 Cove 서버에서만 호출하며, client ID와 secret을 Basic 인증 헤더로 전달하겠습니다.
- 콜백 `state` 검증과 일회성 처리를 적용하고, 반환된 사용자 정보로 Cove 계정과 로그인 세션을 구성하겠습니다.
- `account_status`가 `active`가 아니면 로그인을 차단하겠습니다.
- 기존 외부 사용자 로그인은 유지하고 DLAB 로그인 버튼을 추가하겠습니다.
- 수강 요청에 `course_id`가 있으면 해당 ID를 우선 사용하고, 존재하지 않는 코스 ID는 `400 invalid_field`로 응답하겠습니다.

**추가 협의 사항**

1. 연동 API 기본 주소는 `https://api.coveedu.com/v1`을 제안드립니다. 현재 `/api`와 별도로 구현이 필요합니다.
2. 라이브러리 원본 코스와 학원별 복사 코스의 ID가 다르므로, OS 템플릿 연결 단위와 `GET /courses` 제공 범위를 함께 확정하고 싶습니다.
3. 기존 DLAB 학생의 Cove 계정이 있다면 중복 생성을 피할 수 있도록 연계 대상을 확인해야 합니다.
4. OS 직원 역할과 Cove 권한, 여러 캠퍼스 접근 범위의 대응 기준을 확인하고 싶습니다.

우선 위 콜백 주소로 등록 부탁드립니다. 등록 후 `client_id=cove`와 client secret을 개인 DM으로 전달해 주시면 서버 설정에 반영하겠습니다. 테스트·운영에서 같은 SSO 인증 정보를 사용하는 점도 확인했습니다.

현재는 등록 및 구현 준비 단계입니다. 서버 전용 키 설정과 엔드포인트 구현·검증이 완료되면 테스트 가능한 시점을 별도로 안내드리겠습니다. 감사합니다.

## 8. English DM draft

Hi Finn,

Thank you for sharing the updated integration specification and SSO examples. We have reviewed v1.2.1 and will use it instead of v1.1.

Based on Cove v2's codebase and production configuration, here are our registration details.

**1. Production addresses**

- Student-facing Cove Studio: https://cs.coveedu.com
- Cove API server: https://api.coveedu.com

**2. Callback URL (`redirect_uri`)**

https://cs.coveedu.com/sso/callback

Please register this planned address in advance. Implementation is pending. Our existing `/auth/callback` handles Supabase login, so DLAB SSO will use a separate callback.

**3. Login start URL**

https://cs.coveedu.com/sso/start

This is our planned endpoint. Both Cove's “Log in with DLAB” button and the DLAB OS hub card will use it. It will support GET so opening a link can start login directly.

**4. Server-only API key**

We will generate a dedicated random key, store it as the server environment variable `DLAB_INBOUND_SERVER_KEY`, and share it privately once configured. Cove will validate the incoming Bearer key and return `401` when it is missing or incorrect. This key will be separate from the SSO client secret issued by DLAB OS.

**Requirements we have noted**

- Use `https://dlab-os.onrender.com/v1` as the OS base URL.
- Call `/sso/token` only from Cove's server using Basic authentication with the client ID and secret.
- Validate and consume the callback state, then use the returned user information to establish the Cove account and login session.
- Block login unless `account_status` is `active`.
- Preserve existing login for external users and add a DLAB login button.
- Prefer `course_id` when supplied in an enrollment and return `400 invalid_field` for an unknown course ID.

**Points to coordinate**

1. We propose `https://api.coveedu.com/v1` as the integration API base. It still needs implementation alongside our current `/api` routes.
2. Library master courses and academy copies have different IDs. We need to agree on template mapping and which courses `GET /courses` should expose.
3. We need to identify any existing DLAB students with Cove accounts to avoid duplicates.
4. We need to confirm staff role permissions and access across multiple campuses.

Please register the proposed callback and send `client_id=cove` and the client secret privately when available. We understand that test and production use the same SSO credentials.

We are currently at the registration and implementation preparation stage. We will follow up with the incoming API key and confirm when the endpoints are ready for testing.

Thank you.

## 9. Thread confirmation — only after sending the DM

Korean:

> Finn님께 Cove 운영 주소와 SSO 등록 예정 주소를 DM으로 전달드렸습니다. 서버 전용 키는 설정 완료 후 별도 전달드리고, 구현 및 테스트 준비 상황도 이어서 공유드리겠습니다.

English:

> I have sent Finn Cove's production addresses and proposed SSO URLs by DM. I will share the server API key privately once configured and follow up when the integration is ready for testing.

## 10. Completion checklist

- [ ] Send the registration DM and obtain callback registration confirmation.
- [ ] Receive and securely store DLAB's client credentials.
- [ ] Generate, securely configure, and privately share the incoming API key.
- [ ] Settle course, campus, existing-account, and role mappings.
- [ ] Implement GET start and callback routes plus compatible Cove session issuance.
- [ ] Implement the three PUT endpoints and GET course list with Bearer validation.
- [ ] Verify valid login, invalid state, expired/reused code, inactive users, and missing/incorrect API keys.
- [ ] Verify repeated PUTs, enrollment-before-user, invalid course IDs, and campus isolation.
- [ ] Deploy and run an agreed test-student flow from the DLAB hub.
- [ ] Confirm readiness before real students use the integration.
