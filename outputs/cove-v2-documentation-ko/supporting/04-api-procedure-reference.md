# 전체 API 프로시저 참조

담당: John. 소스 기준 b095b679. oRPC 프로시저 200개 전체의 최상위 페이로드 색인입니다. 중첩 스키마, 유니온 및 정확한 응답 구조는 `04-api-openapi.json`에 보존합니다. 사용자 정의 정제와 권한은 소스를 참조하십시오.

실행 전에 상위 폴더의 API 가이드에서 전송·인증 및 oRPC 외 엔드포인트를 확인하십시오. 필수 여부는 해당 객체 기준입니다. 기본값이 있다고 필수 입력인 것은 아닙니다. POST만으로 변경 작업이나 재시도 가능 여부를 판단하지 마십시오.

## auth.bootstrap

`POST /api/rpc/auth/bootstrap`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| user | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.checkUsernameAvailable

`POST /api/rpc/auth/checkUsernameAvailable`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| username | 예 | string | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| available | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.resolveSignInEmail

`POST /api/rpc/auth/resolveSignInEmail`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| identifier | 예 | string | minLength=1; maxLength=320 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| email | 예 | string | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.requestPasswordRecovery

`POST /api/rpc/auth/requestPasswordRecovery`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| username | 예 | string | — |
| captchaToken | 아니요 | string | minLength=1; maxLength=4096 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| accepted | 예 | constant True | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.signUpStudent

`POST /api/rpc/auth/signUpStudent`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| username | 예 | string | — |
| displayName | 예 | string | minLength=2; maxLength=100 |
| password | 예 | string | minLength=8; maxLength=72 |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| captchaToken | 아니요 | string | minLength=1; maxLength=4096 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| email | 예 | string | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.forgetIssuedPassword

`POST /api/rpc/auth/forgetIssuedPassword`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| forgotten | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.setUsername

`POST /api/rpc/auth/setUsername`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| username | 예 | string | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| user | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.createOAuthOnboardingIntent

`POST /api/rpc/auth/createOAuthOnboardingIntent`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| provider | 예 | enum google, kakao, custom:naver | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| token | 예 | string | minLength=32 |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.completeOAuthOnboarding

`POST /api/rpc/auth/completeOAuthOnboarding`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| intentToken | 아니요 | string | minLength=32 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| user | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## auth.me

`POST /api/rpc/auth/me`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| user | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academies.listForSignup

`POST /api/rpc/academies/listForSignup`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academies | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## joinRequests.create

`POST /api/rpc/joinRequests/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| message | 아니요 | string | maxLength=1000 |
| kind | 아니요 | enum STUDENT, STAFF | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| message | 예 | string or null | — |
| status | 예 | enum PENDING, APPROVED, REJECTED, CANCELLED | — |
| requestedKind | 예 | enum STUDENT, STAFF | — |
| approvedRole | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER or null | — |
| reviewReason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| reviewedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## joinRequests.cancel

`POST /api/rpc/joinRequests/cancel`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| requestId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| message | 예 | string or null | — |
| status | 예 | enum PENDING, APPROVED, REJECTED, CANCELLED | — |
| requestedKind | 예 | enum STUDENT, STAFF | — |
| approvedRole | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER or null | — |
| reviewReason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| reviewedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyJoinRequests.list

`POST /api/rpc/academyJoinRequests/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| requests | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyJoinRequests.pendingCount

`POST /api/rpc/academyJoinRequests/pendingCount`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| count | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyJoinRequests.review

`POST /api/rpc/academyJoinRequests/review`

### 입력 (`json` 래퍼)

루트: one of: object, object. See the exact nested schema in OpenAPI.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| message | 예 | string or null | — |
| status | 예 | enum PENDING, APPROVED, REJECTED, CANCELLED | — |
| requestedKind | 예 | enum STUDENT, STAFF | — |
| approvedRole | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER or null | — |
| reviewReason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| reviewedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitations.create

`POST /api/rpc/academyInvitations/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| email | 예 | string (email) | pattern="^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| invitation | 예 | object | — |
| token | 예 | string | minLength=32 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitations.list

`POST /api/rpc/academyInvitations/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| invitations | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitations.revoke

`POST /api/rpc/academyInvitations/revoke`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| invitationId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| email | 예 | string (email) | pattern="^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| status | 예 | enum PENDING, ACCEPTED, REVOKED, EXPIRED | — |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| acceptedAt | 예 | string (date-time) or null | — |
| revokedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitations.accept

`POST /api/rpc/academyInvitations/accept`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| token | 예 | string | minLength=32; maxLength=512 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitations.preview

`POST /api/rpc/academyInvitations/preview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| token | 예 | string | minLength=32; maxLength=512 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyName | 예 | string | — |
| email | 예 | string (email) | pattern="^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.list

`POST /api/rpc/academyMembers/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| members | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.changeRole

`POST /api/rpc/academyMembers/changeRole`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.grantRole

`POST /api/rpc/academyMembers/grantRole`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.revokeRole

`POST /api/rpc/academyMembers/revokeRole`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.suspend

`POST /api/rpc/academyMembers/suspend`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyMembers.restore

`POST /api/rpc/academyMembers/restore`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| user | 예 | object | — |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| suspendedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyStudentCredentials.get

`POST /api/rpc/academyStudentCredentials/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| credential | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyStudentCredentials.issue

`POST /api/rpc/academyStudentCredentials/issue`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| password | 아니요 | string | minLength=8; maxLength=72; pattern="^[\\x21-\\x7E]+$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| password | 예 | string | minLength=1 |
| state | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyStudentCredentials.reveal

`POST /api/rpc/academyStudentCredentials/reveal`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| password | 예 | string | minLength=1 |
| state | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## profile.getMe

`POST /api/rpc/profile/getMe`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| profile | 예 | object | — |
| security | 예 | object | — |
| memberships | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## profile.updateGlobalProfile

`POST /api/rpc/profile/updateGlobalProfile`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| displayName | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| profile | 예 | object | — |
| security | 예 | object | — |
| memberships | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## profile.updatePreferences

`POST /api/rpc/profile/updatePreferences`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| preferredLocale | 예 | enum en, ko | — |
| timezone | 예 | string or null | — |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| profile | 예 | object | — |
| security | 예 | object | — |
| memberships | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## profile.removeImage

`POST /api/rpc/profile/removeImage`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| profile | 예 | object | — |
| security | 예 | object | — |
| memberships | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyFeatures.list

`POST /api/rpc/academyFeatures/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| features | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyFeatures.setEnabled

`POST /api/rpc/academyFeatures/setEnabled`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| feature | 예 | enum TEACHER_LIVE_MONITORING, STUDENT_CLASS_STANDING, STUDENT_POINTS, STUDENT_CLASS_LEADERBOARD | — |
| isEnabled | 예 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| features | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.getMine

`POST /api/rpc/academyProfile/getMine`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.updateMine

`POST /api/rpc/academyProfile/updateMine`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyDisplayName | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| expectedUpdatedAt | 예 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.updateStudentDetails

`POST /api/rpc/academyProfile/updateStudentDetails`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| dateOfBirth | 예 | constant  or null or string (date) | — |
| schoolName | 예 | string or null | — |
| schoolGrade | 예 | string or null | — |
| guardianName | 예 | string or null | — |
| guardianRelationship | 예 | enum MOTHER, FATHER, GRANDPARENT, SIBLING, LEGAL_GUARDIAN, OTHER or null | — |
| guardianPhone | 예 | string or null | — |
| emergencyContactName | 예 | string or null | — |
| emergencyContactPhone | 예 | string or null | — |
| expectedUpdatedAt | 예 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.updateStudentSelfExpression

