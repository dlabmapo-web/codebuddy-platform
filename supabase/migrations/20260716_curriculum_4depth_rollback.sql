-- Rollback: chapters → categories, restore problems.category_id
-- WARNING: subjects/stages created after migration (beyond seed) are discarded.

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  order_no int NOT NULL DEFAULT 1,
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (id, title, description, order_no, is_published, created_at, updated_at)
SELECT id, title, description, order_no, is_published, created_at, updated_at
FROM chapters
ON CONFLICT (id) DO NOTHING;

ALTER TABLE problems ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES categories(id);

UPDATE problems
SET category_id = chapter_id
WHERE category_id IS NULL AND chapter_id IS NOT NULL;

ALTER TABLE problems DROP COLUMN IF EXISTS chapter_id;

DROP TABLE IF EXISTS chapters CASCADE;
DROP TABLE IF EXISTS stages CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
