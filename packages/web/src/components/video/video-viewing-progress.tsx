"use client";

import { CheckCircle2 } from "lucide-react";
import {
  videoWatchPercent,
  videoViewingStatus,
  type VideoProgress,
  type VideoViewingStatus,
} from "@cove/shared";
import { cn } from "@/lib/utils";
import { useVideoTranslation } from "./use-video-translation";
import { videoTime } from "./video-progress-format";

export function VideoViewingStatusBadge({
  status,
}: {
  status: VideoViewingStatus;
}) {
  const { t } = useVideoTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "COMPLETED"
          ? "bg-success/10 text-success"
          : status === "IN_PROGRESS"
            ? "bg-brand-soft text-brand"
            : "bg-accent text-sub",
      )}
    >
      {status === "COMPLETED" ? (
        <CheckCircle2 className="size-3.5" aria-hidden />
      ) : null}
      {t(
        status === "COMPLETED"
          ? "completed"
          : status === "IN_PROGRESS"
            ? "viewing_in_progress"
            : "viewing_not_started",
      )}
    </span>
  );
}

export function VideoWatchedBar({
  watchedMs,
  durationMs,
}: {
  watchedMs: number;
  durationMs: number;
}) {
  const { t } = useVideoTranslation();
  const percent = videoWatchPercent(watchedMs, durationMs);
  return (
    <div className="flex min-w-32 items-center gap-3">
      <div
        role="progressbar"
        aria-label={t("watch_percent")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-ink">
        {percent}%
      </span>
    </div>
  );
}

export function VideoViewingProgress({
  progress,
  durationMs,
  onStartOver,
}: {
  progress: VideoProgress | null;
  durationMs: number;
  onStartOver?: () => void;
}) {
  const { t } = useVideoTranslation();
  const watchedMs = Math.min(durationMs, Math.max(0, progress?.watchedMs ?? 0));
  const percent = videoWatchPercent(watchedMs, durationMs);
  return (
    <section
      aria-label={t("your_viewing_progress")}
      className="rounded-xl border border-border bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {t("percent_watched", { percent })}{" "}
          <span className="ml-1 text-xs font-normal tabular-nums text-sub">
            {t("watched_of_duration", {
              watched: videoTime(watchedMs / 1000),
              duration: videoTime(durationMs / 1000),
            })}
          </span>
        </p>
        <VideoViewingStatusBadge status={videoViewingStatus(progress)} />
      </div>
      <div className="mt-2">
        <VideoWatchedBar watchedMs={watchedMs} durationMs={durationMs} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-sub">
        <p>{t("unique_time_short")}</p>
        {onStartOver ? (
          <button
            type="button"
            className="font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            onClick={onStartOver}
          >
            {t("start_over")}
          </button>
        ) : null}
      </div>
    </section>
  );
}