`POST /api/rpc/academyProfile/updateStudentSelfExpression`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| codingInterests | 예 | array of enum GAME_DEVELOPMENT, WEB_DEVELOPMENT, APP_DEVELOPMENT, ARTIFICIAL_INTELLIGENCE, DATA_ANALYSIS, ALGORITHMS, ROBOTICS, GRAPHICS_AND_DESIGN, COMPETITIVE_PROGRAMMING | maxItems=6 |
| learningGoal | 예 | string or null | — |
| expectedUpdatedAt | 예 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.updateStaffProfile

`POST /api/rpc/academyProfile/updateStaffProfile`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| bio | 예 | string or null | — |
| specialties | 예 | array of enum PYTHON, JAVASCRIPT, SCRATCH, ALGORITHMS, DATA_SCIENCE, GAME_DEVELOPMENT, WEB_DEVELOPMENT, ARTIFICIAL_INTELLIGENCE, ROBOTICS | maxItems=6 |
| teachingLanguages | 예 | array of enum KO, EN, ZH, JA, RU, UZ | maxItems=4 |
| expectedUpdatedAt | 예 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.removeImage

`POST /api/rpc/academyProfile/removeImage`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.getForManager

`POST /api/rpc/academyProfile/getForManager`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyProfile.updateForManager

`POST /api/rpc/academyProfile/updateForManager`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| common | 예 | object | — |
| commonUpdatedAt | 예 | string (date-time) or null | — |
| student | 예 | object or null | — |
| studentUpdatedAt | 예 | string (date-time) or null | — |
| staff | 예 | object or null | — |
| staffUpdatedAt | 예 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| context | 예 | object | — |
| common | 예 | object | — |
| student | 예 | object or null | — |
| staff | 예 | object or null | — |
| classes | 예 | array of object | — |
| courses | 예 | array of object | — |
| editableSections | 예 | array of enum COMMON, STUDENT_DETAILS, STUDENT_SELF_EXPRESSION, STAFF | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.list

`POST /api/rpc/academyCourses/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courses | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.create

`POST /api/rpc/academyCourses/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000; default="" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 예 | string | maxLength=10000 |
| isVisible | 예 | boolean | — |
| content | 예 | object | — |
| provenance | 아니요 | object or null | default=null |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.update

`POST /api/rpc/academyCourses/update`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 아니요 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 예 | string | maxLength=10000 |
| isVisible | 예 | boolean | — |
| content | 예 | object | — |
| provenance | 아니요 | object or null | default=null |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.delete

`POST /api/rpc/academyCourses/delete`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| confirmTitle | 예 | string | minLength=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.setVisibility

`POST /api/rpc/academyCourses/setVisibility`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| isVisible | 예 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 예 | string | maxLength=10000 |
| isVisible | 예 | boolean | — |
| content | 예 | object | — |
| provenance | 아니요 | object or null | default=null |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.setContentVisibility

`POST /api/rpc/academyCourses/setContentVisibility`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| isVisible | 예 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.getTree

`POST /api/rpc/academyCourses/getTree`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.createModule

`POST /api/rpc/academyCourses/createModule`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000; default="" |
| position | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.updateModule

`POST /api/rpc/academyCourses/updateModule`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| moduleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 아니요 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000 |
| isVisible | 아니요 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.deleteModule

`POST /api/rpc/academyCourses/deleteModule`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| moduleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.reorderModules

`POST /api/rpc/academyCourses/reorderModules`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| orderedModuleIds | 예 | array of string (uuid) | minItems=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.createLecture

`POST /api/rpc/academyCourses/createLecture`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| moduleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000; default="" |
| position | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.updateLecture

`POST /api/rpc/academyCourses/updateLecture`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 아니요 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000 |
| isVisible | 아니요 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.deleteLecture

`POST /api/rpc/academyCourses/deleteLecture`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.reorderLectures

`POST /api/rpc/academyCourses/reorderLectures`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| moduleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| orderedLectureIds | 예 | array of string (uuid) | minItems=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.moveLecture

`POST /api/rpc/academyCourses/moveLecture`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| fromModuleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| toModuleId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| toIndex | 예 | integer | minimum=0; maximum=9007199254740991 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.getExercise

`POST /api/rpc/academyCourses/getExercise`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| module | 예 | object | — |
| lecture | 예 | object | — |
| material | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.getExerciseSolution

`POST /api/rpc/academyCourses/getExerciseSolution`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| solutionCode | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.createExercise

`POST /api/rpc/academyCourses/createExercise`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| difficulty | 예 | enum EASY, MEDIUM, HARD | — |
| description | 예 | string | maxLength=500000 |
| inputFormat | 예 | string | maxLength=10000 |
| outputFormat | 예 | string | maxLength=10000 |
| constraints | 예 | string | maxLength=10000 |
| starterCode | 예 | string | maxLength=100000 |
| solutionCode | 예 | string | maxLength=100000 |
| aiFeedbackEnabled | 예 | boolean | — |
| isVisible | 예 | boolean | — |
| testCases | 예 | array of object | maxItems=50 |
| hints | 예 | array of object | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| module | 예 | object | — |
| lecture | 예 | object | — |
| material | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.updateExercise

`POST /api/rpc/academyCourses/updateExercise`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| difficulty | 예 | enum EASY, MEDIUM, HARD | — |
| description | 예 | string | maxLength=500000 |
| inputFormat | 예 | string | maxLength=10000 |
| outputFormat | 예 | string | maxLength=10000 |
| constraints | 예 | string | maxLength=10000 |
| starterCode | 예 | string | maxLength=100000 |
| solutionCode | 예 | string | maxLength=100000 |
| aiFeedbackEnabled | 예 | boolean | — |
| isVisible | 예 | boolean | — |
| testCases | 예 | array of object | maxItems=50 |
| hints | 예 | array of object | — |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| module | 예 | object | — |
| lecture | 예 | object | — |
| material | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.deleteExercise

`POST /api/rpc/academyCourses/deleteExercise`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.reorderExercises

`POST /api/rpc/academyCourses/reorderExercises`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| orderedMaterialIds | 예 | array of string (uuid) | minItems=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.moveExercise

`POST /api/rpc/academyCourses/moveExercise`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| fromLectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| toLectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| toIndex | 예 | integer | minimum=0; maximum=9007199254740991 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCourses.setExerciseVisibility

`POST /api/rpc/academyCourses/setExerciseVisibility`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| isVisible | 예 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyContentImports.getPreview

`POST /api/rpc/academyContentImports/getPreview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, FAILED, EXPIRED | — |
| originalFilename | 예 | string | minLength=1; maxLength=255 |
| templateVersion | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| plan | 예 | object | — |
| counts | 예 | object | — |
| contentRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyContentImports.commit

`POST /api/rpc/academyContentImports/commit`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| contentRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| acknowledgeWarnings | 아니요 | boolean | default=false |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, FAILED, EXPIRED | — |
| created | 예 | integer | minimum=0; maximum=9007199254740991 |
| updated | 예 | integer | minimum=0; maximum=9007199254740991 |
| unchanged | 예 | integer | minimum=0; maximum=9007199254740991 |
| failed | 예 | integer | minimum=0; maximum=9007199254740991 |
| entities | 예 | array of object | maxItems=24200 |
| contentRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| committedAt | 예 | string (date-time) or null | — |
| failureCode | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyContentImports.getResult

`POST /api/rpc/academyContentImports/getResult`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, FAILED, EXPIRED | — |
| created | 예 | integer | minimum=0; maximum=9007199254740991 |
| updated | 예 | integer | minimum=0; maximum=9007199254740991 |
| unchanged | 예 | integer | minimum=0; maximum=9007199254740991 |
| failed | 예 | integer | minimum=0; maximum=9007199254740991 |
| entities | 예 | array of object | maxItems=24200 |
| contentRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| committedAt | 예 | string (date-time) or null | — |
| failureCode | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyLibrary.available

`POST /api/rpc/academyLibrary/available`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courses | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyLibrary.preview

`POST /api/rpc/academyLibrary/preview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| libraryCourseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyLibrary.adopt

