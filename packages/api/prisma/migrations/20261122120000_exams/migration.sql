-- Exams (테스트): docs/superpowers/specs/2026-11-20-exam-tests-design.md (QA S-06).
-- Additive only: every existing lecture becomes STANDARD and every existing
-- submission keeps a NULL attempt, so nothing that exists today changes.

ALTER TYPE "AcademyFeature" ADD VALUE 'EXAMS';

CREATE TYPE "LectureKind" AS ENUM ('STANDARD', 'TEST');
CREATE TYPE "TestType" AS ENUM ('NONE', 'DIAGNOSTIC', 'FORMATIVE', 'SUMMATIVE');
CREATE TYPE "TestAttemptEndReason" AS ENUM ('STUDENT', 'TIME_UP', 'PERIOD_CLOSED', 'STAFF');

ALTER TABLE lectures ADD COLUMN kind "LectureKind" NOT NULL DEFAULT 'STANDARD';

CREATE TABLE lecture_tests (
  lecture_id          UUID PRIMARY KEY REFERENCES lectures(id) ON DELETE CASCADE ON UPDATE CASCADE,
  guide               TEXT NOT NULL DEFAULT '',
  summary             TEXT NOT NULL DEFAULT '',
  test_type           "TestType" NOT NULL DEFAULT 'NONE',
  time_limit_minutes  INTEGER,
  use_preparation     BOOLEAN NOT NULL DEFAULT TRUE,
  review_after_end    BOOLEAN NOT NULL DEFAULT FALSE,
  allow_self_retake   BOOLEAN NOT NULL DEFAULT FALSE,
  -- {materialId: pointsHundredths}. A material missing here is worth 0.
  points              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT lecture_tests_time_limit CHECK (time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 600)
);

CREATE TABLE class_lecture_tests (
  class_id            UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE ON UPDATE CASCADE,
  lecture_id          UUID NOT NULL REFERENCES lecture_tests(lecture_id) ON DELETE CASCADE ON UPDATE CASCADE,
  opens_at            TIMESTAMPTZ(6),
  closes_at           TIMESTAMPTZ(6),
  results_released_at TIMESTAMPTZ(6),
  updated_by_user_id  UUID NOT NULL,
  updated_at          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (class_id, lecture_id),
  CONSTRAINT class_lecture_tests_period CHECK (opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at)
);
CREATE INDEX class_lecture_tests_lecture_id_idx ON class_lecture_tests (lecture_id);

CREATE TABLE test_attempts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id        UUID NOT NULL REFERENCES lecture_tests(lecture_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  class_id          UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  attempt_no        INTEGER NOT NULL,
  consented_at      TIMESTAMPTZ(6) NOT NULL,
  clock_drift_ms    INTEGER,
  started_at        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  deadline_at       TIMESTAMPTZ(6),
  ended_at          TIMESTAMPTZ(6),
  end_reason        "TestAttemptEndReason",
  ended_by_user_id  UUID,
  items_snapshot    JSONB NOT NULL,
  retake_granted_at TIMESTAMPTZ(6),
  CONSTRAINT test_attempts_end CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE UNIQUE INDEX test_attempts_class_id_lecture_id_user_id_attempt_no_key ON test_attempts (class_id, lecture_id, user_id, attempt_no);
CREATE INDEX test_attempts_class_id_lecture_id_ended_at_idx ON test_attempts (class_id, lecture_id, ended_at);
CREATE INDEX test_attempts_user_id_lecture_id_idx ON test_attempts (user_id, lecture_id);
-- At most one open attempt per student, class and test: concurrent starts collide here.
CREATE UNIQUE INDEX test_attempts_one_open ON test_attempts (class_id, lecture_id, user_id) WHERE ended_at IS NULL;

ALTER TABLE submissions ADD COLUMN test_attempt_id UUID REFERENCES test_attempts(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE manual_submissions ADD COLUMN test_attempt_id UUID REFERENCES test_attempts(id) ON DELETE RESTRICT ON UPDATE CASCADE;
-- "The last submission of this attempt for this problem."
CREATE INDEX submissions_attempt_last ON submissions (test_attempt_id, source_material_id, created_at DESC) WHERE test_attempt_id IS NOT NULL;
CREATE INDEX manual_submissions_attempt_last ON manual_submissions (test_attempt_id, material_id, created_at DESC) WHERE test_attempt_id IS NOT NULL;
