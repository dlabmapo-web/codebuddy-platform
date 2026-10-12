"use client";
import { PrivateImageContext } from "@/components/editor/private-image-context";
import { manualApi } from "@/lib/manual-api";
import { videoMediaBase } from "@/lib/video-api";
import { useCallback } from "react";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVideoTranslation } from "./use-video-translation";
import {
  videoMaxBytes,
  videoExtensions,
  type VideoAssetSummary,
  type SaveVideo,
} from "@cove/shared";
import { Modal, ModalContent } from "@/components/studio/primitives";
import { RichEditor } from "@/components/editor/RichEditor";
import { videoApi, type VideoTarget } from "@/lib/video-api";
import { VideoPlayer } from "./video-player";
export function VideoAuthorDialog({
  target,
  material,
  editable = true,
  onClose,
  onSaved,
}: {
  target: VideoTarget;
  material?: { id: string; title: string };
  editable?: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useVideoTranslation();
  const [title, setTitle] = useState(material?.title ?? ""),
    [description, setDescription] = useState(""),
    [placement, setPlacement] = useState<SaveVideo["placement"]>("MAIN"),
    [includeInScore, setIncluded] = useState(false),
    [maximum, setMaximum] = useState(100),
    [revision, setRevision] = useState(1),
    [captions, setCaptions] = useState<SaveVideo["captions"]>([]),
    [asset, setAsset] = useState<VideoAssetSummary | null>(null),
    [language, setLanguage] = useState("en"),
    [label, setLabel] = useState("English"),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false);
  const [assets, setAssets] = useState<SaveVideo["assets"]>([]);
  const imageUrls = useRef(new Map<string, string>());
  const resolveImage = useCallback(
    async (src: string) => {
      const cached = imageUrls.current.get(src);
      if (cached) return cached;
      if (!material || !asset) throw new Error("Image unavailable");
      return (
        videoMediaBase(target.academyId, material.id, asset.id, "preview") +
        "images/" +
        src.slice(11)
      );
    },
    [material?.id, asset?.id, target.academyId],
  );
  const requestKey = useRef(crypto.randomUUID()),
    upload = useRef<ReturnType<typeof videoApi.upload> | null>(null),
    createdAsset = useRef<string | null>(null),
    uploadKey = useRef<string | null>(null),
    alive = useRef(true);
  const query = useQuery({
    queryKey: ["video-author", target.academyId, material?.id],
    queryFn: () =>
      videoApi.read({
        academyId: target.academyId,
        materialId: material!.id,
        preview: true,
      }),
    enabled: Boolean(material),
    retry: false,
  });
  useEffect(() => {
    if (query.data) {
      const data = query.data;
      // Seeds the editable form from the saved lesson when it loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDescription(data.config.description);
      setPlacement(data.config.placement);
      setIncluded(data.config.includeInScore);
      setMaximum(data.config.maximumHundredths / 100);
      setRevision(data.config.revision);
      setCaptions(data.config.captions);
      setAssets(data.config.assets);
      setAsset(data.asset);
    }
  }, [query.data]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void upload.current?.abort();
      for (const url of imageUrls.current.values())
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  useEffect(() => {
    if (
      !asset ||
      !createdAsset.current ||
      ["READY", "FAILED", "CANCELLED"].includes(asset.state)
    )
      return;
    const timer = setInterval(() => {
      void videoApi
        .status({ ...target, assetId: asset.id })
        .then((a) => {
          if (alive.current) setAsset(a);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [asset?.id, asset?.state]);
  const close = () => {
    if (dirty && !window.confirm(t("discard"))) return;
    void upload.current?.abort();
    if (createdAsset.current)
      void videoApi
        .cancel({ ...target, assetId: createdAsset.current })
        .catch(() => undefined);
    onClose();
  };
  async function choose(file?: File) {
    if (!file) return;
    setError("");
    if (!editable || busy) return;
    if (
      !file.size ||
      file.size > videoMaxBytes ||
      !videoExtensions.includes(
        file.name
          .split(".")
          .at(-1)
          ?.toLowerCase() as (typeof videoExtensions)[number],
      )
    ) {
      setError(t("invalid_file"));
      return;
    }
    setBusy(true);
    setDirty(true);
    setPercent(0);
    try {
      const capability = await videoApi.capabilities();
      if (!capability.enabled) throw new Error(t("disabled"));
      if (BigInt(file.size) > BigInt(capability.maxBytes))
        throw new Error(t("configured_limit", { bytes: capability.maxBytes }));
      const key = `cove-video-upload:${target.academyId}:${target.courseId}:${target.lectureId}:${file.name}:${file.size}:${file.lastModified}`;
      uploadKey.current = key;
      const id = localStorage.getItem(key) ?? crypto.randomUUID();
      localStorage.setItem(key, id);
      const grant = await videoApi.reserve({
        ...target,
        filename: file.name,
        byteSize: String(file.size),
        requestKey: id,
      });
      createdAsset.current = grant.assetId;
      setAsset({
        id: grant.assetId,
        state: "UPLOADING",
        filename: file.name,
        byteSize: String(file.size),
        durationMs: 0,
        failureCode: null,
        renditions: [],
        masterPath: "",
        mp4Path: "",
        posterPath: "",
      });
      upload.current = videoApi.upload(file, grant, (n) => {
        if (alive.current) setPercent(n);
      });
      await upload.current.promise;
      await videoApi.finish({ ...target, assetId: grant.assetId });
      localStorage.removeItem(key);
      if (alive.current) {
        setAsset(await videoApi.status({ ...target, assetId: grant.assetId }));
        setCaptions([]);
      }
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : t("upload_failed"));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (!asset) return;
    setBusy(true);
    setError("");
    try {
      const result = await videoApi.save({
        ...target,
        materialId: material?.id,
        requestKey: requestKey.current,
        title,
        description,
        placement,
        includeInScore: placement !== "SUPPLEMENTARY" && includeInScore,
        maximumHundredths: Math.round(maximum * 100),
        thresholdBasisPoints: 9000,
        captions,
        assets,
        assetId: asset.id,
        revision,
      });
      createdAsset.current = null;
      setDirty(false);
      await onSaved();
      onClose();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("save_failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <PrivateImageContext.Provider value={resolveImage}>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <ModalContent title={t("author_title")} className="max-w-5xl">
          <div className="grid gap-4">
            <h2 className="text-lg font-bold">{t("author_title")}</h2>
            {query.isLoading ? <p role="status">{t("loading")}</p> : null}
            <label>
              {t("title")}
              <input
                className="block w-full rounded border border-border bg-card p-2"
                value={title}
                maxLength={128}
                disabled={!editable}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              {t("placement")}
              <select
                value={placement}
                disabled={!editable}
                onChange={(e) => {
                  setPlacement(e.target.value as SaveVideo["placement"]);
                  setDirty(true);
                }}
              >
                <option value="MAIN">{t("main")}</option>
                <option value="BOTH">{t("both")}</option>
                <option value="SUPPLEMENTARY">{t("supplementary")}</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={includeInScore}
                disabled={!editable || placement === "SUPPLEMENTARY"}
                onChange={(e) => {
                  setIncluded(e.target.checked);
                  setDirty(true);
                }}
              />
              {t("include_score")}
            </label>
            {includeInScore && placement !== "SUPPLEMENTARY" ? (
              <label>
                {t("maximum")}
                <input
                  type="number"
                  min={1}
                  max={10000}
                  step={0.01}
                  value={maximum}
                  onChange={(e) => {
                    setMaximum(Number(e.target.value));
                    setDirty(true);
                  }}
                />
              </label>
            ) : null}
            <p className="text-sm text-sub">{t("limits")}</p>
            <div
              className="rounded border-2 border-dashed border-border p-4"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void choose(e.dataTransfer.files[0]);
              }}
            >
              <label>
                {t("file")}
                <input
                  type="file"
                  accept={videoExtensions.map((e) => "." + e).join(",")}
                  disabled={!editable || busy}
                  onChange={(e) => void choose(e.target.files?.[0])}
                />
              </label>
            </div>
            {asset ? (
              <p role="status">
                {asset.filename} · {asset.byteSize} bytes · {asset.state}
                {asset.state === "UPLOADING" ? ` · ${percent}%` : ""}
                {asset.failureCode ? ` · ${asset.failureCode}` : ""}
              </p>
            ) : null}
            {/* Every upload transition also sets busy/error, so this ref is current when read. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            {busy && upload.current ? (
              <button
                type="button"
                onClick={() => {
                  void upload.current?.abort();
                  setBusy(false);
                  setError(t("upload_paused"));
                }}
              >
                {t("pause_upload")}
              </button>
            ) : null}
            {/* Every upload transition also sets busy/error, so this ref is current when read. */}
            {/* eslint-disable-next-line react-hooks/refs */}
            {upload.current && error ? (
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setBusy(true);
                  upload.current?.resume();
                }}
              >
                {t("resume_upload")}
              </button>
            ) : null}
            {asset?.failureCode?.startsWith("TRANSIENT") ? (
              <button
                type="button"
                onClick={() => {
                  void videoApi
                    .retry({ ...target, assetId: asset.id })
                    .then(() =>
                      setAsset({
                        ...asset,
                        state: "VERIFYING",
                        failureCode: null,
                      }),
                    )
                    .catch((e) => setError(e.message));
                }}
              >
                {t("retry")}
              </button>
            ) : null}
            <div>
              {t("description")}
              <RichEditor
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  setDirty(true);
                }}
                onImageUpload={async (file) => {
                  const a = await manualApi.upload(target, file);
                  const src = `cove-asset:${a.assetId}`;
                  imageUrls.current.set(src, URL.createObjectURL(file));
                  setAssets((old) => [...old, a]);
                  setDirty(true);
                  return src;
                }}
              />
            </div>
            <fieldset className="grid gap-2 rounded border border-border p-3">
              <legend>{t("captions")}</legend>
              <label>
                {t("language")}
                <input
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </label>
              <label>
                {t("caption_label")}
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label>
                {t("caption_file")}
                <input
                  type="file"
                  accept=".vtt"
                  disabled={!editable || asset?.state !== "READY"}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !asset) return;
                    try {
                      if (file.size > 2000000 || !file.name.endsWith(".vtt"))
                        throw new Error(t("caption_invalid"));
                      const track = await videoApi.caption({
                        ...target,
                        assetId: asset.id,
                        language,
                        label,
                        content: await file.text(),
                      });
                      setCaptions((old) => [
                        ...old.filter(
                          (c) =>
                            c.language.toLowerCase() !==
                            track.language.toLowerCase(),
                        ),
                        track,
                      ]);
                      setDirty(true);
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : t("caption_invalid"),
                      );
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {captions.map((c) => (
                <div key={c.id}>
                  {c.label} ({c.language}){" "}
                  <button
                    type="button"
                    onClick={() => {
                      setCaptions((old) => old.filter((x) => x.id !== c.id));
                      setDirty(true);
                    }}
                  >
                    {t("remove")}
                  </button>
                </div>
              ))}
            </fieldset>
            {material && query.data?.asset.state === "READY" ? (
              <>
                <button type="button" onClick={() => setPreview(!preview)}>
                  {t("preview")}
                </button>
                {preview ? (
                  <VideoPlayer
                    data={query.data}
                    academyId={target.academyId}
                    preview
                  />
                ) : null}
              </>
            ) : null}
            <p className="text-sm text-sub">{t("hidden_notice")}</p>
            {error ? <p role="alert">{error}</p> : null}
            <div className="flex gap-3">
              <button type="button" onClick={close}>
                {t("cancel")}
              </button>
              <button
                type="button"
                disabled={
                  !editable ||
                  busy ||
                  !title.trim() ||
                  !asset ||
                  !["READY", "PROCESSING", "VERIFYING"].includes(asset.state)
                }
                onClick={() => void save()}
              >
                {t("save")}
              </button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </PrivateImageContext.Provider>
  );
}