`POST /api/rpc/academyLibrary/adopt`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| libraryCourseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1; maxLength=200 |
| description | 예 | string | maxLength=10000 |
| isVisible | 예 | boolean | — |
| content | 예 | object | — |
| provenance | 아니요 | object or null | default=null |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.list

`POST /api/rpc/academyClasses/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 아니요 | enum ACTIVE, ARCHIVED | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| classes | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.get

`POST /api/rpc/academyClasses/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.create

`POST /api/rpc/academyClasses/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 아니요 | string | maxLength=2000; default="" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.update

`POST /api/rpc/academyClasses/update`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 아니요 | string | maxLength=2000; default="" |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.setStatus

`POST /api/rpc/academyClasses/setStatus`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum ACTIVE, ARCHIVED | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.delete

`POST /api/rpc/academyClasses/delete`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| confirmName | 예 | string | minLength=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.setCourses

`POST /api/rpc/academyClasses/setCourses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseIds | 예 | array of string (uuid) | maxItems=100 |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.setSchedule

`POST /api/rpc/academyClasses/setSchedule`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| slots | 예 | array of object | maxItems=21 |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.listEligibleStudents

`POST /api/rpc/academyClasses/listEligibleStudents`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| students | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.addStudents

`POST /api/rpc/academyClasses/addStudents`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipIds | 예 | array of string (uuid) | minItems=1; maxItems=100 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.removeStudent

`POST /api/rpc/academyClasses/removeStudent`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.listEligibleTeachers

`POST /api/rpc/academyClasses/listEligibleTeachers`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| teachers | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.setTeacher

`POST /api/rpc/academyClasses/setTeacher`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| teacherMembershipId | 예 | string (uuid) or null | — |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyClasses.setAssistantTeachers

`POST /api/rpc/academyClasses/setAssistantTeachers`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| teacherMembershipIds | 예 | array of string (uuid) | maxItems=2 |
| expectedUpdatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| status | 예 | enum ACTIVE, ARCHIVED | — |
| courses | 예 | array of object | — |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| assignedTeacher | 예 | object or null | — |
| teachers | 예 | array of object | maxItems=3 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| archivedAt | 예 | string (date-time) or null | — |
| students | 예 | array of object | — |
| schedule | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getOverview

`POST /api/rpc/learn/getOverview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| range | 아니요 | enum 7d, 30d, all | — |
| standingClassId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| scope | 예 | object | — |
| continueTargets | 예 | array of object | maxItems=3 |
| ledger | 예 | object | — |
| courses | 예 | array of object | — |
| activity | 예 | object | — |
| records | 예 | array of object | maxItems=5 |
| standing | 예 | one of: object, object or null | — |
| standingClasses | 예 | array of object | — |
| unavailable | 예 | array of enum continue, ledger, courses, activity, standing, records | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.listCourses

`POST /api/rpc/learn/listCourses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courses | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getCourseOutline

`POST /api/rpc/learn/getCourseOutline`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| progress | 예 | object | — |
| modules | 예 | array of object | — |
| classContext | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.listClasses

`POST /api/rpc/learn/listClasses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| classes | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getClass

`POST /api/rpc/learn/getClass`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=120 |
| description | 예 | string | maxLength=2000 |
| teacher | 예 | object or null | — |
| availableCourseCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| courses | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getExerciseWorkspace

`POST /api/rpc/learn/getExerciseWorkspace`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| breadcrumb | 예 | object | — |
| exercise | 예 | object | — |
| neighbors | 예 | object | — |
| draft | 예 | object or null | — |
| status | 예 | enum NOT_STARTED, IN_PROGRESS, SOLVED | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getExerciseBootstrap

`POST /api/rpc/learn/getExerciseBootstrap`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| submissionId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| workspace | 예 | object | — |
| navigator | 예 | object | — |
| selectedSubmission | 아니요 | object or null | — |
| classContext | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.startSolveSession

`POST /api/rpc/learn/startSolveSession`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| solveSessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| startedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.listAnswerRecords

`POST /api/rpc/learn/listAnswerRecords`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| q | 아니요 | string | maxLength=120 |
| results | 아니요 | array of enum ACCEPTED, NOT_ACCEPTED, JUDGE_ERROR, CANCELLED, IN_PROGRESS | — |
| classIds | 아니요 | array of string (uuid) | — |
| courseIds | 아니요 | array of string (uuid) | — |
| moduleIds | 아니요 | array of string (uuid) | — |
| lectureIds | 아니요 | array of string (uuid) | — |
| sort | 아니요 | enum problem, result, score, solveTime, submitted | — |
| direction | 아니요 | enum asc, desc | — |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| summary | 예 | object | — |
| rows | 예 | array of object | — |
| facets | 예 | object | — |
| pagination | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.listDrafts

`POST /api/rpc/learn/listDrafts`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| drafts | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.saveDraft

`POST /api/rpc/learn/saveDraft`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| code | 예 | string | maxLength=262144 |
| baseUpdatedAt | 아니요 | string (date-time) or null | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| outcome | 예 | enum SAVED, CONFLICT | — |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| serverCode | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.discardDraft

`POST /api/rpc/learn/discardDraft`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| discarded | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.submit

`POST /api/rpc/learn/submit`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| code | 예 | string | minLength=1; maxLength=100000 |
| solveSessionId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| submissionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| totalCount | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.getSubmission

`POST /api/rpc/learn/getSubmission`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| submissionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| submissionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum QUEUED, RUNNING, PASSED, FAILED, ERRORED, CANCELLED | — |
| passedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| totalCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| score | 예 | integer | minimum=0; maximum=100 |
| runtimeMs | 예 | integer or null | — |
| failureReason | 예 | string or null | — |
| elapsedSec | 예 | integer | minimum=0; maximum=9007199254740991 |
| attemptCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| gradedAt | 예 | string (date-time) or null | — |
| cases | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## learn.listSubmissions

`POST /api/rpc/learn/listSubmissions`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| submissions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## lobby.academy

`POST /api/rpc/lobby/academy`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academySlug | 예 | string | minLength=1; maxLength=200 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | — |
| slug | 예 | string | — |
| imageUrl | 예 | string or null | — |
| hasPoints | 예 | boolean | — |
| application | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getMyActiveHelpRequest

`POST /api/rpc/monitoring/getMyActiveHelpRequest`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| request | 예 | object or null | — |
| latestClosed | 예 | object or null | — |
| teacherAssigned | 예 | boolean | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.requestHelp

`POST /api/rpc/monitoring/requestHelp`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| idempotencyKey | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| conflict | 예 | boolean | — |
| request | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.cancelMyHelpRequest

`POST /api/rpc/monitoring/cancelMyHelpRequest`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| requestId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| expectedVersion | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| idempotencyKey | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| conflict | 예 | boolean | — |
| request | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.listClassHelpRequests

`POST /api/rpc/monitoring/listClassHelpRequests`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum WAITING, IN_PROGRESS | — |
| cursor | 아니요 | object | — |
| limit | 아니요 | integer | minimum=1; maximum=100; default=50 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| requests | 예 | array of object | — |
| waitingCount | 예 | integer | minimum=-9007199254740991; maximum=9007199254740991 |
| inProgressCount | 예 | integer | minimum=-9007199254740991; maximum=9007199254740991 |
| nextCursor | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.claimHelpRequest

`POST /api/rpc/monitoring/claimHelpRequest`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| requestId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| expectedVersion | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| idempotencyKey | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| conflict | 예 | boolean | — |
| request | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.returnHelpRequest

`POST /api/rpc/monitoring/returnHelpRequest`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| requestId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| expectedVersion | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| idempotencyKey | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| conflict | 예 | boolean | — |
| request | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.resolveHelpRequest

`POST /api/rpc/monitoring/resolveHelpRequest`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| requestId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| expectedVersion | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| idempotencyKey | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| conflict | 예 | boolean | — |
| request | 예 | object or null | — |
| serverTime | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.listAssignedClasses

`POST /api/rpc/monitoring/listAssignedClasses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| featureEnabled | 예 | boolean | — |
| classes | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getClassRoster

