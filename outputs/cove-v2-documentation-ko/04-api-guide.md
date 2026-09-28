# Cove Studio v2 API 명세서

담당: John. 기준: `feat/cove-studio-v2` / `b095b679b0a9f9ed407aa8abd42c32bf413cca72`. 검토일: 2026년 9월 28일, Asia/Tashkent.

## 계약 파일 및 범위

`supporting/04-api-openapi.json`은 기존 oRPC 프로시저 200개의 요청·응답 JSON Schema를 포함한 OpenAPI 3.1 명세입니다. 호환 Swagger 뷰어에 가져오십시오. `supporting/04-api-postman-collection.json`은 같은 요청 200개를 네임스페이스별로 제공합니다. `supporting/04-api-procedure-inventory.csv`는 검토용 색인이며 `supporting/04-api-procedure-reference.md`는 프로시저별 요청·응답 필드를 설명합니다. oRPC 외 업로드·다운로드·웹훅·이벤트 전송은 아래에 별도로 명시합니다.

스키마는 `packages/shared/src/api/orpc-contract.ts` 및 여기서 가져오는 Zod 계약에서 추출했습니다. JSON Schema는 구조 검증을 표현하지만 사용자 정의 정제, 변환, 권한 검사 및 트랜잭션 불변 조건은 소스에 남아 있습니다. Postman 예시 값은 템플릿이며 실제 테스트 데이터가 아닙니다. 실행 전에 OpenAPI 제약에 맞는 ID, 문자열, 배열 및 필수 값을 입력하십시오.

## 전송 및 인증

백엔드는 `/api/rpc`에 oRPC를 연결합니다(`packages/api/src/orpc/router.ts`). 이 버전에는 프로시저별 대체 HTTP 메서드가 명시되어 있지 않습니다. 예를 들어 `auth.me`는 `POST /api/rpc/auth/me`에 대응합니다. `Content-Type: application/json`과 `{"json": {}}` 형식의 본문을 보내며 도메인 결과는 `json` 속성으로 반환됩니다. oRPC는 직렬화용 `meta`를 추가할 수 있으므로 확장 값에는 프로젝트 클라이언트를 사용하십시오. 이는 현재 RPC 전송 규약입니다.

보호 요청은 `Authorization: Bearer <Supabase access token>`을 사용합니다. 서버는 토큰과 내부 사용자를 확인하고 학원, 소유권, 수명주기, 보유 역할 및 배정 조건을 검사합니다. `X-Cove-View-Role`은 지원되는 제품 보기를 선택하며 학원 역할을 새로 부여하지 않습니다. 신뢰된 BFF 프로시저는 비공개 서버 환경에만 두는 `X-Cove-Bff-Secret`도 사용합니다. 프로시저별 미들웨어는 색인을 참조하십시오. 공개 프로시저에도 유효성 검사, 요청 제한 및 보안 확인이 적용될 수 있습니다.

개발·스테이징 주소와 비공개 토큰 설정 후 조회 요청 예시:

```http
POST /api/rpc/auth/me
Authorization: Bearer <access-token>
Content-Type: application/json

{"json":{}}
```

`http://localhost:4000`은 개발 기본 주소입니다. 운영 웹 호스트는 검토했지만 배포 API 주소와 커밋은 확인하지 못했습니다. 라우팅 확인 없이 웹 주소를 API 주소로 대체하지 마십시오. 로그인 비밀번호는 접근 토큰이 아니며 패키지에 포함하지 않습니다.

## 오류, 권한 및 재시도

`packages/api/src/orpc/error-mapping.ts`는 애플리케이션 오류 코드를 보존합니다. 일반 HTTP 매핑은 400 BAD_REQUEST, 401 UNAUTHORIZED, 403 FORBIDDEN, 404 NOT_FOUND, 409 CONFLICT, 422 UNPROCESSABLE_ENTITY, 429 TOO_MANY_REQUESTS이며 예상하지 못한 실패는 500 INTERNAL_SERVER_ERROR입니다. 애플리케이션 코드가 일반 이름을 대체하여 오류 데이터에 포함될 수 있습니다. 번역된 UI 문구와 안정적인 오류 코드를 구분하십시오.

