ALTER TABLE video_assets ADD COLUMN processing_version TEXT NOT NULL DEFAULT 'ffmpeg-h264-v1', ADD COLUMN processing_metadata JSONB NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION protect_ready_video() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state = 'READY' AND (NEW.object_key, NEW.byte_size, NEW.checksum, NEW.outputs, NEW.renditions, NEW.duration_ms, NEW.processing_version, NEW.processing_metadata) IS DISTINCT FROM (OLD.object_key, OLD.byte_size, OLD.checksum, OLD.outputs, OLD.renditions, OLD.duration_ms, OLD.processing_version, OLD.processing_metadata) THEN
  RAISE EXCEPTION 'Ready video media is immutable; use a replacement asset';
 END IF;
 RETURN NEW;
END $$;
