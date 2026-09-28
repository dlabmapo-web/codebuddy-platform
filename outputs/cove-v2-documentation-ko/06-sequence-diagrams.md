# Cove Studio v2 시퀀스 다이어그램

담당: John. 기준: feat/cove-studio-v2 / b095b679. 기존 업무 흐름의 상호작용을 설명하며 별도로 완료된 아키텍처·사용자 흐름을 보완합니다. 정확한 페이로드는 API 계약을 참조하십시오.

## SQ-01 로그인 및 역할별 화면 이동

요구사항: FR-AUTH, FR-ROLE. 소스: `packages/web/src/app/(auth)/actions.ts; packages/api/src/auth/auth.router.ts; packages/web/src/lib/orpc-server.ts`.

```mermaid
sequenceDiagram
    actor U as 계정 소유자
    participant W as Next.js 인증 액션
    participant A as Cove API
    participant S as Supabase Auth
    U->>W: ID, 비밀번호 및 보안 확인
    W->>A: auth.resolveSignInEmail(identifier)
    A-->>W: 확인된 주소 또는 존재 여부를 숨긴 주소
    W->>S: 비밀번호 로그인
    alt 잘못된 자격 증명
      S-->>W: 인증 실패
      W-->>U: 일반 로그인 오류
    else 유효한 자격 증명
      S-->>W: 세션
      W->>A: 인증 계정·bootstrap 요청
      A-->>W: 계정 및 학원 멤버십
      W-->>U: 권한 있는 시작 화면과 보유 역할 탐색
    end
```

## SQ-02 가입 신청 승인

요구사항: FR-JOIN. 소스: `packages/api/src/academies/academy-join-request.service.ts; packages/shared/src/auth/roles.ts`.

```mermaid
sequenceDiagram
    actor R as 검토자
    participant W as 가입 신청 화면
    participant A as 학원 API
    participant G as 학원 접근 검사
    participant DB as PostgreSQL
    R->>W: 대기 신청 검토 및 역할 선택
    W->>A: academyJoinRequests.review
    A->>G: applications.review 권한 요구
    G-->>A: 행위자 및 보유 역할
    A->>A: 역할 승인 범위 확인
    alt 금지된 대상 역할 또는 오래된 요청
      A-->>W: 도메인 오류
    else 유효한 승인
      A->>DB: 트랜잭션으로 신청·멤버십 처리
      DB-->>A: 승인 신청 및 멤버십 상태
      A-->>W: 갱신된 요청
      W-->>R: 갱신된 대기열
    end
```

## SQ-03 제출 채점 및 결과 전달

요구사항: FR-GRADE, FR-RESULT. 소스: `packages/api/src/learn/submission.service.ts; packages/api/src/learn/submission.controller.ts; packages/api/src/judge`.

```mermaid
sequenceDiagram
    actor S as 학생
    participant W as 문제 작업 공간
    participant A as 제출 API
    participant DB as PostgreSQL
    participant Q as 채점 큐 및 워커
    participant P as 웹 SSE 프록시
    S->>W: 선택한 반에서 현재 코드 제출
    W->>A: learn.submit(academyId, classId, materialId, code)
    A->>A: 사용자, 임대, 역할, 요청 제한 및 접근 경로 검사
    A->>DB: 코드·테스트·표시 이름·리비전을 트랜잭션으로 고정
    alt 진행 중 시도 또는 잘못된 범위
      DB-->>A: 충돌 또는 유효성 검사 실패
      A-->>W: 도메인 오류
    else 접수 완료
      DB-->>A: submissionId
      A->>Q: submissionId 큐 등록
      A-->>W: submissionId 및 totalCount
      W->>P: 본인 제출 스트림 열기
      P->>A: Bearer 및 학원 맥락 전달
      A->>A: 스트림 연결 전에 소유권 확인
      Q->>DB: 불변 채점 스냅샷 조회
      Q->>Q: 실행 제한 내 테스트 실행
      Q->>DB: 판정 및 진도 저장
      Q-->>A: 큐 진행·완료 이벤트
      A-->>P: SSE progress/result
      P-->>W: 이벤트 전달
      W-->>S: 판정 및 안전한 테스트 상세
    end
```

## SQ-04 강사 실시간 관찰 및 권한 철회

요구사항: FR-MONITOR, FR-DRAFT. 소스: `packages/api/src/monitoring/monitoring.gateway.ts; packages/api/src/monitoring/monitoring-access.service.ts`.

