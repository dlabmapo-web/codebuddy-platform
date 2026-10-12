"use client";
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
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
}) {
  const { t } = useVideoTranslation(),
    slug = useAcademySlug(),
    router = useRouter();
  const [chosen, setChosen] = useState(classId),
    [drawer, setDrawer] = useState(false),
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
  useEffect(() => {
    if (!chosen && data?.classes.length === 1)
      // A single-class learner has nothing to choose; adopt it once the read arrives.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChosen(data.classes[0].classId);
  }, [chosen, data?.classes]);
  const index =
      data?.materials.findIndex((m) => m.materialId === materialId) ?? -1,
    previous = data?.materials[index - 1],
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
  const lecture = data.materials.filter((m) => m.lectureId === data.lecture.id),
    position = lecture.findIndex((m) => m.materialId === materialId) + 1;
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card p-4">
        <div>
          <Link
            className="text-sm text-brand"
            href={routes.academyLearnCourse(slug, data.course.id, {
              classId: chosen,
            })}
          >
            {data.course.title}
          </Link>
          <h1 className="font-semibold">{data.title}</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          {data.classes.length > 1 ? (
            <label>
              {t("class")}{" "}
              <select
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
            <Link href={routes.academyTeachVideo(slug, chosen, materialId)}>
              {t("history")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => setDrawer(!drawer)}
            aria-expanded={drawer}
          >
            {t("materials")}
          </button>
          <button
            type="button"
            onClick={() => {
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => undefined);
            }}
          >
            {t("lesson_fullscreen")}
          </button>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
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
        {drawer ? (
          <aside className="w-full lg:w-72">
            <h2 className="font-semibold">{t("materials")}</h2>
            <ul className="grid gap-2">
              {data.materials.map((m) => (
                <li key={m.materialId}>
                  <Link
                    className="block rounded border border-border p-2"
                    aria-current={
                      m.materialId === materialId ? "page" : undefined
                    }
                    href={path(m)}
                  >
                    {m.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
      <footer className="flex items-center justify-center gap-5 border-t border-border bg-card p-4">
        {previous ? <Link href={path(previous)}>{t("previous")}</Link> : null}
        <span>
          {position} / {lecture.length}
        </span>
        {next ? <Link href={path(next)}>{t("next")}</Link> : null}
      </footer>
    </main>
  );
}
