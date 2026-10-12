"use client";
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { useVideoTranslation } from "./use-video-translation";
import type { VideoReadResult } from "@cove/shared";
import { videoMediaBase } from "@/lib/video-api";
import { useVideoProgress } from "./use-video-progress";
const time = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export function VideoPlayer({
  data,
  academyId,
  classId,
  preview = false,
  resource = false,
  onEnd,
  onPlayback,
}: {
  data: VideoReadResult;
  academyId: string;
  classId?: string;
  preview?: boolean;
  resource?: boolean;
  onEnd?: () => void;
  onPlayback?: (playing: boolean) => void;
}) {
  const { t } = useVideoTranslation();
  const element = useRef<HTMLVideoElement>(null),
    root = useRef<HTMLDivElement>(null),
    hls = useRef<Hls | null>(null),
    nearEndSeek = useRef(false),
    loaded = useRef(false);
  const [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(1),
    [rate, setRate] = useState(1),
    [quality, setQuality] = useState(-1),
    [usingFallback, setUsingFallback] = useState(false),
    [caption, setCaption] = useState(() =>
      typeof window === "undefined"
        ? ""
        : (localStorage.getItem("cove-video-caption") ?? ""),
    ),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(false),
    [ended, setEnded] = useState(false);
  const watch = useVideoProgress(
    {
      academyId,
      materialId: data.materialId,
      assetId: data.asset.id,
      classId,
      enabled:
        data.canTrack && !preview && Boolean(classId) && data.trackingAvailable,
    },
    data.progress,
  );
  const ready =
    preview ||
    !data.canTrack ||
    !classId ||
    watch.ready ||
    !data.trackingAvailable;
  const base = videoMediaBase(
    academyId,
    data.materialId,
    data.asset.id,
    preview ? "preview" : resource ? "resource" : "main",
    classId,
  );
  const send = (
    isPlaying = Boolean(element.current && !element.current.paused),
    seeking = false,
  ) => {
    const video = element.current;
    if (video)
      watch.checkpoint({
        positionMs: Math.round(video.currentTime * 1000),
        rate: video.playbackRate,
        playing: isPlaying,
        seeking,
      });
  };
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  });
  useEffect(() => {
    const video = element.current;
    if (!video) return;
    loaded.current = false;
    let alive = true;
    let recoveries = 0;
    setUsingFallback(false);
    const fallback = () => {
      const position = video.currentTime;
      const wasPlaying = !video.paused;
      setUsingFallback(true);
      setQuality(-1);
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (!alive) return;
          if (position) video.currentTime = position;
          if (wasPlaying) void video.play().catch(() => undefined);
        },
        { once: true },
      );
      video.src = base + data.asset.mp4Path;
    };
    if (
      video.canPlayType("application/vnd.apple.mpegurl") &&
      /Safari/.test(navigator.userAgent) &&
      !/Chrome|Chromium/.test(navigator.userAgent)
    )
      video.src = base + data.asset.masterPath;
    else if (Hls.isSupported()) {
      const instance = new Hls({ maxBufferLength: 30, enableWorker: true });
      hls.current = instance;
      instance.loadSource(base + data.asset.masterPath);
      instance.attachMedia(video);
      instance.on(Hls.Events.ERROR, (_event, details) => {
        if (details.fatal && alive) {
          if (details.type === Hls.ErrorTypes.MEDIA_ERROR && recoveries++ < 2)
            instance.recoverMediaError();
          else {
            instance.destroy();
            hls.current = null;
            fallback();
          }
        }
      });
    } else fallback();
    return () => {
      alive = false;
      video.pause();
      hls.current?.destroy();
      hls.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [base, data.asset.id]);
  useEffect(() => {
    if (!ready || !loaded.current) return;
    if (!preview && !resource)
      void element.current?.play().catch(() => undefined);
  }, [ready, preview, resource]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (element.current && !element.current.paused) sendRef.current();
    }, 10000);
    return () => clearInterval(timer);
  }, [data.asset.id, classId]);
  useEffect(() => {
    const video = element.current;
    const leaving = () => {
      if (video) {
        sendRef.current(false);
        video.pause();
      }
    };
    window.addEventListener("pagehide", leaving);
    return () => {
      window.removeEventListener("pagehide", leaving);
      leaving();
    };
  }, [data.asset.id, classId]);
  const toggle = () => {
    const video = element.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setError(t("play_failed")));
    else video.pause();
  };
  const startOver = () => {
    const video = element.current;
    if (video) {
      nearEndSeek.current = false;
      video.currentTime = 0;
      send(false, true);
      setEnded(false);
      void video.play().catch(() => undefined);
    }
  };
  const duration = data.asset.durationMs / 1000;
  return (
    <div
      ref={root}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.code === "Space") {
          e.preventDefault();
          toggle();
        }
        if (e.code === "ArrowRight" || e.code === "ArrowLeft") {
          e.preventDefault();
          const v = element.current;
          if (v)
            v.currentTime = Math.max(
              0,
              Math.min(
                duration,
                v.currentTime + (e.code === "ArrowRight" ? 5 : -5),
              ),
            );
        }
      }}
      className="flex min-w-0 flex-col gap-3 rounded-xl bg-card p-3"
    >
      <div className="relative flex aspect-video min-h-0 items-center justify-center bg-black">
        <video
          ref={element}
          aria-label={data.title}
          playsInline
          preload="metadata"
          poster={base + data.asset.posterPath}
          crossOrigin="anonymous"
          className="max-h-[70dvh] w-full object-contain"
          onClick={toggle}
          onLoadedMetadata={() => {
            const video = element.current!;
            if (loaded.current) return;
            loaded.current = true;
            const resume = watch.progress?.completed
              ? 0
              : (watch.progress?.positionMs ?? data.progress?.positionMs ?? 0) /
                1000;
            if (resume)
              video.currentTime = Math.min(resume, Math.max(0, duration - 0.1));
            if (ready && !preview && !resource)
              void video.play().catch(() => undefined);
          }}
          onTimeUpdate={() => setPosition(element.current?.currentTime ?? 0)}
          onPlay={() => {
            setPlaying(true);
            setEnded(false);
            setWaiting(false);
            onPlayback?.(true);
          }}
          onPause={() => {
            setPlaying(false);
            send(false);
            onPlayback?.(false);
          }}
          onWaiting={() => {
            setWaiting(true);
            send(false, true);
          }}
          onPlaying={() => {
            setWaiting(false);
            send(true);
          }}
          onSeeking={() => {
            nearEndSeek.current =
              (element.current?.currentTime ?? 0) >= duration - 0.5;
            send(false, true);
          }}
          onSeeked={() => {
            send(!element.current?.paused);
          }}
          onEnded={() => {
            setPlaying(false);
            setEnded(true);
            send(false);
            onPlayback?.(false);
            if (!nearEndSeek.current && !preview && !resource) onEnd?.();
          }}
          onError={() => setError(t("media_failed"))}
        >
          {data.config.captions.map((track) => (
            <track
              key={track.id}
              kind="subtitles"
              src={base + track.path}
              srcLang={track.language}
              label={track.label}
              default={caption === track.language}
            />
          ))}
        </video>
        {waiting ? (
          <span
            role="status"
            className="absolute rounded bg-black/70 p-2 text-white"
          >
            {t("buffering")}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={!ready} onClick={toggle}>
          {t(playing ? "pause" : "play")}
        </button>
        <span className="text-sm tabular-nums">
          {time(position)} / {time(duration)}
        </span>
        <input
          className="min-w-24 flex-1"
          aria-label={t("seek")}
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={Math.min(position, duration)}
          onChange={(e) => {
            if (element.current)
              element.current.currentTime = Number(e.target.value);
          }}
        />
        <button
          type="button"
          onClick={() => {
            const v = element.current;
            if (v) {
              v.muted = !v.muted;
              setMuted(v.muted);
            }
          }}
        >
          {t(muted ? "unmute" : "mute")}
        </button>
        <input
          className="w-20"
          aria-label={t("volume")}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => {
            const value = Number(e.target.value);
            setVolume(value);
            if (element.current) element.current.volume = value;
          }}
        />
        <label>
          {t("speed")}{" "}
          <select
            aria-label={t("speed")}
            value={rate}
            onChange={(e) => {
              send();
              const value = Number(e.target.value);
              setRate(value);
              if (element.current) element.current.playbackRate = value;
              send();
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("quality")}{" "}
          <select
            aria-label={t("quality")}
            disabled={usingFallback}
            value={quality}
            onChange={(e) => {
              const n = Number(e.target.value);
              setQuality(n);
              if (hls.current) hls.current.currentLevel = n;
              else if (element.current && (n < 0 || data.asset.renditions[n])) {
                const video = element.current,
                  pos = video.currentTime,
                  wasPlaying = !video.paused;
                video.src =
                  base +
                  (n < 0
                    ? data.asset.masterPath
                    : data.asset.renditions[n].path);
                video.addEventListener(
                  "loadedmetadata",
                  () => {
                    video.currentTime = pos;
                    if (wasPlaying) void video.play().catch(() => undefined);
                  },
                  { once: true },
                );
              }
            }}
          >
            <option value={-1}>{t("auto")}</option>
            {data.asset.renditions.map((r, i) => (
              <option value={i} key={r.height}>
                {r.height}p
              </option>
            ))}
          </select>
        </label>
        {data.config.captions.length ? (
          <label>
            {t("captions")}{" "}
            <select
              aria-label={t("captions")}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                localStorage.setItem("cove-video-caption", e.target.value);
                const v = element.current;
                if (v)
                  for (const track of Array.from(v.textTracks))
                    track.mode =
                      track.language === e.target.value
                        ? "showing"
                        : "disabled";
              }}
            >
              <option value="">{t("off")}</option>
              {data.config.captions.map((c) => (
                <option value={c.language} key={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void root.current
              ?.requestFullscreen?.()
              .catch(() => setError(t("fullscreen_failed")));
          }}
        >
          {t("fullscreen")}
        </button>
      </div>
      {ended || position > 0 || Boolean(watch.progress?.positionMs) ? (
        <button type="button" onClick={startOver}>
          {t(ended ? "replay" : "start_over")}
        </button>
      ) : null}
      {!preview && data.canTrack && classId ? (
        <p role="status">
          {t(watch.progress?.completed ? "completed" : "saved_progress", {
            percent: Math.floor(
              ((watch.progress?.watchedMs ?? 0) / data.asset.durationMs) * 100,
            ),
          })}
        </p>
      ) : null}
      {!data.trackingAvailable && data.canTrack && !preview ? (
        <p>{t("tracking_disabled")}</p>
      ) : null}
      {watch.error ? (
        <p role="alert">
          {t("unsaved")}{" "}
          <button type="button" onClick={() => void watch.retry()}>
            {t("retry")}
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              element.current?.load();
            }}
          >
            {t("retry")}
          </button>
        </p>
      ) : null}
    </div>
  );
}