객체 접근을 가정하기 전에 행위자와 리소스 경로를 확인합니다. 404는 무권한 사용자에게 리소스 존재를 숨기는 응답일 수 있습니다. 일시적 실패 후 조회는 재시도할 수 있지만 변경 작업은 해당 작업의 멱등·리비전 계약에 따라야 합니다. 가져오기 확정은 캡처 리비전을 다시 검사하고 채점·도움 명령은 별도 동시성 규칙을 사용합니다. POST라는 이유만으로 보편적 재시도·멱등성을 보장하지 않습니다.

권한 통합 문서는 실제 역할 맵과 추가 조건을 기록합니다. 현재 플랫폼 대체 접근 헬퍼는 일부 직원 권한을 반환합니다. 이름과 이전 주석만으로 전체 읽기 전용 규칙을 추정할 수 없습니다. 의도한 플랫폼 쓰기 정책은 검토가 필요합니다.

## oRPC 외 HTTP 엔드포인트

아래 경로에는 백엔드 `/api` 접두사가 포함됩니다. JSON은 컨트롤러 응답이며 반드시 oRPC `json` 래퍼 형식인 것은 아닙니다.

| 메서드 및 경로 | 요청 및 결과 | 권한 / 소스 |
|---|---|---|
| GET `/api/health` | 상태·서비스를 포함한 생존 상태 JSON | `packages/api/src/app.controller.ts` |
| GET `/api/health/ready` | DB 연결 JSON. 실패 시 503 DATABASE_UNAVAILABLE | 같은 컨트롤러 |
| POST `/api/content-imports` | 파일 원시 바이트. academyId, courseId, 선택 filename 쿼리. 미리보기 생성 | Bearer 및 content.import; `content/import/content-import.controller.ts` |
| GET `/api/content-imports/template` | academyId, courseId, kind blank/current, locale en/ko, 선택 moduleIds/lectureIds. XLSX 다운로드 | Bearer 및 content.import; 같은 컨트롤러. 현재 강좌 내보내기는 비공개 채점 데이터를 포함할 수 있음 |
| POST `/api/people-imports` | 파일 원시 바이트, academyId, 선택 filename. 미리보기 생성 | Bearer 및 서비스 권한; `manage/people-import.controller.ts` |
| POST `/api/profile-images/global` | 이미지 원시 바이트. 정규화된 프로필 이미지 결과 | Bearer; `profile/profile-image.controller.ts` |
| POST `/api/profile-images/academy` | 이미지 원시 바이트, academyId, 선택 membershipId | Bearer 및 프로필 권한; 같은 컨트롤러 |
| POST `/api/academy-media` | 이미지 원시 바이트, academyId, kind COVER/GALLERY, 선택 altText/decorative | Bearer 및 학원 권한; `manage/academy-media.controller.ts` |
| DELETE `/api/academy-media` | academyId, mediaId 쿼리 | Bearer 및 학원 권한; 같은 컨트롤러 |
| GET `/api/platform-users/export` | 검증된 내보내기 쿼리. 다운로드 파일 | 플랫폼 권한; `platform/platform-users.controller.ts` |
| GET `/api/submissions/{submissionId}/stream` | academyId 쿼리. text/event-stream | Bearer 및 본인 제출; `learn/submission.controller.ts` |
| POST `/api/webhooks/email` | 서명된 제공자 페이로드, svix-id, svix-signature, svix-timestamp | 제공자 서명; `manage/delivery-webhook.controller.ts` |

전체 경로로 적지 않은 소스는 `packages/api/src/` 기준입니다. 업로드 서비스는 바이트를 검사하고 크기·요청 제한을 적용합니다. 파일명이나 선언한 MIME만 신뢰하지 않습니다. 미리보기는 가져오기 확정이 아닙니다. 대응하는 RPC 작업으로 미리보기 조회, 확정 및 결과 조회를 수행하십시오.

