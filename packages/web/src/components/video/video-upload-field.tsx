"use client";

import {
  Check,
  CircleAlert,
  FileVideo2,
  Info,
  Loader2,
  Pause,
  Play,
  UploadCloud,
} from "lucide-react";
import { useId, useState } from "react";
import { videoExtensions, type VideoAssetSummary } from "@cove/shared";
import { cn } from "@/lib/utils";
import { useVideoTranslation } from "./use-video-translation";
import { videoActionClass } from "./video-author-section";

export function formatVideoBytes(bytes: string | number) {
  const size = Number(bytes);
  const unit =
    size >= 1e9 ? "GB" : size >= 1e6 ? "MB" : size >= 1e3 ? "KB" : "B";
  const divisor =
    unit === "GB" ? 1e9 : unit === "MB" ? 1e6 : unit === "KB" ? 1e3 : 1;
  return `${Number((size / divisor).toFixed(1))} ${unit}`;
}

export function VideoUploadField({
  asset,
  percent,
  paused,
  disabled,
  maxBytes,
  loadingLimit,
  error,
  onChoose,
  onPause,
  onResume,
  onRetry,
}: {
  asset: VideoAssetSummary | null;
  percent: number;
  paused: boolean;
  disabled: boolean;
  maxBytes?: string;
  loadingLimit: boolean;
  error: string;
  onChoose: (file?: File) => void;
  onPause?: () => void;
  onResume?: () => void;
  onRetry?: () => void;
}) {
  const { t } = useVideoTranslation();
  const id = useId();
  const [dragging, setDragging] = useState(false);
  const processing = asset && ["VERIFYING", "PROCESSING"].includes(asset.state);
  const ready = asset?.state === "READY";
  const failed = asset?.state === "FAILED";
  const stateLabel = paused
    ? t("status_paused")
    : processing
      ? t("preparing")
      : ready
        ? t("status_ready")
        : asset?.state === "UPLOADING"
          ? t("status_uploading")
          : failed
            ? t("status_failed")
            : t("unavailable");

  return (
    <section aria-labelledby={`${id}-label`}>
      <h3 id={`${id}-label`} className="mb-3 text-sm font-semibold text-ink">
        {t("file")}{" "}
        <span className="text-danger" aria-hidden>
          *
        </span>
      </h3>
      <label
        className={cn(
          "relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-6 text-center transition-colors focus-within:ring-2 focus-within:ring-brand/30 focus-within:ring-offset-2 focus-within:ring-offset-card",
          disabled
            ? "cursor-not-allowed border-border bg-surface text-sub"
            : "cursor-pointer border-brand/40 bg-card hover:border-brand hover:bg-brand-soft/40",
          dragging && !disabled && "border-brand bg-brand-soft",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) onChoose(e.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          className="sr-only"
          aria-label={t("file")}
          aria-describedby={`${id}-limits`}
          aria-invalid={Boolean(error)}
          accept={videoExtensions.map((extension) => "." + extension).join(",")}
          disabled={disabled}
          onChange={(e) => {
            onChoose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
          <UploadCloud className="size-6" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-ink">
          <span className="text-brand">
            {asset ? t("replace_video") : t("choose_video")}
          </span>{" "}
          {t("drop_video")}
        </span>
        <span className="text-xs text-sub">{t("upload_single_hint")}</span>
      </label>
      <div
        id={`${id}-limits`}
        className="mt-3 flex gap-2 text-xs leading-5 text-sub"
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <div>
          <p>
            {loadingLimit
              ? t("checking_limit")
              : maxBytes
                ? t("effective_limits", { size: formatVideoBytes(maxBytes) })
                : t("limit_unavailable")}
          </p>
          <p className="mt-0.5 break-words">
            {t("supported_formats", { formats: videoExtensions.join(", ") })}
          </p>
        </div>
      </div>
      {asset ? (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <FileVideo2 className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-all text-sm font-semibold text-ink">
                {asset.filename}
              </p>
              <p className="mt-1 text-xs text-sub">
                {formatVideoBytes(asset.byteSize)}
              </p>
            </div>
            {ready ? (
              <Check aria-hidden className="size-5 shrink-0 text-success" />
            ) : processing ? (
              <Loader2
                aria-hidden
                className="size-5 shrink-0 animate-spin text-brand motion-reduce:animate-none"
              />
            ) : failed ? (
              <CircleAlert
                aria-hidden
                className="size-5 shrink-0 text-danger"
              />
            ) : null}
          </div>
          <div
            role="status"
            className="mt-3 flex items-center justify-between gap-3 text-xs"
          >
            <span
              className={cn(
                "font-medium",
                ready ? "text-success" : failed ? "text-danger" : "text-sub",
              )}
            >
              {stateLabel}
            </span>
            {asset.state === "UPLOADING" ? (
              <span className="tabular-nums text-sub">{percent}%</span>
            ) : null}
          </div>
          {asset.state === "UPLOADING" ? (
            <div
              role="progressbar"
              aria-label={t("status_uploading")}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-accent"
            >
              <div
                className="h-full rounded-full bg-brand transition-[width] motion-reduce:transition-none"
                style={{ width: `${percent}%` }}
              />
            </div>
          ) : null}
          {processing ? (
            <p className="mt-2 text-xs leading-5 text-sub">
              {t("processing_hint")}
            </p>
          ) : null}
          {failed ? (
            <p className="mt-2 text-xs leading-5 text-sub">
              {t("processing_failed_hint")}
            </p>
          ) : null}
          {onPause || onResume || onRetry ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {onPause ? (
                <button
                  type="button"
                  className={videoActionClass}
                  onClick={onPause}
                >
                  <Pause className="size-3.5" aria-hidden />
                  {t("pause_upload")}
                </button>
              ) : null}
              {onResume ? (
                <button
                  type="button"
                  className={videoActionClass}
                  onClick={onResume}
                >
                  <Play className="size-3.5" aria-hidden />
                  {t("resume_upload")}
                </button>
              ) : null}
              {onRetry ? (
                <button
                  type="button"
                  className={videoActionClass}
                  onClick={onRetry}
                >
                  {t("retry")}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 flex gap-2 rounded-lg bg-danger/5 p-3 text-sm leading-5 text-danger"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : null}
    </section>
  );
}