`POST /api/rpc/monitoring/getClassRoster`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| class | 예 | object | — |
| courses | 예 | array of object | — |
| exercises | 예 | array of object | — |
| students | 예 | array of object | maxItems=200 |
| truncated | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getStudentContext

`POST /api/rpc/monitoring/getStudentContext`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| viewerMembershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| student | 예 | object | — |
| class | 예 | object | — |
| exercise | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getStudentCurriculum

`POST /api/rpc/monitoring/getStudentCurriculum`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| path | 예 | object | — |
| course | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getExercisePreview

`POST /api/rpc/monitoring/getExercisePreview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| breadcrumb | 예 | object | — |
| exercise | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.getExerciseSolution

`POST /api/rpc/monitoring/getExerciseSolution`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| visitId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| solutionCode | 예 | string | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.listFeedback

`POST /api/rpc/monitoring/listFeedback`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| limit | 아니요 | integer | minimum=1; maximum=50; default=50 |
| before | 아니요 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| feedback | 예 | array of object | — |
| nextBefore | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.listMyFeedback

`POST /api/rpc/monitoring/listMyFeedback`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| limit | 아니요 | integer | minimum=1; maximum=50; default=50 |
| before | 아니요 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| feedback | 예 | array of object | — |
| nextBefore | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## monitoring.markMyFeedbackRead

`POST /api/rpc/monitoring/markMyFeedbackRead`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| readCount | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## notifications.list

`POST /api/rpc/notifications/list`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| items | 예 | array of object | — |
| unreadCount | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## notifications.acknowledge

`POST /api/rpc/notifications/acknowledge`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| success | 예 | constant True | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.list

`POST /api/rpc/platformAcademies/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| status | 아니요 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| needsAttention | 아니요 | boolean | — |
| limit | 아니요 | integer | minimum=1; maximum=100; default=50 |
| offset | 아니요 | integer | minimum=0; maximum=9007199254740991; default=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academies | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| needsAttention | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.get

`POST /api/rpc/platformAcademies/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1 |
| slug | 예 | string | minLength=1 |
| status | 예 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| timeZone | 예 | string | minLength=1 |
| managerState | 예 | enum active, awaiting_first_manager, no_active_manager | — |
| memberCounts | 예 | object | — |
| pendingManagerInvitation | 예 | object or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| statusChangedAt | 예 | string (date-time) or null | — |
| organization | 예 | object | — |
| contactEmail | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| locality | 예 | string or null | — |
| countryCode | 예 | string or null | — |
| profileUpdatedAt | 예 | string (date-time) or null | — |
| createdBy | 예 | object or null | — |
| classes | 예 | object | — |
| content | 예 | object | — |
| enrolments | 예 | integer | minimum=0; maximum=9007199254740991 |
| support | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.getBySlug

`POST /api/rpc/platformAcademies/getBySlug`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academySlug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1 |
| slug | 예 | string | minLength=1 |
| status | 예 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| timeZone | 예 | string | minLength=1 |
| managerState | 예 | enum active, awaiting_first_manager, no_active_manager | — |
| memberCounts | 예 | object | — |
| pendingManagerInvitation | 예 | object or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| statusChangedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.create

`POST /api/rpc/platformAcademies/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| name | 예 | string | minLength=2; maxLength=120 |
| slug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |
| timeZone | 예 | string | minLength=1; maxLength=64 |
| managerEmail | 아니요 | string (email) | maxLength=200; pattern="^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$" |
| contactEmail | 아니요 | string (email) or null or constant  | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academy | 예 | object | — |
| invitation | 예 | object or null | — |
| token | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.update

`POST /api/rpc/platformAcademies/update`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=2; maxLength=120 |
| slug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1 |
| slug | 예 | string | minLength=1 |
| status | 예 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| timeZone | 예 | string | minLength=1 |
| managerState | 예 | enum active, awaiting_first_manager, no_active_manager | — |
| memberCounts | 예 | object | — |
| pendingManagerInvitation | 예 | object or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| statusChangedAt | 예 | string (date-time) or null | — |
| organization | 예 | object | — |
| contactEmail | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| locality | 예 | string or null | — |
| countryCode | 예 | string or null | — |
| profileUpdatedAt | 예 | string (date-time) or null | — |
| createdBy | 예 | object or null | — |
| classes | 예 | object | — |
| content | 예 | object | — |
| enrolments | 예 | integer | minimum=0; maximum=9007199254740991 |
| support | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.resolveSlug

`POST /api/rpc/platformAcademies/resolveSlug`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| slug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| slug | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.setStatus

`POST /api/rpc/platformAcademies/setStatus`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| reason | 예 | string | minLength=3; maxLength=500 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1 |
| slug | 예 | string | minLength=1 |
| status | 예 | enum ACTIVE, SUSPENDED, ARCHIVED | — |
| timeZone | 예 | string | minLength=1 |
| managerState | 예 | enum active, awaiting_first_manager, no_active_manager | — |
| memberCounts | 예 | object | — |
| pendingManagerInvitation | 예 | object or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| statusChangedAt | 예 | string (date-time) or null | — |
| organization | 예 | object | — |
| contactEmail | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| locality | 예 | string or null | — |
| countryCode | 예 | string or null | — |
| profileUpdatedAt | 예 | string (date-time) or null | — |
| createdBy | 예 | object or null | — |
| classes | 예 | object | — |
| content | 예 | object | — |
| enrolments | 예 | integer | minimum=0; maximum=9007199254740991 |
| support | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.delete

`POST /api/rpc/platformAcademies/delete`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| confirmSlug | 예 | string | minLength=1 |
| reason | 예 | string | minLength=8; maxLength=500 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1 |
| slug | 예 | string | minLength=1 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAcademies.resendFirstManagerInvitation

`POST /api/rpc/platformAcademies/resendFirstManagerInvitation`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| email | 아니요 | string (email) | maxLength=200; pattern="^(?!\\.)(?!.*\\.\\.)([A-Za-z0-9_'+\\-\\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\\-]*\\.)+[A-Za-z]{2,}$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| invitation | 예 | object | — |
| token | 예 | string | minLength=32 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSettings.features

`POST /api/rpc/platformSettings/features`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| search | 아니요 | string | maxLength=120 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| truncated | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSettings.pointPolicies

`POST /api/rpc/platformSettings/pointPolicies`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| search | 아니요 | string | maxLength=120 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| truncated | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.staleProblems

`POST /api/rpc/platformOperations/staleProblems`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| truncated | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.planRegrade

