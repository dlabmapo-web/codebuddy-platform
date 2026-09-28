# 모델 요약 외 SQL 제약

소스: `packages/api/prisma/migrations`의 순서가 있는 파일. 이 부록은 CHECK 문과 부분 고유 인덱스를 보존합니다. 전체 마이그레이션 이력을 기준으로 검토하십시오.

## 20260722140000_auth_foundation

```sql
CREATE UNIQUE INDEX "users_email_normalized_key" ON "users"(lower("email")) WHERE "email" IS NOT NULL;

CREATE UNIQUE INDEX "academy_invitations_one_pending_email_key" ON "academy_invitations"("academy_id", lower("email")) WHERE "status" = 'PENDING';

CREATE UNIQUE INDEX "academy_join_requests_one_pending_key" ON "academy_join_requests"("academy_id", "user_id") WHERE "status" = 'PENDING';
```

## 20260724010000_content_foundation

```sql
CREATE TABLE "course_versions" (
  "id" UUID NOT NULL,
  "course_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" "CourseVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "created_by_user_id" UUID NOT NULL,
  "published_by_user_id" UUID,
  "published_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "course_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_versions_version_number_positive" CHECK ("version_number" > 0)
);

CREATE TABLE "course_modules" (
  "id" UUID NOT NULL,
  "course_version_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "course_modules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_modules_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "lectures" (
  "id" UUID NOT NULL,
  "course_module_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "lectures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lectures_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "materials" (
  "id" UUID NOT NULL,
  "lecture_id" UUID NOT NULL,
  "type" "MaterialType" NOT NULL,
  "title" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "materials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "materials_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "programming_exercises" (
  "material_id" UUID NOT NULL,
  "course_version_id" UUID NOT NULL,
  "external_key" TEXT NOT NULL,
  "legacy_problem_no" INTEGER,
  "difficulty" "ExerciseDifficulty" NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "input_format" TEXT NOT NULL DEFAULT '',
  "output_format" TEXT NOT NULL DEFAULT '',
  "constraints" TEXT NOT NULL DEFAULT '',
  "starter_code" TEXT NOT NULL DEFAULT '',
  "language" "ExerciseLanguage" NOT NULL DEFAULT 'PYTHON',
  "time_limit_ms" INTEGER NOT NULL DEFAULT 2000,
  "memory_limit_mb" INTEGER NOT NULL DEFAULT 256,
  "ai_feedback_enabled" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "programming_exercises_pkey" PRIMARY KEY ("material_id"),
  CONSTRAINT "programming_exercises_limits_positive"
    CHECK ("time_limit_ms" > 0 AND "memory_limit_mb" > 0)
);

CREATE TABLE "exercise_test_cases" (
  "id" UUID NOT NULL,
  "exercise_material_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "input" TEXT NOT NULL,
  "expected_output" TEXT NOT NULL,
  "visibility" "TestCaseVisibility" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_test_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_test_cases_position_positive" CHECK ("position" > 0)
);

CREATE TABLE "exercise_hints" (
  "id" UUID NOT NULL,
  "exercise_material_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "trigger_expression" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "exercise_hints_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "exercise_hints_position_positive" CHECK ("position" > 0)
);

CREATE UNIQUE INDEX "courses_one_active_title_per_academy_key"
ON "courses"("academy_id", lower("title"))
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "course_versions_one_draft_per_course_key"
ON "course_versions"("course_id")
WHERE "status" = 'DRAFT';
```

## 20260731170000_student_grading

```sql
-- One in-flight submission per student per problem, enforced by the database
-- rather than by a read-then-write check in application code. v1 learned this
-- the hard way and could still race two concurrent submits past its guard.
-- Prisma cannot express a partial unique index, so it is written by hand and
-- the schema carries a matching comment.
CREATE UNIQUE INDEX "submissions_one_active_per_user_material"
    ON "submissions" ("user_id", "material_id")
    WHERE "status" IN ('QUEUED', 'RUNNING');
```

## 20260803150000_direct_editable_curriculum

```sql
CREATE UNIQUE INDEX "courses_one_visible_title_per_academy_key"
ON "courses"("academy_id", lower("title"))
WHERE "is_visible" = true;
```

## 20260804170000_teacher_live_monitoring

```sql
CREATE UNIQUE INDEX "teacher_monitoring_visits_one_open_per_teacher_idx"
  ON "teacher_monitoring_visits" ("teacher_membership_ref")
  WHERE "ended_at" IS NULL;
```

## 20260806120000_user_username

```sql
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_format"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9][a-z0-9_.-]{3,28}[a-z0-9]$');
```

