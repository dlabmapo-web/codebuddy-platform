-- 4-depth curriculum: subjects → stages → chapters → problems
-- Run in Supabase SQL Editor. Existing categories become chapters under a default subject/stage.

-- 1. New hierarchy tables
CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  order_no int NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  order_no int NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES stages(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  order_no int NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stages_subject_id ON stages(subject_id);
CREATE INDEX IF NOT EXISTS idx_stages_order_no ON stages(subject_id, order_no);
CREATE INDEX IF NOT EXISTS idx_chapters_stage_id ON chapters(stage_id);
CREATE INDEX IF NOT EXISTS idx_chapters_order_no ON chapters(stage_id, order_no);
CREATE INDEX IF NOT EXISTS idx_subjects_order_no ON subjects(order_no);

-- 2. Seed default subject + stage (fixed ids for idempotent re-runs)
INSERT INTO subjects (id, title, description, order_no, is_published)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  '기본 과목',
  '기존 카테고리 이관용 기본 과목',
  1,
  true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO stages (id, subject_id, title, description, order_no, is_published)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  '1단계',
  '기존 카테고리 이관용 기본 단계',
  1,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 3. Migrate categories → chapters (keep same ids for simple problem remapping)
INSERT INTO chapters (id, stage_id, title, description, order_no, is_published, created_at, updated_at)
SELECT
  c.id,
  '00000000-0000-4000-8000-000000000002',
  c.title,
  c.description,
  c.order_no,
  c.is_published,
  c.created_at,
  c.updated_at
FROM categories c
ON CONFLICT (id) DO NOTHING;

-- 4. Remap problems.category_id → chapter_id
ALTER TABLE problems ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES chapters(id) ON DELETE RESTRICT;

UPDATE problems
SET chapter_id = category_id
WHERE chapter_id IS NULL AND category_id IS NOT NULL;

-- Drop orphaned problems without chapter (should be none after migration)
-- Keep nullable briefly if any nulls remain; then enforce when safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM problems WHERE chapter_id IS NULL) THEN
    ALTER TABLE problems ALTER COLUMN chapter_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_problems_chapter_id ON problems(chapter_id);
CREATE INDEX IF NOT EXISTS idx_problems_chapter_order ON problems(chapter_id, order_no);

ALTER TABLE problems DROP COLUMN IF EXISTS category_id;

-- 5. Drop legacy categories
DROP TABLE IF EXISTS categories CASCADE;