`POST /api/rpc/platformOperations/planRegrade`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| runId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| problemTitle | 예 | string | — |
| currentRevision | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| plannedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.startRegrade

`POST /api/rpc/platformOperations/startRegrade`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| runId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academySlug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |
| academyName | 예 | string | — |
| operation | 예 | enum REGRADE_STALE_SUBMISSIONS | — |
| targetType | 예 | string | — |
| targetId | 예 | string | — |
| targetTitle | 예 | string or null | — |
| actorName | 예 | string | — |
| status | 예 | enum PLANNING, RUNNING, COMPLETED, FAILED | — |
| plannedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| dispatchedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| completedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| failedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| failureReason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| startedAt | 예 | string (date-time) or null | — |
| finishedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.cancelPlan

`POST /api/rpc/platformOperations/cancelPlan`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| runId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| cancelled | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.run

`POST /api/rpc/platformOperations/run`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| runId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academySlug | 예 | string | minLength=2; maxLength=60; pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$" |
| academyName | 예 | string | — |
| operation | 예 | enum REGRADE_STALE_SUBMISSIONS | — |
| targetType | 예 | string | — |
| targetId | 예 | string | — |
| targetTitle | 예 | string or null | — |
| actorName | 예 | string | — |
| status | 예 | enum PLANNING, RUNNING, COMPLETED, FAILED | — |
| plannedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| studentCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| dispatchedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| completedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| failedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| failureReason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| startedAt | 예 | string (date-time) or null | — |
| finishedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformOperations.runs

`POST /api/rpc/platformOperations/runs`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| limit | 아니요 | integer | minimum=1; maximum=50; default=20 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| runs | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformApplications.list

`POST /api/rpc/platformApplications/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| statuses | 아니요 | array of enum PENDING, APPROVED, REJECTED, CANCELLED | maxItems=4 |
| leaderlessOnly | 아니요 | boolean | — |
| sort | 아니요 | enum waiting, academy | default="waiting" |
| direction | 아니요 | enum asc, desc | default="asc" |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| summary | 예 | object | — |
| academyOptions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformApplications.pendingCount

`POST /api/rpc/platformApplications/pendingCount`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| count | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAudit.list

`POST /api/rpc/platformAudit/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| actorUserId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| supportGrantId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| action | 아니요 | string | maxLength=120 |
| targetIds | 아니요 | array of string | maxItems=50 |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=200; default=50 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| entries | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformAudit.get

`POST /api/rpc/platformAudit/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| entryId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| action | 예 | string | minLength=1 |
| targetType | 예 | string | minLength=1 |
| targetId | 예 | string or null | — |
| actorName | 예 | string or null | — |
| actorUserId | 예 | string (uuid) or null | — |
| academyId | 예 | string (uuid) or null | — |
| academyName | 예 | string or null | — |
| academySlug | 예 | string or null | — |
| reason | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| supportGrantId | 예 | string (uuid) or null | — |
| before | 예 | schema or null | — |
| after | 예 | schema or null | — |
| requestId | 예 | string or null | — |
| ipAddress | 예 | string or null | — |
| userAgent | 예 | string or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformContent.summary

`POST /api/rpc/platformContent/summary`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academies | 예 | integer | minimum=0; maximum=9007199254740991 |
| courses | 예 | object | — |
| classes | 예 | object | — |
| problems | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformContent.courses

`POST /api/rpc/platformContent/courses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| sort | 아니요 | enum updatedAt, title, classes, modules, students | default="updatedAt" |
| direction | 아니요 | enum asc, desc | default="desc" |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| academyOptions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformContent.classes

`POST /api/rpc/platformContent/classes`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| sort | 아니요 | enum updatedAt, title, classes, modules, students | default="updatedAt" |
| direction | 아니요 | enum asc, desc | default="desc" |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| academyOptions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformLibrary.academy

`POST /api/rpc/platformLibrary/academy`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformLibrary.courses

`POST /api/rpc/platformLibrary/courses`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| search | 아니요 | string | maxLength=200 |
| state | 아니요 | enum DRAFT, PUBLISHED, RETIRED | — |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0; default=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courses | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| pageSize | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformLibrary.create

`POST /api/rpc/platformLibrary/create`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| title | 예 | string | minLength=1; maxLength=200 |
| description | 아니요 | string | maxLength=10000; default="" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1 |
| description | 예 | string | — |
| isVisible | 예 | boolean | — |
| retiredAt | 예 | string (date-time) or null | — |
| contentRevision | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| moduleCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| lectureCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| exerciseCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| problemsWithoutTests | 예 | integer | minimum=0; maximum=9007199254740991 |
| copyCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| behindCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformLibrary.retire

`POST /api/rpc/platformLibrary/retire`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| retired | 예 | boolean | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| title | 예 | string | minLength=1 |
| description | 예 | string | — |
| isVisible | 예 | boolean | — |
| retiredAt | 예 | string (date-time) or null | — |
| contentRevision | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| moduleCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| lectureCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| exerciseCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| problemsWithoutTests | 예 | integer | minimum=0; maximum=9007199254740991 |
| copyCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| behindCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| updatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformLibrary.copies

`POST /api/rpc/platformLibrary/copies`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| copies | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformInvitations.list

`POST /api/rpc/platformInvitations/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| statuses | 아니요 | array of enum PENDING, ACCEPTED, REVOKED, EXPIRED | maxItems=4 |
| deliveryStates | 아니요 | array of enum QUEUED, SENT, DELIVERED, BOUNCED, FAILED | maxItems=5 |
| leaderlessOnly | 아니요 | boolean | — |
| sort | 아니요 | enum sent, academy, expires | default="sent" |
| direction | 아니요 | enum asc, desc | default="desc" |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| summary | 예 | object | — |
| academyOptions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformRanking.classes

`POST /api/rpc/platformRanking/classes`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| period | 아니요 | enum all, day, week, month | default="all" |
| sort | 아니요 | enum points, students, earning, class, academy | default="points" |
| direction | 아니요 | enum asc, desc | default="desc" |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| truncated | 예 | boolean | — |
| summary | 예 | object | — |
| academyOptions | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.list

`POST /api/rpc/platformUsers/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| query | 아니요 | string | maxLength=120 |
| academyIds | 아니요 | array of string (uuid) | maxItems=50 |
| roles | 아니요 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| membershipStatuses | 아니요 | array of enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| accountStatuses | 아니요 | array of enum PENDING_PROFILE, ACTIVE, SUSPENDED, DELETED | — |
| platformRoles | 아니요 | array of enum USER, ADMIN | — |
| unaffiliatedOnly | 아니요 | boolean | — |
| page | 아니요 | integer | minimum=1; maximum=9007199254740991; default=1 |
| pageSize | 아니요 | integer | minimum=1; maximum=100; default=25 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| people | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | integer | minimum=1; maximum=9007199254740991 |
| academyOptions | 예 | array of object | — |
| composition | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.get

