ALTER TABLE video_watch_progress ADD COLUMN sample_elapsed_ms INTEGER NOT NULL DEFAULT 0, ADD COLUMN session_started_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE video_watch_progress ADD CONSTRAINT video_sample_time_valid CHECK (sample_elapsed_ms >= 0);
