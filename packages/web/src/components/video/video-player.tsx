"use client";
import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { VideoPlayerControls } from "./video-player-controls";
import { useVideoTranslation } from "./use-video-translation";
import type { VideoReadResult } from "@cove/shared";
import { videoMediaBase } from "@/lib/video-api";
import { useVideoProgress } from "./use-video-progress";
import { VideoViewingProgress } from "./video-viewing-progress";
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
    [ended, setEnded] = useState(false),
    [fullscreen, setFullscreen] = useState(false);
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
  }, [base, data.asset.id, data.asset.masterPath, data.asset.mp4Path]);
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
  useEffect(() => {
    const updateFullscreen = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);
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
  const personalProgress = !preview && data.canTrack && Boolean(classId);
  return (
    <div className="min-w-0 space-y-3">
      <div
        ref={root}
        role="region"
        aria-label={t("player_label", { title: data.title })}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.code === "Space") {
            event.preventDefault();
            toggle();
          }
          if (event.code === "ArrowRight" || event.code === "ArrowLeft") {
            event.preventDefault();
            const video = element.current;
            if (video)
              video.currentTime = Math.max(
                0,
                Math.min(
                  duration,
                  video.currentTime + (event.code === "ArrowRight" ? 5 : -5),
                ),
              );
          }
        }}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl bg-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&:fullscreen]:h-dvh [&:fullscreen]:w-screen [&:fullscreen]:rounded-none"
      >
        <div
          className={
            fullscreen
              ? "relative min-h-0 flex-1"
              : personalProgress
                ? "relative aspect-video max-h-[max(8rem,calc(100dvh-22rem))] min-h-0 w-full"
                : "relative aspect-video max-h-[max(8rem,calc(100dvh-16rem))] min-h-0 w-full"
          }
        >
          <video
            ref={element}
            aria-label={data.title}
            playsInline
            preload="metadata"
            poster={base + data.asset.posterPath}
            crossOrigin="anonymous"
            className="absolute inset-0 block h-full w-full object-contain"
            onClick={toggle}
            onLoadedMetadata={() => {
              const video = element.current!;
              if (loaded.current) return;
              loaded.current = true;
              const resume = watch.progress?.completed
                ? 0
                : (watch.progress?.positionMs ??
                    data.progress?.positionMs ??
                    0) / 1000;
              if (resume)
                video.currentTime = Math.min(
                  resume,
                  Math.max(0, duration - 0.1),
                );
              if (ready && !preview && !resource)
                void video.play().catch(() => undefined);
            }}
            onTimeUpdate={() => setPosition(element.current?.currentTime ?? 0)}
            onVolumeChange={() => {
              if (element.current) {
                setMuted(element.current.muted);
                setVolume(element.current.volume);
              }
            }}
            onRateChange={() => setRate(element.current?.playbackRate ?? 1)}
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
              className="absolute inset-0 flex items-center justify-center gap-2 bg-black/30 text-sm text-white"
            >
              <LoaderCircle
                aria-hidden
                className="size-5 animate-spin motion-reduce:animate-none"
              />
              {t("buffering")}
            </span>
          ) : null}
        </div>
        <VideoPlayerControls
          playing={playing}
          ready={ready}
          ended={ended}
          position={position}
          duration={duration}
          muted={muted}
          volume={volume}
          rate={rate}
          quality={quality}
          usingFallback={usingFallback}
          caption={
            data.config.captions.some((track) => track.language === caption)
              ? caption
              : ""
          }
          fullscreen={fullscreen}
          renditions={data.asset.renditions}
          captions={data.config.captions}
          onToggle={toggle}
          onReplay={startOver}
          onSeek={(value) => {
            if (element.current) {
              element.current.currentTime = value;
              setPosition(value);
            }
          }}
          onMute={() => {
            const video = element.current;
            if (!video) return;
            if (video.volume === 0) {
              video.volume = 1;
              video.muted = false;
            } else video.muted = !video.muted;
          }}
          onVolume={(value) => {
            const video = element.current;
            if (video) {
              video.volume = value;
              video.muted = value === 0;
            }
          }}
          onRate={(value) => {
            send();
            if (element.current) element.current.playbackRate = value;
            send();
          }}
          onQuality={(value) => {
            setQuality(value);
            if (hls.current) hls.current.currentLevel = value;
            else if (
              element.current &&
              (value < 0 || data.asset.renditions[value])
            ) {
              const video = element.current;
              const position = video.currentTime;
              const wasPlaying = !video.paused;
              const playbackRate = video.playbackRate;
              video.addEventListener(
                "loadedmetadata",
                () => {
                  video.currentTime = position;
                  video.playbackRate = playbackRate;
                  if (wasPlaying) void video.play().catch(() => undefined);
                },
                { once: true },
              );
              video.src =
                base +
                (value < 0
                  ? data.asset.masterPath
                  : data.asset.renditions[value].path);
            }
          }}
          onCaption={(language) => {
            setCaption(language);
            localStorage.setItem("cove-video-caption", language);
            if (element.current)
              for (const track of Array.from(element.current.textTracks))
                track.mode =
                  track.language === language ? "showing" : "disabled";
          }}
          onFullscreen={() => {
            setError("");
            if (document.fullscreenElement === root.current)
              void document
                .exitFullscreen()
                .catch(() => setError(t("fullscreen_failed")));
            else if (root.current?.requestFullscreen)
              void root.current
                .requestFullscreen()
                .catch(() => setError(t("fullscreen_failed")));
            else setError(t("fullscreen_failed"));
          }}
        />
      </div>
      {!personalProgress &&
      !ended &&
      (position > 0 || Boolean(watch.progress?.positionMs)) ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          onClick={startOver}
        >
          {t("start_over")}
        </button>
      ) : null}
      {personalProgress ? (
        <VideoViewingProgress
          progress={watch.progress}
          durationMs={data.asset.durationMs}
          onStartOver={position > 0 && !ended ? startOver : undefined}
        />
      ) : null}
      {!data.trackingAvailable && data.canTrack && !preview ? (
        <p className="text-xs text-sub">{t("tracking_disabled")}</p>
      ) : null}
      {watch.error ? (
        <p role="alert" className="text-sm text-danger">
          {t("unsaved")}{" "}
          <button
            type="button"
            className="font-semibold text-brand underline underline-offset-2"
            onClick={() => void watch.retry()}
          >
            {t("retry")}
          </button>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
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