`POST /api/rpc/platformUsers/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| displayName | 예 | string or null | — |
| username | 예 | string or null | — |
| email | 예 | string (email) or null | — |
| avatarUrl | 예 | string or null | — |
| status | 예 | enum PENDING_PROFILE, ACTIVE, SUSPENDED, DELETED | — |
| platformRole | 예 | enum USER, ADMIN | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| memberships | 예 | array of object | — |
| invitations | 예 | array of object | — |
| joinRequests | 예 | array of object | — |
| lastSignInAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.setStatus

`POST /api/rpc/platformUsers/setStatus`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum ACTIVE, SUSPENDED, DELETED | — |
| reason | 예 | string | minLength=8; maxLength=500 |
| confirmHandle | 아니요 | string | minLength=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| displayName | 예 | string or null | — |
| username | 예 | string or null | — |
| email | 예 | string (email) or null | — |
| avatarUrl | 예 | string or null | — |
| status | 예 | enum PENDING_PROFILE, ACTIVE, SUSPENDED, DELETED | — |
| platformRole | 예 | enum USER, ADMIN | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| memberships | 예 | array of object | — |
| invitations | 예 | array of object | — |
| joinRequests | 예 | array of object | — |
| lastSignInAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.participation

`POST /api/rpc/platformUsers/participation`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academySlug | 예 | string | minLength=1 |
| academyName | 예 | string | minLength=1 |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| status | 예 | enum INVITED, ACTIVE, SUSPENDED, LEFT | — |
| joinedAt | 예 | string (date-time) or null | — |
| student | 예 | object or null | — |
| teacher | 예 | object or null | — |
| lead | 예 | object or null | — |
| manager | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.setMembershipRole

`POST /api/rpc/platformUsers/setMembershipRole`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| role | 예 | enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | — |
| reason | 예 | string | minLength=8; maxLength=500 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| displayName | 예 | string or null | — |
| username | 예 | string or null | — |
| email | 예 | string (email) or null | — |
| avatarUrl | 예 | string or null | — |
| status | 예 | enum PENDING_PROFILE, ACTIVE, SUSPENDED, DELETED | — |
| platformRole | 예 | enum USER, ADMIN | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| memberships | 예 | array of object | — |
| invitations | 예 | array of object | — |
| joinRequests | 예 | array of object | — |
| lastSignInAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformUsers.setPlatformRole

`POST /api/rpc/platformUsers/setPlatformRole`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| platformRole | 예 | enum USER, ADMIN | — |
| reason | 예 | string | minLength=8; maxLength=500 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| userId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| displayName | 예 | string or null | — |
| username | 예 | string or null | — |
| email | 예 | string (email) or null | — |
| avatarUrl | 예 | string or null | — |
| status | 예 | enum PENDING_PROFILE, ACTIVE, SUSPENDED, DELETED | — |
| platformRole | 예 | enum USER, ADMIN | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| memberships | 예 | array of object | — |
| invitations | 예 | array of object | — |
| joinRequests | 예 | array of object | — |
| lastSignInAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSupport.list

`POST /api/rpc/platformSupport/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| liveOnly | 아니요 | boolean | — |
| limit | 아니요 | integer | minimum=1; maximum=200; default=50 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| grants | 예 | array of object | — |
| liveCount | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSupport.get

`POST /api/rpc/platformSupport/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| grantId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyName | 예 | string | minLength=1 |
| academySlug | 예 | string | minLength=1 |
| adminUserId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| adminName | 예 | string | minLength=1 |
| assumedRole | 예 | enum MANAGER, TEACHER | — |
| readOnly | 예 | boolean | — |
| allowMonitoring | 예 | boolean | — |
| reason | 예 | string | minLength=1 |
| startsAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| revokedAt | 예 | string (date-time) or null | — |
| revokedByName | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| state | 예 | enum live, scheduled, expired, revoked | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSupport.open

`POST /api/rpc/platformSupport/open`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| assumedRole | 예 | enum MANAGER, TEACHER | — |
| readOnly | 아니요 | boolean | default=true |
| allowMonitoring | 아니요 | boolean | default=false |
| reason | 예 | string | minLength=12; maxLength=500 |
| hours | 아니요 | integer | minimum=1; maximum=4; default=1 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyName | 예 | string | minLength=1 |
| academySlug | 예 | string | minLength=1 |
| adminUserId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| adminName | 예 | string | minLength=1 |
| assumedRole | 예 | enum MANAGER, TEACHER | — |
| readOnly | 예 | boolean | — |
| allowMonitoring | 예 | boolean | — |
| reason | 예 | string | minLength=1 |
| startsAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| revokedAt | 예 | string (date-time) or null | — |
| revokedByName | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| state | 예 | enum live, scheduled, expired, revoked | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSupport.revoke

`POST /api/rpc/platformSupport/revoke`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| grantId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| academyName | 예 | string | minLength=1 |
| academySlug | 예 | string | minLength=1 |
| adminUserId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| adminName | 예 | string | minLength=1 |
| assumedRole | 예 | enum MANAGER, TEACHER | — |
| readOnly | 예 | boolean | — |
| allowMonitoring | 예 | boolean | — |
| reason | 예 | string | minLength=1 |
| startsAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| revokedAt | 예 | string (date-time) or null | — |
| revokedByName | 예 | string or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| state | 예 | enum live, scheduled, expired, revoked | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## platformSupport.active

`POST /api/rpc/platformSupport/active`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academySlug | 예 | string | minLength=1 |

### 응답 (`json` 결과)

루트: object or null. See the exact nested schema in OpenAPI.

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.getPage

`POST /api/rpc/points/getPage`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| period | 아니요 | enum all, day, week, month | — |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| subjectName | 예 | string | minLength=1; maxLength=200 |
| period | 예 | object | — |
| standing | 예 | object | — |
| leaderboard | 예 | one of: object, object or null | — |
| rules | 예 | object | — |
| ledger | 예 | object or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.listLedger

`POST /api/rpc/points/listLedger`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| pageSize | 아니요 | integer | maximum=100; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| page | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| pageSize | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| totalRows | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.getClassBoard

`POST /api/rpc/points/getClassBoard`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| period | 아니요 | enum all, day, week, month | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| period | 예 | object | — |
| className | 예 | string or null | — |
| leaderboard | 예 | one of: object, object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.getOverviewBoard

`POST /api/rpc/points/getOverviewBoard`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| period | 예 | object | — |
| leaderboard | 예 | one of: object, object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.policy.get

`POST /api/rpc/points.policy/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| policy | 예 | object | — |
| isCustom | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.policy.update

`POST /api/rpc/points.policy/update`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| policy | 예 | object | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| policy | 예 | object | — |
| isCustom | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## points.policy.reset

`POST /api/rpc/points.policy/reset`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| policy | 예 | object | — |
| isCustom | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## studentSession.begin

`POST /api/rpc/studentSession/begin`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| deadline | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## studentSession.current

`POST /api/rpc/studentSession/current`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| deadline | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## studentSession.extend

`POST /api/rpc/studentSession/extend`

### 입력 (`json` 래퍼)

루트: object. 최상위 필드 없음.

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| deadline | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listStudents

`POST /api/rpc/teacherProgress/listStudents`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseIds | 아니요 | array of string (uuid) | maxItems=50 |
| moduleId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| statuses | 아니요 | array of enum not_started, in_progress, solved | — |
| attention | 아니요 | array of enum repeated_failures, stalled, long_solve | — |
| q | 아니요 | string | maxLength=120 |
| sort | 아니요 | enum student, completion, attempts, accepted, lastActivity, attention | — |
| direction | 아니요 | enum asc, desc | — |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| summary | 예 | object | — |
| rows | 예 | array of object | — |
| facets | 예 | object | — |
| pagination | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.getStudentDetail

`POST /api/rpc/teacherProgress/getStudentDetail`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseIds | 아니요 | array of string (uuid) | maxItems=50 |
| moduleId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| statuses | 아니요 | array of enum not_started, in_progress, solved | — |
| attention | 아니요 | array of enum repeated_failures, stalled, long_solve | — |
| q | 아니요 | string | maxLength=120 |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| student | 예 | object | — |
| rows | 예 | array of object | — |
| facets | 예 | object | — |
| pagination | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listAttempts