```mermaid
sequenceDiagram
    actor T as 배정 강사
    participant TW as 강사 브라우저
    participant G as 모니터링 게이트웨이
    participant A as 모니터링 권한 검사
    participant SW as 학생 브라우저
    participant DB as 영속 저장소
    T->>TW: 권한 있는 학생 맥락 열기
    TW->>G: student.watch.start
    G->>A: 기능·강사 역할·배정·실시간 관찰 검사
    alt 권한 없음 또는 플랫폼 권한만 보유
      A-->>G: 접근 거절
      G-->>TW: 실패 확인 응답
    else 권한 확인 완료
      G->>DB: 모니터링 방문 기록
      G-->>TW: watch.started 및 현재 맥락
      SW->>G: document.update / presence.publish
      G-->>TW: 허용된 문서·접속 상태 변경
      opt 협업 모드 허용 시
        TW->>G: student.watch.mode 후 document.update
        G-->>SW: 허용된 협업 변경
      end
      G->>DB: 확인된 문서 상태 저장
      G-->>TW: document.persisted
      alt 배정·역할·수강 등록·기능 권한 철회
        G->>A: 접근 재검증
        G-->>TW: watch.ended / 접근 철회
      else 강사 퇴장
        TW->>G: student.watch.stop
        G->>DB: 방문 종료
      end
    end
```

## SQ-05 커리큘럼 파일 미리보기 및 확정

요구사항: FR-IMPORT. 소스: `packages/api/src/content/import/content-import.controller.ts; packages/api/src/content/import/content-import.service.ts`.

```mermaid
sequenceDiagram
    actor L as 커리큘럼 작성자
    participant W as 가져오기 마법사
    participant A as 가져오기 API
    participant DB as PostgreSQL
    L->>W: 통합 문서 선택
    W->>A: academyId·courseId와 원시 바이트 POST
    A->>A: 인증·권한·파일 한도·유효성 검사
    A->>DB: 미리보기와 콘텐츠 리비전 저장
    A-->>W: 미리보기 및 행별 진단
    alt 잘못된 통합 문서
      W-->>L: 확정 전 오류 수정
    else 유효한 미리보기
      L->>W: 검토한 가져오기 확정
      W->>A: 멱등 맥락으로 세션 확정
      A->>DB: 강좌 잠금 및 리비전 비교
      alt 미리보기 이후 강좌 변경
        A-->>W: 오래된 미리보기 충돌
      else 현재 리비전 일치
        A->>DB: 키 기반 변경을 트랜잭션 적용하고 리비전 증가
        A-->>W: 확정 결과
        W-->>L: 가져오기 결과
      end
    end
```

## SQ-06 학생 도움 대기열

요구사항: FR-HELP. 소스: `packages/api/src/monitoring/help-request.service.ts; packages/shared/src/monitoring/help-requests.ts`.

```mermaid
sequenceDiagram
    actor S as 학생
    actor T as 배정 강사
    participant A as 도움 요청 API
    participant DB as PostgreSQL
    participant N as 실시간 알림
    S->>A: monitoring.requestHelp(반·자료)
    A->>A: 본인 학생 및 반 맥락 확인
    A->>DB: WAITING 요청 생성 및 처리 기록 저장
    A->>N: help.request.changed
    N-->>T: 갱신된 반 대기열
    T->>A: monitoring.claimHelpRequest
    A->>A: 강사 배정 검사
    A->>DB: 원자적 상태·버전 전이
    alt 동시 담당 또는 오래된 버전
      A-->>T: 충돌
    else 담당 성공
      DB-->>A: 강사 소유자와 IN_PROGRESS
      A->>N: 갱신된 요청
      T->>A: 요청 해결 또는 반환
      A->>DB: RESOLVED 또는 WAITING
      A->>N: 갱신된 요청
    end
    opt 학생이 적격 본인 요청 취소 시
      S->>A: monitoring.cancelMyHelpRequest
      A->>DB: 소유권·상태 검사 후 CANCELLED
    end
```

## SQ-07 라이브러리 도입

요구사항: FR-LIBRARY. 소스: `packages/api/src/content/library/academy-library.service.ts; packages/api/prisma/schema.prisma`.

```mermaid
sequenceDiagram
    actor M as 학원 커리큘럼 담당
    participant W as 라이브러리 화면
    participant A as 라이브러리 서비스
    participant DB as PostgreSQL
    M->>W: 도입할 라이브러리 강좌 선택
    W->>A: 학원 라이브러리 도입 명령
    A->>A: 대상 학원 권한 및 원본 이용 가능 여부 검사
    alt 사용 중단 또는 이용 불가 원본
      A-->>W: 도입 거절
    else 이용 가능
      A->>DB: 트랜잭션으로 커리큘럼 계층 복사
      A->>DB: sourceCourseId 및 원본·기준 리비전 저장
      DB-->>A: 학원 복사본
      A-->>W: 새 강좌 참조
      W-->>M: 도입한 강좌 열기
    end
```

