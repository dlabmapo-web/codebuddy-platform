# Supabase migrations

## 4뎁스 커리큘럼 (`20260716_curriculum_4depth.sql`)

Supabase Dashboard → SQL Editor에서 `20260716_curriculum_4depth.sql` 내용을 실행하세요.

이관 내용:
- `subjects` / `stages` / `chapters` 테이블 생성
- 기본 과목·1단계 시드
- 기존 `categories` → `chapters` (동일 id)
- `problems.category_id` → `chapter_id`
- `categories` 테이블 삭제

롤백이 필요하면 `20260716_curriculum_4depth_rollback.sql`을 실행하세요.

## 서버 권한 채점 (`20260727_authoritative_judging.sql`)

학생 제출을 Judge0에서 비동기 채점하기 전에 Supabase Dashboard → SQL
Editor에서 `20260727_authoritative_judging.sql`을 실행하세요.

이관 내용:
- 제출 상태에 `judging` / `judge_error` 추가
- 제출별 비공개 테스트 결과 테이블 생성
- 한 학생·문제당 동시 채점 1건 제한
- 분산 Netlify Functions용 제출 속도 제한 버킷/RPC 생성
- 예제/비공개 테스트케이스 플래그 일관성 제약 추가