## 제출 이벤트 스트림

브라우저 EventSource는 인증된 웹 프록시 `/api/learn/submissions/{submissionId}/stream`을 통해 Bearer 토큰을 전달합니다. 백엔드는 구독 전 소유권을 확인합니다. 이벤트는 `progress`(공개 채점 진행 스키마), `result`(status, passedCount, totalCount), `error`(submissionId 및 일반 JUDGE_FAILED 사유), `ping`입니다. 이미 완료된 결과는 DB 확인으로 제공하고 최종 결과 후 스트림을 종료합니다. 백엔드 스트림 수명은 최대 5분입니다. 재연결 시 서버의 제출 상태를 다시 조회해야 합니다. 비공개 테스트 입력·기대 출력을 노출하면 안 됩니다.

## 실시간 모니터링 및 알림

Socket.IO `/monitoring` 네임스페이스는 인증 사용자와 서버에서 결정한 방을 사용합니다. 계약에서 요구하면 현재 지원 프로토콜 버전(이 기준은 3)을 전달하십시오. 반 참여, 학생 관찰, 편집 모드, 협업, 접속 상태, 실행·결과 및 터미널 메시지는 서로 다른 페이로드와 권한을 사용합니다. 관찰 세션만으로 협업 편집 권한을 얻지 않습니다. 권한 철회·맥락 변경으로 관찰이 종료될 수 있습니다. `packages/shared/src/monitoring/events.ts`, `monitoring.ts`, `terminal.ts`로 페이로드를 검증하십시오. 게이트웨이는 `packages/api/src/monitoring/monitoring.gateway.ts`입니다.

### 클라이언트 → 서버

- `class.join`, `class.leave`
- `student.watch.start`, `student.watch.stop`, `student.watch.mode`, `student.watch.summary`
- `presence.publish`, `document.sync`, `document.update`, `awareness.update`
- `run.activity`, `result.publish`, `feedback.send`
- `terminal.start`, `terminal.append`, `terminal.state`, `terminal.finish`, `terminal.snapshot`, `terminal.clear`, `terminal.resync`

### 서버 → 클라이언트

- `help.request.changed`, `class.snapshot`, `presence.changed`
- `watch.started`, `watch.ended`, `watch.summary`, `watch.mode.changed`
- `protocol.refresh.required`, `student.context.changed`
- `document.synced`, `document.updated`, `document.persisted`, `awareness.changed`
- `run.changed`, `result.changed`, `feedback.created`, `feedback.read`
- `access.revoked`, `server.degraded`, `student.indicator`
- `terminal.changed`, `terminal.snapshot.request`

별도 `/notifications` 네임스페이스는 `item`이 포함된 `notification.created`를 전송하며 애플리케이션 클라이언트 이벤트는 없습니다. 서버는 검증된 토큰에서 사용자별 방을 결정합니다. 알림 목록 RPC가 기준 데이터이며 재연결 후 다시 조회합니다. 소스: `packages/shared/src/notifications/events.ts`, `packages/api/src/notifications/notifications.gateway.ts`.

## 검토 및 실행 절차

1. OpenAPI 또는 Postman을 가져오고 확인된 스테이징 주소를 설정합니다. 토큰은 비공개 환경에 보관합니다.
2. 개별 요청을 선택하고 스키마에 맞는 필수 테스트 값을 입력한 뒤 행위자의 역할·학원을 확인합니다.
3. 학원 간 접근·소유권 거절을 포함한 QA를 실행하고 빌드, HTTP 상태, 오류 코드 및 결과 근거를 기록합니다.
4. 학생과 배정 강사의 별도 세션으로 이벤트 스트림을 검사하고 재연결, 비공개 테스트 보호 및 권한 철회를 확인합니다.
5. 향후 재생성은 소스 계약을 기준으로 합니다. 스키마 검증 성공만으로 운영 동작이나 통합 테스트 통과를 보장하지 않습니다.