## SQ-08 공유 강좌의 반 맥락

요구사항: FR-CLASS, FR-LEARN, FR-POINTS. 소스: `packages/api/src/learn/learning-class-context.service.ts`. 소스 기준 상호작용이며 운영 플랫폼에서 변경 경로를 실행하지 않았습니다.

```mermaid
sequenceDiagram
    actor S as 학생
    participant W as 학습 작업 공간
    participant A as 학습 API
    participant C as 반 맥락 결정 서비스
    participant DB as PostgreSQL
    S->>W: 배정 강좌 문제 열기
    W->>A: 문제 bootstrap 조회
    A->>C: 학원·사용자·강좌·선택 반 결정
    C->>DB: 활성 학생 멤버십 및 해당 강좌의 활성 등록 반 조회
    alt 적격 반 없음 또는 요청 반 부적격
      C-->>A: COURSE_NOT_FOUND
      A-->>W: 이용 불가
    else 적격 반 한 개 또는 유효한 요청 반
      C-->>A: 선택 classId 및 membershipId
      A-->>W: 허용된 문제 및 반 맥락
    else 선택 없이 적격 반 여러 개
      C-->>A: 반 목록 및 null classId
      A-->>W: 적격 선택지
      W-->>S: 반 선택 안내
      S->>W: 반 선택
      W->>A: 선택 classId로 재조회
      A->>C: 현재 자격 재검증
      C-->>A: 유효한 반 맥락
      A-->>W: 문제 맥락
    end
```

## SQ-09 보상 원장 및 중복 방지

요구사항: FR-POINTS, FR-GRADE. 소스: `packages/api/src/points/point-award.service.ts`. 소스 기준 상호작용이며 운영 플랫폼에서 변경 경로를 실행하지 않았습니다.

```mermaid
sequenceDiagram
    participant E as 적격 서버 이벤트
    participant P as 포인트 지급 서비스
    participant DB as 호출자 트랜잭션
    E->>P: 멤버십·반 맥락으로 지급 요청
    P->>P: 기능 및 학원 정책 확인
    alt 기능 비활성 또는 부적격 이벤트
      P-->>E: 지급 없음
    else 적격 이벤트
      P->>DB: 멤버십·반·현지 날짜별 유효 지급 합계
      DB-->>P: 적립 금액
      P->>P: 일일 한도 적용
      alt 잔여 금액 0
        P-->>E: 원장 행 생성 없음
      else 양수 금액
        P->>DB: dedupeKey·skipDuplicates로 PointAward 삽입
        alt 중복 키
          DB-->>P: 기록 건수 0
          P-->>E: 잔액 변경 없음
        else 새 원장 항목
          DB-->>P: 기록 건수 1
          P->>DB: StudentPointBalance upsert 및 증가
          P-->>E: 호출자 트랜잭션 내 지급 기록
        end
      end
    end
```

## SQ-10 구성원 가져오기 미리보기 및 확정

요구사항: FR-PEOPLE, FR-JOIN. 소스: `packages/api/src/manage/people-import.service.ts`. 소스 기준 상호작용이며 운영 플랫폼에서 변경 경로를 실행하지 않았습니다.

```mermaid
sequenceDiagram
    actor M as 학원 관리자
    participant W as 구성원 가져오기 마법사
    participant A as 구성원 가져오기 서비스
    participant DB as PostgreSQL
    participant D as 초대 전달 서비스
    M->>W: CSV 또는 XLSX 업로드
    W->>A: 한도 내 파일 업로드
    A->>A: 파싱·권한·행 유효성 검사
    A->>DB: 만료 및 확정 맥락과 미리보기 저장
    A-->>W: 미리보기 및 행별 진단
    M->>W: 검토한 미리보기 확정
    W->>A: academyPeopleImport.commit
    A->>DB: 세션 및 현재 상태 조회
    alt 이미 완료됨
      A-->>W: 기록된 결과
    else 만료·처리 중·잘못된 상태
      A-->>W: 상태별 오류
    else 미리보기 준비 완료
      A->>DB: PREVIEW_READY에서 COMMITTING으로 조건부 전이
      A->>DB: 트랜잭션 내 학원 잠금 및 현재 데이터 재검증
      alt 트랜잭션 성공
        A->>DB: 초대 및 완료 결과 저장
        A->>D: 트랜잭션 이후 적격 초대 전달
        A-->>W: 행별 결과 및 별도 전달 상태
      else 트랜잭션 실패
        DB-->>A: 도메인 변경 롤백
        A->>DB: 세션을 FAILED로 기록
        A-->>W: 도메인 일부 확정 없이 실패
      end
    end
```
