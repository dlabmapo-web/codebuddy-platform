-- A teacher can hold independent watches in separate tabs. Session fencing is
-- enforced by the watch registry and per-session audit lock, not teacher identity.
DROP INDEX "teacher_monitoring_visits_one_open_per_teacher_idx";
-- Preserve efficient scoped cleanup without reinstating the singleton rule.
CREATE INDEX "teacher_monitoring_visits_open_per_teacher_idx"
  ON "teacher_monitoring_visits" ("teacher_membership_ref")
  WHERE "ended_at" IS NULL;
