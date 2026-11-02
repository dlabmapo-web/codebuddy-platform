-- Additive: null continues to mean the historical compatibility family.
ALTER TABLE submissions ADD COLUMN execution_runtime_snapshot JSONB,
 ADD COLUMN execution_queue TEXT, ADD COLUMN regrade_counted_at TIMESTAMPTZ(6);
ALTER TABLE staff_practice_attempts ADD COLUMN execution_queue TEXT;
CREATE INDEX submissions_dispatch_runtime_idx ON submissions (execution_queue, status, created_at);
CREATE INDEX staff_practice_dispatch_runtime_idx ON staff_practice_attempts (execution_queue, status, created_at);
