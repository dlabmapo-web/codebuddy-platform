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
