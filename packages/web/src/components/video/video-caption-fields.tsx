"use client";

import { useId, useState } from "react";
import { Captions, Loader2, Trash2, Upload } from "lucide-react";
import type { SaveVideo } from "@cove/shared";
import { Input } from "@/components/studio/primitives";
import { videoApi, type VideoTarget } from "@/lib/video-api";
import { useVideoTranslation } from "./use-video-translation";
import { videoActionClass } from "./video-author-section";

export function VideoCaptionFields({
  target,
  assetId,
  ready,
  editable,
  captions,
  onChange,
}: {
  target: VideoTarget;
  assetId?: string;
  ready: boolean;
  editable: boolean;
  captions: SaveVideo["captions"];
  onChange: (captions: SaveVideo["captions"]) => void;
}) {
  const { t } = useVideoTranslation();
  const id = useId();
  const [language, setLanguage] = useState("en");
  const [label, setLabel] = useState("English");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-sub">
        {ready ? t("caption_hint") : t("caption_wait")}
      </p>
      {captions.length ? (
        <ul className="space-y-2">
          {captions.map((track) => (
            <li
              key={track.id}
              className="flex items-center gap-3 rounded-lg bg-surface p-3"
            >
              <Captions className="size-4 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1 break-words text-sm text-ink">
                {track.label}{" "}
                <span className="text-xs text-sub">({track.language})</span>
              </span>
              <button
                type="button"
                disabled={!editable || busy}
                className="rounded-md p-2 text-sub hover:bg-danger/5 hover:text-danger focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50"
                aria-label={t("remove_caption", { label: track.label })}
                onClick={() =>
                  onChange(captions.filter((item) => item.id !== track.id))
                }
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <fieldset
        disabled={!editable || !ready || busy}
        className="space-y-4 disabled:opacity-50"
      >
        <legend className="sr-only">{t("captions")}</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label
            htmlFor={`${id}-language`}
            className="grid gap-2 text-xs font-medium text-sub"
          >
            {t("language")}
            <Input
              id={`${id}-language`}
              value={language}
              placeholder="en"
              onChange={(e) => setLanguage(e.target.value)}
            />
          </label>
          <label
            htmlFor={`${id}-label`}
            className="grid gap-2 text-xs font-medium text-sub"
          >
            {t("caption_label")}
            <Input
              id={`${id}-label`}
              value={label}
              placeholder="English"
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
        </div>
        <label
          className={`${videoActionClass} relative w-fit cursor-pointer focus-within:outline-2 focus-within:outline-brand`}
        >
          {busy ? (
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {t("caption_file")}
          <input
            className="sr-only"
            type="file"
            accept=".vtt"
            aria-label={t("caption_file")}
            onChange={async (e) => {
              const input = e.currentTarget;
              const file = input.files?.[0];
              if (!file || !assetId || !editable || !ready || busy) return;
              setError("");
              setBusy(true);
              try {
                if (
                  !file.size ||
                  file.size > 2000000 ||
                  !file.name.toLowerCase().endsWith(".vtt")
                )
                  throw new Error(t("caption_invalid"));
                const track = await videoApi.caption({
                  ...target,
                  assetId,
                  language,
                  label,
                  content: await file.text(),
                });
                onChange([
                  ...captions.filter(
                    (item) =>
                      item.language.toLowerCase() !==
                      track.language.toLowerCase(),
                  ),
                  track,
                ]);
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : t("caption_invalid"),
                );
              } finally {
                setBusy(false);
                input.value = "";
              }
            }}
          />
        </label>
      </fieldset>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