## 20260818130000_people_operations_stage_two

```sql
CREATE UNIQUE INDEX "academy_media_one_cover_key"
  ON "academy_media" ("academy_id") WHERE "kind" = 'COVER';

CREATE UNIQUE INDEX "academy_media_gallery_position_key"
  ON "academy_media" ("academy_id", "position") WHERE "kind" = 'GALLERY';
```

## 20260821120000_student_points_and_class_ranking

```sql
it never wraps.
ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_weekday_check"
  CHECK ("weekday" BETWEEN 1 AND 7);

ALTER TABLE "class_schedule_slots"
  ADD CONSTRAINT "class_schedule_slots_window_check"
  CHECK ("start_minute" >= 0 AND "end_minute" > "start_minute");

-- Points are earned, never lost. The constraint is the design, not a guard:
-- there is no shape a deduction could travel in. §7.6.
ALTER TABLE "point_awards"
  ADD CONSTRAINT "point_awards_amount_positive_check" CHECK ("amount" > 0);
```

## 20260903120000_student_accounts_and_membership_roles

```sql
-- STUDENT is exclusive: a student's rows are about them, while every staff
-- role reads across students. Enforced in the service, and here so no future
-- caller can write the combination the application refuses.
ALTER TABLE "academy_membership_roles"
  ADD CONSTRAINT "academy_membership_roles_no_student"
  CHECK ("role" <> 'STUDENT');
```

## 20260903180000_content_library

```sql
-- At most one library per organization. Two would make "the library"
-- ambiguous in every sentence of the branch interface, and there is no
-- sensible rule for choosing between them.
--
-- A partial unique index, which Prisma's schema language cannot express:
-- `@@unique([organization_id, kind])` would forbid an organization having more
-- than one ordinary academy, which is the entire product.
CREATE UNIQUE INDEX "academies_one_library_per_organization"
    ON "academies"("organization_id")
    WHERE "kind" = 'LIBRARY';
```

## 20260909120000_console_operations

```sql
-- The counters are advanced by a worker and must never be able to describe a
-- run that did more than it planned, or a negative amount of work.
ALTER TABLE "platform_operation_runs"
    ADD CONSTRAINT "platform_operation_runs_counts_non_negative_check"
        CHECK ("planned_count" >= 0 AND "student_count" >= 0 AND "dispatched_count" >= 0
               AND "completed_count" >= 0 AND "failed_count" >= 0),
    ADD CONSTRAINT "platform_operation_runs_dispatched_within_plan_check"
        CHECK ("dispatched_count" <= "planned_count"),
    ADD CONSTRAINT "platform_operation_runs_settled_within_dispatched_check"
        CHECK ("completed_count" + "failed_count" <= "dispatched_count");

-- One in-flight run per target. This is the whole answer to "what happens when
-- two operators press the same button at once": the second INSERT fails and the
-- console names the first operator, rather than two runs racing in the queue.
--
-- Filtered, so a target may be re-run any number of times once the previous run
-- has settled. Prisma cannot express a partial unique index, so it is written
-- here — the same shape as `academy_join_requests_one_pending_key` and
-- `academy_invitations_one_pending_email_key` in the auth foundation migration.
CREATE UNIQUE INDEX "platform_operation_runs_one_in_flight_key"
    ON "platform_operation_runs" ("operation", "target_id")
    WHERE "status" IN ('PLANNING', 'RUNNING');
```

## 20260918000000_student_help_requests

```sql
CREATE TABLE "student_help_requests" (
  "id" UUID NOT NULL,
  "academy_id" UUID NOT NULL REFERENCES "academies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "class_id" UUID NOT NULL REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "student_membership_ref" UUID NOT NULL,
  "student_membership_id" UUID REFERENCES "academy_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "material_ref" UUID NOT NULL,
  "material_id" UUID REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "teacher_membership_ref" UUID,
  "teacher_membership_id" UUID REFERENCES "academy_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" "HelpRequestStatus" NOT NULL DEFAULT 'WAITING',
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMPTZ(6), "closed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  "closed_by_ref" UUID, "close_reason" TEXT,
  CONSTRAINT "student_help_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "help_request_claim_state" CHECK ((status = 'IN_PROGRESS') = (teacher_membership_ref IS NOT NULL AND claimed_at IS NOT NULL)),
  CONSTRAINT "help_request_closed_state" CHECK ((status IN ('RESOLVED', 'CANCELLED')) = (closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX "help_request_one_active_per_class" ON "student_help_requests" ("academy_id", "class_id", "student_membership_ref") WHERE "status" IN ('WAITING', 'IN_PROGRESS');
```
