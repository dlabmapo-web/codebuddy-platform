-- AlterEnum
ALTER TYPE "MaterialType" ADD VALUE 'VIDEO_LESSON';

-- CreateTable
CREATE TABLE "video_assets" (
    "id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "uploader_user_id" UUID NOT NULL,
    "academy_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "lecture_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "byte_size" BIGINT NOT NULL,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'UPLOADING',
    "failure_code" TEXT,
    "outputs" JSONB NOT NULL DEFAULT '[]',
    "renditions" JSONB NOT NULL DEFAULT '[]',
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_lessons" (
    "material_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "request_key" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT NOT NULL DEFAULT '',
    "placement" TEXT NOT NULL DEFAULT 'MAIN',
    "include_in_score" BOOLEAN NOT NULL DEFAULT false,
    "maximum_hundredths" INTEGER NOT NULL DEFAULT 10000,
    "threshold_basis_points" INTEGER NOT NULL DEFAULT 9000,
    "captions" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "video_lessons_pkey" PRIMARY KEY ("material_id")
);

-- CreateTable
CREATE TABLE "video_captions" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "uploader_user_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_captions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_processing_jobs" (
    "asset_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lease_id" UUID,
    "lease_until" TIMESTAMPTZ(6),
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_processing_jobs_pkey" PRIMARY KEY ("asset_id")
);

-- CreateTable
CREATE TABLE "video_watch_progress" (
    "id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "intervals" JSONB NOT NULL DEFAULT '[]',
    "position_ms" INTEGER NOT NULL DEFAULT 0,
    "watched_ms" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "threshold_basis_points" INTEGER NOT NULL,
    "maximum_hundredths" INTEGER NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT 'video-watch-v1',
    "session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "previous_playing" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "video_watch_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_request_key_key" ON "video_assets"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_object_key_key" ON "video_assets"("object_key");

-- CreateIndex
CREATE INDEX "video_assets_state_created_at_idx" ON "video_assets"("state", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "video_lessons_request_key_key" ON "video_lessons"("request_key");

-- CreateIndex
CREATE INDEX "video_lessons_asset_id_idx" ON "video_lessons"("asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_captions_object_key_key" ON "video_captions"("object_key");

-- CreateIndex
CREATE INDEX "video_processing_jobs_status_next_attempt_at_idx" ON "video_processing_jobs"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "video_watch_progress_user_id_class_id_material_id_idx" ON "video_watch_progress"("user_id", "class_id", "material_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_watch_progress_material_id_asset_id_user_id_class_id_key" ON "video_watch_progress"("material_id", "asset_id", "user_id", "class_id");

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_captions" ADD CONSTRAINT "video_captions_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_processing_jobs" ADD CONSTRAINT "video_processing_jobs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_watch_progress" ADD CONSTRAINT "video_watch_progress_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_watch_progress" ADD CONSTRAINT "video_watch_progress_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "video_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Media metadata and learning telemetry are accessible only through scoped API endpoints.
ALTER TABLE video_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_captions ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_watch_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON video_assets, video_lessons, video_captions, video_processing_jobs, video_watch_progress FROM anon, authenticated;
ALTER TABLE video_assets ADD CONSTRAINT video_source_bounds CHECK(byte_size > 0 AND byte_size <= 5000000000 AND duration_ms BETWEEN 0 AND 21600000);
ALTER TABLE video_lessons ADD CONSTRAINT video_placement CHECK (placement IN ('MAIN','BOTH','SUPPLEMENTARY') AND (placement <> 'SUPPLEMENTARY' OR NOT include_in_score));
ALTER TABLE video_lessons ADD CONSTRAINT video_score_bounds CHECK(maximum_hundredths BETWEEN 100 AND 1000000 AND threshold_basis_points BETWEEN 100 AND 10000);
ALTER TABLE video_watch_progress ADD CONSTRAINT video_progress_bounds CHECK(position_ms >= 0 AND watched_ms >= 0 AND sequence >= 0);
CREATE FUNCTION protect_ready_video() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.state = 'READY' AND (NEW.object_key, NEW.byte_size, NEW.checksum, NEW.outputs, NEW.renditions, NEW.duration_ms) IS DISTINCT FROM (OLD.object_key, OLD.byte_size, OLD.checksum, OLD.outputs, OLD.renditions, OLD.duration_ms) THEN
  RAISE EXCEPTION 'Ready video media is immutable; use a replacement asset';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ready_video_immutable BEFORE UPDATE ON video_assets FOR EACH ROW EXECUTE FUNCTION protect_ready_video();

ALTER TABLE video_lessons ADD COLUMN assets JSONB NOT NULL DEFAULT '[]';
