"use client";

import {
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { VideoReadResult } from "@cove/shared";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { useVideoTranslation } from "./use-video-translation";

import { videoTime } from "./video-progress-format";

const iconButton =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-md text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40";
const selectorClass =
  "h-8 w-auto max-w-32 shrink-0 gap-2 rounded-md border-white/15 bg-white/10 px-2 text-xs text-white hover:border-white/30 focus-visible:border-brand focus-visible:ring-brand/30 [&>svg]:size-3 [&>svg]:text-white/65";
const playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((value) => ({
  id: String(value),
  name: `${value}×`,
}));

export function VideoPlayerControls({
  playing,
  ready,
  ended,
  position,
  duration,
  muted,
  volume,
  rate,
  quality,
  usingFallback,
  caption,
  fullscreen,
  renditions,
  captions,
  onToggle,
  onSeek,
  onMute,
  onVolume,
  onRate,
  onQuality,
  onCaption,
  onFullscreen,
  onReplay,
}: {
  playing: boolean;
  ready: boolean;
  ended: boolean;
  position: number;
  duration: number;
  muted: boolean;
  volume: number;
  rate: number;
  quality: number;
  usingFallback: boolean;
  caption: string;
  fullscreen: boolean;
  renditions: VideoReadResult["asset"]["renditions"];
  captions: VideoReadResult["config"]["captions"];
  onToggle: () => void;
  onSeek: (position: number) => void;
  onMute: () => void;
  onVolume: (volume: number) => void;
  onRate: (rate: number) => void;
  onQuality: (quality: number) => void;
  onCaption: (language: string) => void;
  onFullscreen: () => void;
  onReplay: () => void;
}) {
  const { t } = useVideoTranslation();
  const quiet = muted || volume === 0;
  return (
    <div
      role="group"
      aria-label={t("player_controls")}
      className="shrink-0 space-y-2 border-t border-white/10 bg-neutral-950 px-3 pb-2.5 pt-2 text-white sm:px-4"
    >
      <input
        aria-label={t("seek")}
        aria-valuetext={`${videoTime(position)} / ${videoTime(duration)}`}
        type="range"
        min={0}
        max={duration}
        step={0.1}
        value={Math.min(position, duration)}
        disabled={!ready}
        onChange={(event) => onSeek(Number(event.target.value))}
        className="block h-4 w-full cursor-pointer accent-brand [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            className={iconButton}
            disabled={!ready}
            aria-label={t(ended ? "replay" : playing ? "pause" : "play")}
            title={t(ended ? "replay" : playing ? "pause" : "play")}
            onClick={ended ? onReplay : onToggle}
          >
            {ended ? (
              <RotateCcw className="size-5" aria-hidden />
            ) : playing ? (
              <Pause className="size-5 fill-current" aria-hidden />
            ) : (
              <Play className="size-5 fill-current" aria-hidden />
            )}
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={t(quiet ? "unmute" : "mute")}
            title={t(quiet ? "unmute" : "mute")}
            onClick={onMute}
          >
            {quiet ? (
              <VolumeX className="size-5" aria-hidden />
            ) : (
              <Volume2 className="size-5" aria-hidden />
            )}
          </button>
          <input
            aria-label={t("volume")}
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={quiet ? 0 : volume}
            onChange={(event) => onVolume(Number(event.target.value))}
            className="h-4 w-14 cursor-pointer accent-brand [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-20"
          />
          <span className="ml-2 whitespace-nowrap text-xs tabular-nums text-white/85">
            {videoTime(position)}{" "}
            <span className="text-white/50">/ {videoTime(duration)}</span>
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <ChoiceSelector
            label={t("speed")}
            list={playbackSpeeds}
            selectedId={String(rate)}
            onSelect={(item) => onRate(Number(item.id))}
            className={selectorClass}
            contentClassName="min-w-36"
            side="top"
          />
          <span title={usingFallback ? t("quality_unavailable") : undefined}>
            <ChoiceSelector
              label={t("quality")}
              list={[
                { id: "-1", name: t("auto") },
                ...renditions.map((rendition, index) => ({
                  id: String(index),
                  name: `${rendition.height}p`,
                })),
              ]}
              selectedId={String(quality)}
              onSelect={(item) => onQuality(Number(item.id))}
              disabled={usingFallback}
              className={selectorClass}
              contentClassName="min-w-36"
              side="top"
            />
          </span>
          {captions.length ? (
            <ChoiceSelector
              label={t("captions")}
              list={[
                { id: "", name: t("captions_off") },
                ...captions.map((track) => ({
                  id: track.language,
                  name: track.label,
                })),
              ]}
              selectedId={caption}
              onSelect={(item) => onCaption(item.id)}
              className={selectorClass}
              contentClassName="min-w-48"
              side="top"
            />
          ) : null}
          <button
            type="button"
            className={iconButton}
            aria-label={t(fullscreen ? "exit_fullscreen" : "fullscreen")}
            title={t(fullscreen ? "exit_fullscreen" : "fullscreen")}
            onClick={onFullscreen}
          >
            {fullscreen ? (
              <Minimize className="size-4" aria-hidden />
            ) : (
              <Maximize className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
