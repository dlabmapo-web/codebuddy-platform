"use client";
import { LessonHeader, LessonFooter, lessonAction } from '@/components/workspace/lesson-chrome';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useMaterialNavigation } from '@/components/workspace/use-material-navigation';
import { MediaStaffActions, type MediaStaffPermissions } from '@/components/workspace/media-staff-actions';
import { useLayoutTranslation } from '@/i18n';
import { PrivateImageContext } from "@/components/editor/private-image-context";
import { videoMediaBase } from "@/lib/video-api";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useVideoTranslation } from "./use-video-translation";
import { videoApi } from "@/lib/video-api";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { routes } from "@/lib/routes";
import { ChoiceRich } from "@/components/manual/choice-options";
import { VideoPlayer } from "./video-player";
import { VideoWatchHistory } from "./video-watch-history";
import { VideoResource } from "./video-resource";
import { retryVideoRead, videoReadRetryDelay } from "./video-read-recovery";
export function VideoLesson({
  academyId,
  materialId,
  classId,
  preview = false,
  permissions,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
  permissions?: MediaStaffPermissions;
}) {
  const { t } = useVideoTranslation(),
    slug = useAcademySlug(),
    router = useRouter();
  const [chosen, setChosen] = useState(classId),
    [showHistory, setShowHistory] = useState(false),
    [countdown, setCountdown] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["video", academyId, materialId, chosen, preview],
    queryFn: () =>
      videoApi.read({ academyId, materialId, classId: chosen, preview }),
    retry: retryVideoRead,
    retryDelay: videoReadRetryDelay,
  });
  const data = query.data;
  const { t: lt } = useLayoutTranslation('learn');
  const navigation = useMaterialNavigation({ academyId, materialId, classId: chosen, preview, courseId: data?.course.id, materials: data?.materials });
  const { open: panelOpen, panelId, triggerRef, toggle: togglePanel, close: closePanel } = useNavigatorPanel('material-course-outline');
  useEffect(() => {
    if (!chosen && data?.classes.length === 1)
      // A single-class learner has nothing to choose; adopt it once the read arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChosen(data.classes[0].classId);
  }, [chosen, data?.classes]);
  const index =
      data?.materials.findIndex((m) => m.materialId === materialId) ?? -1,
    next = data?.materials[index + 1];
  const path = (row: { materialId: string; type: string }) =>
    routes.academyLearnMaterial(slug, row.materialId, row.type, {
      classId: chosen,
    });
  useEffect(() => {
    if (countdown === null || !next) return;
    if (countdown === 0) {
      router.push(path(next));
      return;
    }
    const timer = setTimeout(
      () => setCountdown((n) => (n === null ? null : n - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [countdown, next?.materialId]);
  if (!data)
    return (
      <main role={query.isError ? "alert" : "status"} className="p-6">
        <p>{t(query.isError ? "unavailable" : "loading")}</p>
        {query.isError ? (
          <button
            type="button"
            className="mt-3 rounded border border-border px-4 py-2 text-brand"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("retry")}
          </button>
        ) : null}
      </main>
    );
  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <LessonHeader courseTitle={data.course.title} lectureTitle={data.lecture.title} title={data.title} leaveHref={navigation.courseHref}
        curriculum={<CurriculumTrigger compact ref={triggerRef} open={panelOpen} panelId={panelId} onToggle={togglePanel} path={navigation.context?.path ?? null} />}>
          {data.classes.length > 1 ? (
            <label className="flex items-center gap-2 text-xs font-semibold text-sub">
              {t("class")}{" "}
              <select
                className="min-h-9 rounded-lg border border-border bg-card px-2 text-xs text-ink"
                value={chosen ?? ""}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">{t("select_class")}</option>
                {data.classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {data.canReview && chosen ? (
            <Link className={lessonAction} href={routes.academyTeachVideo(slug, chosen, materialId)}>
              {t("history")}
            </Link>
          ) : null}
        <MediaStaffActions academyId={academyId} type="VIDEO_LESSON" data={data} permissions={permissions} />
      </LessonHeader>
      <div className="relative flex min-h-0 flex-1">
        <WorkspaceCurriculumNavigator context={navigation.context} displayedMaterialId={materialId} open={panelOpen} panelId={panelId}
          onClose={closePanel} onSelect={navigation.navigate} error={navigation.failed} onRetry={navigation.retry}
          footer={{ href: navigation.courseHref, label: lt('navigator.footer_student') }} />
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-7xl gap-6 p-4">
        <section className="min-w-0 self-center">
          {data.asset.state === "READY" ? (
            <VideoPlayer
              key={`${materialId}:${data.asset.id}:${chosen}`}
              data={data}
              academyId={academyId}
              classId={chosen}
              preview={preview}
              onEnd={() => {
                if (next) setCountdown(5);
              }}
              onPlayback={(playing) => {
                if (playing) setCountdown(null);
              }}
            />
          ) : (
            <p role="status">
              {t("preparing")} · {data.asset.state}
            </p>
          )}
          {countdown !== null && next ? (
            <div
              role="status"
              className="mt-4 rounded border border-border p-3"
            >
              {t("next_countdown", { seconds: countdown })}{" "}
              <button type="button" onClick={() => setCountdown(null)}>
                {t("cancel")}
              </button>{" "}
              <Link href={path(next)}>{t("next")}</Link>
            </div>
          ) : null}
          {data.canTrack && chosen && !preview ? (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={showHistory}
                onClick={() => setShowHistory(!showHistory)}
              >
                {t("history")}
              </button>
              {showHistory ? (
                <VideoWatchHistory
                  academyId={academyId}
                  materialId={materialId}
                  classId={chosen}
                  embedded
                />
              ) : null}
            </div>
          ) : null}
          {data.config.description ? (
            <div className="mt-4">
              <PrivateImageContext.Provider
                value={async (src) =>
                  videoMediaBase(
                    academyId,
                    materialId,
                    data.asset.id,
                    preview ? "preview" : "main",
                    chosen,
                  ) +
                  "images/" +
                  src.slice(11)
                }
              >
                <ChoiceRich content={data.config.description} />
              </PrivateImageContext.Provider>
            </div>
          ) : null}
          {data.resources.length ? (
            <aside className="mt-4 flex flex-wrap gap-3">
              {data.resources.map((r) =>
                r.type === "VIDEO_LESSON" ? (
                  <VideoResource
                    key={r.materialId}
                    academyId={academyId}
                    materialId={r.materialId}
                    classId={chosen}
                    title={r.title}
                  />
                ) : (
                  <Link
                    key={r.materialId}
                    href={routes.academyLearnPdf(slug, r.materialId, {
                      classId: chosen,
                    })}
                  >
                    {r.title}
                  </Link>
                ),
              )}
            </aside>
          ) : null}
        </section>
      </div>
      </div>
      </div>
      <LessonFooter previous={navigation.previous} next={navigation.next} index={navigation.index} total={navigation.total} />
    </main>
  );
}