`POST /api/rpc/teacherProgress/listAttempts`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| problemTitle | 예 | string | minLength=1; maxLength=200 |
| studentName | 예 | string | minLength=1; maxLength=200 |
| attempts | 예 | array of object | — |
| pagination | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listCurriculum

`POST /api/rpc/teacherProgress/listCurriculum`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| q | 아니요 | string | maxLength=120 |
| courseIds | 아니요 | array of string (uuid) | maxItems=50 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| summary | 예 | object | — |
| courses | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listCourseOutline

`POST /api/rpc/teacherProgress/listCourseOutline`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| q | 아니요 | string | maxLength=120 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| course | 예 | object | — |
| modules | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listLectureProblems

`POST /api/rpc/teacherProgress/listLectureProblems`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| lecture | 예 | object | — |
| rows | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.listProblemStudents

`POST /api/rpc/teacherProgress/listProblemStudents`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | maximum=9007199254740991; exclusiveMinimum=0 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| problem | 예 | object | — |
| rows | 예 | array of object | — |
| pagination | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## teacherProgress.getSubmissionReview

`POST /api/rpc/teacherProgress/getSubmissionReview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| submissionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| submissionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| materialId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| studentName | 예 | string | minLength=1; maxLength=200 |
| problemTitle | 예 | string | minLength=1; maxLength=200 |
| courseTitle | 예 | string | minLength=1; maxLength=200 |
| moduleTitle | 예 | string | minLength=1; maxLength=200 |
| lectureTitle | 예 | string | minLength=1; maxLength=200 |
| outlineNumber | 예 | string or null | — |
| accepted | 예 | boolean | — |
| score | 예 | integer | minimum=0; maximum=100 |
| passedCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| totalCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| runtimeMs | 예 | integer or null | — |
| solveElapsedSec | 예 | integer or null | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| code | 예 | string | — |
| language | 예 | string | minLength=1; maxLength=40 |
| statement | 예 | string or null | — |
| cases | 예 | array of object | — |
| hiddenPassed | 예 | integer | minimum=0; maximum=9007199254740991 |
| hiddenTotal | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyOperationsOverview.get

`POST /api/rpc/academyOperationsOverview/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| range | 아니요 | enum 7d, 30d, all | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academy | 예 | object | — |
| completion | 예 | object | — |
| period | 예 | object | — |
| generatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| activityTrackedSince | 예 | string (date-time) or null | — |
| scale | 예 | object | — |
| activeLearnerRate | 예 | object | — |
| queue | 예 | object | — |
| growth | 예 | object | — |
| recentJoins | 예 | array of object | maxItems=5 |
| classes | 예 | array of object | maxItems=100 |
| classesTruncated | 예 | boolean | — |
| highlightClassId | 예 | string (uuid) or null | — |
| problems | 예 | array of object | maxItems=5 |
| recentChanges | 예 | array of object | maxItems=5 |
| unavailable | 예 | array of enum attention, growth, learning, problems, activity | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyOperationsProfile.update

`POST /api/rpc/academyOperationsProfile/update`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| addressLine1 | 예 | string or null | — |
| addressLine2 | 예 | string or null | — |
| locality | 예 | string or null | — |
| region | 예 | string or null | — |
| postalCode | 예 | string or null | — |
| countryCode | 예 | string or null or constant  | — |
| contactPhone | 예 | string or null | — |
| contactEmail | 예 | string (email) or null or constant  | — |
| timeZone | 예 | string | minLength=1; maxLength=64 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| id | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| name | 예 | string | minLength=1; maxLength=200 |
| slug | 예 | string | minLength=1; maxLength=80 |
| addressLine1 | 예 | string or null | — |
| addressLine2 | 예 | string or null | — |
| locality | 예 | string or null | — |
| region | 예 | string or null | — |
| postalCode | 예 | string or null | — |
| countryCode | 예 | string or null | — |
| contactPhone | 예 | string or null | — |
| contactEmail | 예 | string or null | — |
| timeZone | 예 | string | minLength=1; maxLength=64 |
| profileUpdatedAt | 예 | string (date-time) or null | — |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| cover | 아니요 | object or null | default=null |
| gallery | 아니요 | array of object | maxItems=6; default=[] |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeople.list

`POST /api/rpc/academyPeople/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | minimum=1; maximum=100000; default=1 |
| pageSize | 아니요 | constant 25 or constant 50 or constant 100 | default=25 |
| search | 아니요 | string | maxLength=120; default="" |
| roles | 아니요 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | maxItems=4; default=[] |
| statuses | 아니요 | array of enum INVITED, ACTIVE, SUSPENDED, LEFT | maxItems=4; default=[] |
| sort | 아니요 | enum displayName, username, email, role, status, joinedAt, updatedAt | default="updatedAt" |
| direction | 아니요 | enum asc, desc | default="desc" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | constant 25 or constant 50 or constant 100 | — |
| pageCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| sort | 예 | enum displayName, username, email, role, status, joinedAt, updatedAt | — |
| direction | 예 | enum asc, desc | — |
| facets | 예 | object | — |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeople.students

`POST /api/rpc/academyPeople/students`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | minimum=1; maximum=100000; default=1 |
| pageSize | 아니요 | constant 25 or constant 50 or constant 100 | default=25 |
| search | 아니요 | string | maxLength=120; default="" |
| statuses | 아니요 | array of enum INVITED, ACTIVE, SUSPENDED, LEFT | maxItems=4; default=[] |
| classIds | 아니요 | array of string (uuid) | maxItems=50; default=[] |
| sort | 아니요 | enum displayName, username, studentNumber, schoolGrade, status, joinedAt, updatedAt | default="displayName" |
| direction | 아니요 | enum asc, desc | default="asc" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | constant 25 or constant 50 or constant 100 | — |
| pageCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| sort | 예 | enum displayName, username, studentNumber, schoolGrade, status, joinedAt, updatedAt | — |
| direction | 예 | enum asc, desc | — |
| facets | 예 | object | — |
| viewer | 예 | object | — |
| pointsEnabled | 예 | boolean | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeople.staff

`POST /api/rpc/academyPeople/staff`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| page | 아니요 | integer | minimum=1; maximum=100000; default=1 |
| pageSize | 아니요 | constant 25 or constant 50 or constant 100 | default=25 |
| search | 아니요 | string | maxLength=120; default="" |
| roles | 아니요 | array of enum TEACHER, TEAM_LEAD, MANAGER | maxItems=3; default=[] |
| statuses | 아니요 | array of enum INVITED, ACTIVE, SUSPENDED, LEFT | maxItems=4; default=[] |
| sort | 아니요 | enum displayName, username, role, employeeNumber, status, joinedAt, updatedAt | default="role" |
| direction | 아니요 | enum asc, desc | default="desc" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| rows | 예 | array of object | — |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | minimum=1; maximum=9007199254740991 |
| pageSize | 예 | constant 25 or constant 50 or constant 100 | — |
| pageCount | 예 | integer | minimum=0; maximum=9007199254740991 |
| sort | 예 | enum displayName, username, role, employeeNumber, status, joinedAt, updatedAt | — |
| direction | 예 | enum asc, desc | — |
| facets | 예 | object | — |
| viewer | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeople.student

`POST /api/rpc/academyPeople/student`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| identity | 예 | object | — |
| courses | 예 | array of object | — |
| classes | 예 | array of object | — |
| standing | 아니요 | array of object | — |
| work | 예 | object | — |
| guardian | 아니요 | object | — |
| viewer | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeople.staffMember

`POST /api/rpc/academyPeople/staffMember`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| membershipId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| identity | 예 | object | — |
| roles | 예 | array of enum STUDENT, TEACHER, TEAM_LEAD, MANAGER | minItems=1 |
| academyTitle | 예 | string or null | — |
| classes | 예 | object | — |
| contact | 아니요 | object | — |
| viewer | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeopleImport.get

`POST /api/rpc/academyPeopleImport/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, EXPIRED, FAILED | — |
| originalFilename | 예 | string | minLength=1; maxLength=255 |
| total | 예 | integer | minimum=0; maximum=9007199254740991 |
| ready | 예 | integer | minimum=0; maximum=9007199254740991 |
| warning | 예 | integer | minimum=0; maximum=9007199254740991 |
| error | 예 | integer | minimum=0; maximum=9007199254740991 |
| rows | 예 | array of object | maxItems=500 |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |
| expiresAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeopleImport.commit

