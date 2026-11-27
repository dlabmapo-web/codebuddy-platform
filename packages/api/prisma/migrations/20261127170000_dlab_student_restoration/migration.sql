CREATE TABLE dlab_student_removals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version = 1),
  external_user_id VARCHAR(64) NOT NULL REFERENCES dlab_identities(external_user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  academy_id UUID NOT NULL REFERENCES academies(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  membership_id UUID NOT NULL REFERENCES academy_memberships(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('LIVE_CAPTURE', 'LEGACY_REPAIR')),
  deletion_operation_id UUID REFERENCES people_bulk_operations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  deleted_at TIMESTAMPTZ(6),
  recovery_operation_id UUID,
  plan_digest TEXT,
  was_locally_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  captured_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESTORED', 'SUPERSEDED')),
  restored_at TIMESTAMPTZ(6),
  restoration_request_id UUID,
  UNIQUE (deletion_operation_id, membership_id),
  UNIQUE (recovery_operation_id, membership_id),
  CHECK (
    (origin = 'LIVE_CAPTURE' AND deletion_operation_id IS NOT NULL AND deleted_at IS NOT NULL
      AND recovery_operation_id IS NULL AND plan_digest IS NULL)
    OR
    (origin = 'LEGACY_REPAIR' AND deletion_operation_id IS NULL AND deleted_at IS NULL
      AND recovery_operation_id IS NOT NULL AND plan_digest IS NOT NULL AND length(plan_digest) = 64)
  ),
  CHECK ((status = 'RESTORED') = (restored_at IS NOT NULL))
);

CREATE UNIQUE INDEX dlab_student_removals_pending_membership_idx
  ON dlab_student_removals(membership_id) WHERE status = 'PENDING';
CREATE INDEX dlab_student_removals_external_user_id_status_idx ON dlab_student_removals(external_user_id, status);
CREATE INDEX dlab_student_removals_academy_id_idx ON dlab_student_removals(academy_id);

CREATE TABLE dlab_student_saved_enrollments (
  removal_id UUID NOT NULL REFERENCES dlab_student_removals(id) ON DELETE CASCADE ON UPDATE CASCADE,
  -- Keep the original class UUID even if the class is later purged.
  class_id UUID NOT NULL,
  enrolled_by_user_id UUID,
  enrolled_at TIMESTAMPTZ(6),
  last_learning_seen_at TIMESTAMPTZ(6),
  outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('PENDING', 'RESTORED', 'SKIPPED')),
  skip_reason TEXT CHECK (skip_reason IN ('class_archived', 'class_missing')),
  PRIMARY KEY (removal_id, class_id),
  CHECK ((outcome = 'SKIPPED') = (skip_reason IS NOT NULL))
);

ALTER TABLE dlab_student_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlab_student_saved_enrollments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dlab_student_removals, dlab_student_saved_enrollments FROM anon, authenticated;
