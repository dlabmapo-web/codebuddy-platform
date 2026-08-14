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

## 프로필 이미지 버킷 (`20260814_profile_images_bucket.sql`)

Supabase Dashboard → SQL Editor에서 `20260814_profile_images_bucket.sql`을
실행하세요. 비공개 `profile-images` 버킷을 만들고, 브라우저에서의 직접
읽기·쓰기를 기본 거부로 유지합니다. 읽기는 항상 API가 권한을 확인한 뒤
짧은 수명의 서명 URL을 발급하는 방식으로만 이루어집니다.