`POST /api/rpc/academyPeopleImport/commit`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| acknowledgeWarnings | 아니요 | boolean | default=false |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, EXPIRED, FAILED | — |
| invited | 예 | integer | minimum=0; maximum=9007199254740991 |
| skipped | 예 | integer | minimum=0; maximum=9007199254740991 |
| failed | 예 | integer | minimum=0; maximum=9007199254740991 |
| rows | 예 | array of object | maxItems=500 |
| committedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeopleImport.result

`POST /api/rpc/academyPeopleImport/result`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| sessionId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| status | 예 | enum PREVIEW_READY, COMMITTING, COMPLETED, EXPIRED, FAILED | — |
| invited | 예 | integer | minimum=0; maximum=9007199254740991 |
| skipped | 예 | integer | minimum=0; maximum=9007199254740991 |
| failed | 예 | integer | minimum=0; maximum=9007199254740991 |
| rows | 예 | array of object | maxItems=500 |
| committedAt | 예 | string (date-time) or null | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeopleBulk.preview

`POST /api/rpc/academyPeopleBulk/preview`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| selection | 예 | one of: object, object | — |
| options | 예 | one of: object, object, object, object | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| kind | 예 | enum ENROLL, ROLE_CHANGE, SUSPEND, RESTORE | — |
| affected | 예 | integer | minimum=0; maximum=9007199254740991 |
| blocked | 예 | integer | minimum=0; maximum=9007199254740991 |
| consequences | 예 | array of object | — |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyPeopleBulk.run

`POST /api/rpc/academyPeopleBulk/run`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| selection | 예 | one of: object, object | — |
| options | 예 | one of: object, object, object, object | — |
| idempotencyKey | 예 | string | minLength=8; maxLength=128 |
| peopleRevision | 예 | integer | minimum=0; maximum=9007199254740991 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| operationId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| kind | 예 | enum ENROLL, ROLE_CHANGE, SUSPEND, RESTORE | — |
| status | 예 | enum PENDING, COMPLETED, FAILED | — |
| requested | 예 | integer | minimum=0; maximum=9007199254740991 |
| succeeded | 예 | integer | minimum=0; maximum=9007199254740991 |
| failed | 예 | integer | minimum=0; maximum=9007199254740991 |
| rows | 예 | array of object | maxItems=500 |
| replayed | 예 | boolean | — |
| createdAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitationDelivery.list

`POST /api/rpc/academyInvitationDelivery/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| invitations | 예 | array of object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyInvitationDelivery.resend

`POST /api/rpc/academyInvitationDelivery/resend`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| invitationId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| invitation | 예 | object | — |
| delivery | 예 | object | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyCurriculumOverview.get

`POST /api/rpc/academyCurriculumOverview/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| range | 아니요 | enum 7d, 30d, all | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academy | 예 | object | — |
| period | 예 | object | — |
| generatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |
| activityTrackedSince | 예 | string (date-time) or null | — |
| catalog | 예 | object | — |
| roster | 예 | object | — |
| blockers | 예 | array of object | — |
| changes | 예 | array of object | maxItems=5 |
| effectiveness | 예 | object | — |
| courses | 예 | array of object | maxItems=100 |
| coursesTruncated | 예 | boolean | — |
| unavailable | 예 | array of enum blockers, changes, effectiveness, courses, roster | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyTeacherOverview.get

`POST /api/rpc/academyTeacherOverview/get`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| range | 아니요 | enum 7d, 30d, all | — |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| scope | 예 | object | — |
| filters | 예 | object | — |
| queue | 예 | array of object | maxItems=5 |
| queueTotal | 예 | integer | minimum=0; maximum=9007199254740991 |
| ledger | 예 | object | — |
| participation | 예 | array of object | maxItems=250 |
| participationTruncated | 예 | boolean | — |
| scorePreview | 예 | array of object | maxItems=5 |
| mostActive | 예 | array of object | maxItems=5 |
| leastActive | 예 | array of object | maxItems=5 |
| readiness | 예 | array of object | maxItems=3 |
| problems | 예 | array of object | maxItems=5 |
| unavailable | 예 | array of enum queue, ledger, participation, scores, activity, readiness, problems | — |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyTeacherStudents.list

`POST /api/rpc/academyTeacherStudents/list`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| courseId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| moduleId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| lectureId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| problemId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| range | 아니요 | enum 7d, 30d, all | — |
| search | 아니요 | string | maxLength=80 |
| attention | 아니요 | array of enum repeated_failures, stalled, long_solve, inactive, low_participation | maxItems=5 |
| sort | 아니요 | enum score, activeTime, lastActive, submissions, solved, name | — |
| direction | 아니요 | enum asc, desc | — |
| page | 아니요 | integer | maximum=10000; exclusiveMinimum=0 |
| pageSize | 아니요 | integer | minimum=-9007199254740991; maximum=9007199254740991 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| scope | 예 | object | — |
| filters | 예 | object | — |
| rows | 예 | array of object | — |
| totalRows | 예 | integer | minimum=0; maximum=9007199254740991 |
| page | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| pageSize | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| pageCount | 예 | integer | maximum=9007199254740991; exclusiveMinimum=0 |
| sort | 예 | enum score, activeTime, lastActive, submissions, solved, name | — |
| direction | 예 | enum asc, desc | — |
| search | 예 | string | — |
| attention | 예 | array of enum repeated_failures, stalled, long_solve, inactive, low_participation | maxItems=5 |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.

## academyTeacherStudents.roster

`POST /api/rpc/academyTeacherStudents/roster`

### 입력 (`json` 래퍼)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| academyId | 예 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| classId | 아니요 | string (uuid) | pattern="^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\|00000000-0000-0000-0000-000000000000\|ffffffff-ffff-ffff-ffff-ffffffffffff)$" |
| search | 아니요 | string | maxLength=120 |

### 응답 (`json` 결과)

| 필드 | 필수 | 타입 | 제약·기본값 |
|---|---|---|---|
| classes | 예 | array of object | — |
| classOptions | 예 | array of object | — |
| pointsEnabled | 예 | boolean | — |
| truncated | 예 | boolean | — |
| generatedAt | 예 | string (date-time) | pattern="^(?:(?:\\d\\d[2468][048]\|\\d\\d[13579][26]\|\\d\\d0[48]\|[02468][048]00\|[13579][26]00)-02-29\|\\d{4}-(?:(?:0[13578]\|1[02])-(?:0[1-9]\|[12]\\d\|3[01])\|(?:0[469]\|11)-(?:0[1-9]\|[12]\\d\|30)\|(?:02)-(?:0[1-9]\|1\\d\|2[0-8])))T(?:(?:[01]\\d\|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z))$" |

계약: `packages/shared/src/api/orpc-contract.ts` 및 가져오는 네임스페이스 스키마. 미들웨어: `04-api-procedure-inventory.csv`의 해당 행.
