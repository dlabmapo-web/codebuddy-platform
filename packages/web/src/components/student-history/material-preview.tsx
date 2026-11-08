"use client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { PdfReader } from "@/components/pdf/pdf-reader";
import { VideoPlayer } from "@/components/video/video-player";
import { videoApi } from "@/lib/video-api";
import { orpc } from "@/lib/orpc";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { ExerciseImageProvider, ManualImageProvider } from "@/components/studio/lesson-image-providers";
import type { HistoryMaterial } from "@cove/shared";
import { historyAction, HistoryError } from "./history-ui";

/** Staff preview only: these readers do not publish student learning progress. */
export function HistoryMaterialPreview({
  academyId,
  classId,
  membershipId,
  material,
  onBack,
}: {
  academyId: string;
  classId: string;
  membershipId: string;
  material: Pick<HistoryMaterial, "materialId" | "title" | "type">;
  onBack: () => void;
}) {
  const { t } = useTranslation("teach");
  const reading = ["PDF_DOCUMENT", "VIDEO_LESSON"].includes(material.type);
  const content = useQuery({
    queryKey: [
      "history-current-material",
      academyId,
      classId,
      membershipId,
      material.materialId,
    ],
    queryFn: () =>
      orpc.monitoring.getObservedMaterial({
        academyId,
        classId,
        membershipId,
        materialId: material.materialId,
      }),
    enabled: !reading,
    gcTime: 0,
    retry: false,
  });
  const video = useQuery({
    queryKey: [
      "history-video-preview",
      academyId,
      classId,
      material.materialId,
    ],
    queryFn: () =>
      videoApi.read({ academyId, classId, materialId: material.materialId }),
    enabled: material.type === "VIDEO_LESSON",
    gcTime: 0,
    retry: false,
  });
  return (
    <section className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex items-center gap-3 border-b border-border p-4">
        <button type="button" className={historyAction} onClick={onBack}>
          <ArrowLeft className="size-4" />
          {t("history.back_history")}
        </button>
        <h3 className="min-w-0 truncate text-sm font-bold">{material.title}</h3>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {material.type === "PDF_DOCUMENT" ? (
          <PdfReader
            academyId={academyId}
            materialId={material.materialId}
            observing
          />
        ) : !reading ? (
          content.isError ? (
            <HistoryError retry={() => void content.refetch()} />
          ) : content.data ? (
            <div className="p-6">
              <p className="mb-4 text-xs text-sub">
                {t("history.current_instructions")}
              </p>
              {material.type === "PROGRAMMING_EXERCISE" ? (
                <ExerciseImageProvider academyId={academyId} materialId={material.materialId} staff>
                  <RichTextFrame title={t("history.current_instructions")} content={content.data.description} />
                </ExerciseImageProvider>
              ) : (
                <ManualImageProvider scope={{ academyId, materialId: material.materialId, classId, preview: true }}>
                  <RichTextFrame title={t("history.current_instructions")} content={content.data.description} />
                </ManualImageProvider>
              )}
              {content.data.question ? (
                <p className="mt-5 font-semibold">{content.data.question}</p>
              ) : null}
            </div>
          ) : (
            <p role="status" className="p-5">
              {t("history.loading")}
            </p>
          )
        ) : video.isError ? (
          <HistoryError retry={() => void video.refetch()} />
        ) : video.data ? (
          <VideoPlayer
            data={video.data}
            academyId={academyId}
            classId={classId}
            observing
          />
        ) : (
          <p role="status" className="p-5">
            {t("history.loading")}
          </p>
        )}
      </div>
    </section>
  );
}
