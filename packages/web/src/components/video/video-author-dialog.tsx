"use client";
import { PrivateImageContext } from "@/components/editor/private-image-context";
import { manualApi } from "@/lib/manual-api";
import { videoMediaBase } from "@/lib/video-api";
import { useCallback, useState, useRef, useEffect, useId } from "react";
import { Eye, Info, Loader2, Save, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useVideoTranslation } from "./use-video-translation";
import {
  videoMaxBytes,
  videoExtensions,
  type VideoAssetSummary,
  type SaveVideo,
} from "@cove/shared";
import { Input, Modal, ModalContent } from "@/components/studio/primitives";
import { RichEditor } from "@/components/editor/RichEditor";
import { videoApi, type VideoTarget } from "@/lib/video-api";
import { VideoPlayer } from "./video-player";
import { VideoAuthorSection, videoActionClass } from "./video-author-section";
import { VideoUploadField, formatVideoBytes } from "./video-upload-field";
import { VideoCaptionFields } from "./video-caption-fields";
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
  const formId = useId();
  const capability = useQuery({
    queryKey: ["video-capabilities"],
    queryFn: videoApi.capabilities,
    retry: false,
  });
  const [uploadPaused, setUploadPaused] = useState(false);
  const lastFile = useRef<File | null>(null);
  const [title, setTitle] = useState(material?.title ?? ""),
    [description, setDescription] = useState(""),
    [placement, setPlacement] = useState<SaveVideo["placement"]>("MAIN"),
    [includeInScore, setIncluded] = useState(false),
    [maximum, setMaximum] = useState(100),
    [revision, setRevision] = useState(1),
    [captions, setCaptions] = useState<SaveVideo["captions"]>([]),
    [asset, setAsset] = useState<VideoAssetSummary | null>(null),
    [busy, setBusy] = useState(false),
    [percent, setPercent] = useState(0),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false);
  const [assets, setAssets] = useState<SaveVideo["assets"]>([]);
  const imageUrls = useRef(new Map<string, string>());
  const materialId = material?.id;
  const assetId = asset?.id;
  const assetState = asset?.state;
  const { academyId, courseId, lectureId } = target;
  const resolveImage = useCallback(
    async (src: string) => {
      const cached = imageUrls.current.get(src);
      if (cached) return cached;
      if (!materialId || !assetId) throw new Error("Image unavailable");
      return (
        videoMediaBase(academyId, materialId, assetId, "preview") +
        "images/" +
        src.slice(11)
      );
    },
    [materialId, assetId, academyId],
  );
  const requestKey = useRef(crypto.randomUUID()),
    upload = useRef<ReturnType<typeof videoApi.upload> | null>(null),
    createdAsset = useRef<string | null>(null),
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
    const urls = imageUrls.current;
    return () => {
      alive.current = false;
      void upload.current?.abort();
      for (const url of urls.values())
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
      !assetId ||
      !createdAsset.current ||
      ["READY", "FAILED", "CANCELLED"].includes(assetState ?? "")
    )
      return;
    const timer = setInterval(() => {
      void videoApi
        .status({ academyId, courseId, lectureId, assetId })
        .then((a) => {
          if (alive.current) setAsset(a);
        })
        .catch((e) => {
          if (alive.current) setError(e.message);
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [assetId, assetState, academyId, courseId, lectureId]);
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
    if (!editable || busy || uploadPaused) return;
    setError("");
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
    setUploadPaused(false);
    lastFile.current = file;
    setPercent(0);
    try {
      const limits = await videoApi.capabilities();
      if (!limits.enabled) throw new Error(t("disabled"));
      if (BigInt(file.size) > BigInt(limits.maxBytes))
        throw new Error(
          t("file_too_large", { size: formatVideoBytes(limits.maxBytes) }),
        );
      const key = `cove-video-upload:${target.academyId}:${target.courseId}:${target.lectureId}:${file.name}:${file.size}:${file.lastModified}`;
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
  const fieldsDisabled = !editable || query.isLoading || query.isError;
  const canUpload =
    !fieldsDisabled &&
    !busy &&
    !uploadPaused &&
    capability.data?.enabled === true;
  const canSave =
    !fieldsDisabled &&
    !busy &&
    Boolean(title.trim()) &&
    asset &&
    ["READY", "PROCESSING", "VERIFYING"].includes(asset.state);
  const processing = asset && ["PROCESSING", "VERIFYING"].includes(asset.state);
  return (
    <PrivateImageContext.Provider value={resolveImage}>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <ModalContent
          title={t("author_title")}
          className="max-h-[90dvh] max-w-[800px] overflow-clip text-ink [&>div:first-child]:shrink-0"
        >
          <button
            type="button"
            onClick={close}
            aria-label={t("close")}
            className="absolute right-4 top-3.5 grid size-9 place-items-center rounded-lg text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <X aria-hidden className="size-5" />
          </button>
          <div className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain bg-surface/70 px-5 py-6 sm:px-7">
            {query.isLoading ? (
              <p role="status" className="text-sm text-sub">
                {t("loading")}
              </p>
            ) : null}
            {query.isError ? (
              <p role="alert" className="text-sm text-danger">
                {t("unavailable")}
              </p>
            ) : null}
            <div>
              <label
                htmlFor={`${formId}-title`}
                className="mb-3 block text-sm font-semibold"
              >
                {t("title")}{" "}
                <span className="text-danger" aria-hidden>
                  *
                </span>
              </label>
              <div className="relative">
                <Input
                  id={`${formId}-title`}
                  required
                  value={title}
                  maxLength={128}
                  disabled={fieldsDisabled || busy}
                  placeholder={t("title_placeholder")}
                  aria-describedby={`${formId}-count`}
                  className="h-11 pr-20"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setDirty(true);
                  }}
                />
                <span
                  id={`${formId}-count`}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs tabular-nums text-sub"
                >
                  {title.length} / 128
                </span>
              </div>
            </div>
            <fieldset disabled={fieldsDisabled || busy}>
              <legend className="mb-2 text-sm font-semibold">
                {t("placement")}
              </legend>
              <p className="mb-3 text-xs leading-5 text-sub">
                {t("placement_hint")}
              </p>
              <div className="grid gap-2.5">
                {(["MAIN", "BOTH", "SUPPLEMENTARY"] as const).map((value) => (
                  <label
                    key={value}
                    className="flex w-fit cursor-pointer items-center gap-2.5 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-50"
                  >
                    <input
                      type="radio"
                      name={`${formId}-placement`}
                      value={value}
                      checked={placement === value}
                      className="size-4 shrink-0 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      onChange={() => {
                        setPlacement(value);
                        setDirty(true);
                      }}
                    />
                    <span
                      className={
                        placement === value
                          ? "font-medium text-brand"
                          : "text-ink"
                      }
                    >
                      {t(
                        value === "MAIN"
                          ? "main"
                          : value === "BOTH"
                            ? "both"
                            : "supplementary",
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <VideoUploadField
              asset={asset}
              percent={percent}
              paused={uploadPaused}
              disabled={!canUpload}
              maxBytes={capability.data?.maxBytes}
              loadingLimit={capability.isPending}
              error={
                error ||
                (capability.isError
                  ? t("limit_unavailable")
                  : capability.data?.enabled === false
                    ? t("disabled")
                    : "")
              }
              onChoose={(file) => {
                void choose(file);
              }}
              onPause={
                editable && busy && asset?.state === "UPLOADING"
                  ? () => {
                      void upload.current?.abort();
                      setBusy(false);
                      setUploadPaused(true);
                    }
                  : undefined
              }
              onResume={
                editable &&
                asset?.state === "UPLOADING" &&
                (uploadPaused || Boolean(error))
                  ? () => {
                      if (uploadPaused) {
                        setUploadPaused(false);
                        setBusy(true);
                        upload.current?.resume();
                      } else if (lastFile.current)
                        void choose(lastFile.current);
                    }
                  : undefined
              }
              onRetry={
                editable && !busy && asset?.failureCode?.startsWith("TRANSIENT")
                  ? () => {
                      void videoApi
                        .retry({ ...target, assetId: asset.id })
                        .then(() => {
                          setError("");
                          setAsset({
                            ...asset,
                            state: "VERIFYING",
                            failureCode: null,
                          });
                        })
                        .catch((cause) => setError(cause.message));
                    }
                  : undefined
              }
            />
            {material &&
            query.data?.asset.state === "READY" &&
            asset?.id === query.data.asset.id ? (
              <div className="space-y-3">
                <button
                  type="button"
                  className={videoActionClass}
                  aria-expanded={preview}
                  onClick={() => setPreview(!preview)}
                >
                  <Eye aria-hidden className="size-4" />
                  {t("preview")}
                </button>
                {preview ? (
                  <div className="overflow-hidden rounded-xl">
                    <VideoPlayer
                      data={query.data}
                      academyId={target.academyId}
                      preview
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-3">
              <VideoAuthorSection
                title={t("description")}
                hint={description ? t("added") : t("optional")}
              >
                <div
                  inert={fieldsDisabled || busy}
                  className={fieldsDisabled ? "opacity-60" : undefined}
                >
                  <RichEditor
                    value={description}
                    minHeight={160}
                    onChange={(value) => {
                      if (!fieldsDisabled && !busy) {
                        setDescription(value);
                        setDirty(true);
                      }
                    }}
                    onImageUpload={async (file) => {
                      if (fieldsDisabled || busy)
                        throw new Error(t("unavailable"));
                      const image = await manualApi.upload(target, file);
                      const src = `cove-asset:${image.assetId}`;
                      imageUrls.current.set(src, URL.createObjectURL(file));
                      setAssets((old) => [...old, image]);
                      setDirty(true);
                      return src;
                    }}
                  />
                </div>
              </VideoAuthorSection>
              <VideoAuthorSection
                title={t("captions")}
                hint={
                  captions.length
                    ? t("caption_count", { count: captions.length })
                    : t("optional")
                }
              >
                <VideoCaptionFields
                  target={target}
                  assetId={asset?.id}
                  ready={asset?.state === "READY"}
                  editable={!fieldsDisabled && !busy}
                  captions={captions}
                  onChange={(tracks) => {
                    setCaptions(tracks);
                    setDirty(true);
                  }}
                />
              </VideoAuthorSection>
              <VideoAuthorSection
                title={t("scoring")}
                hint={
                  placement !== "SUPPLEMENTARY" && includeInScore
                    ? t("include_score")
                    : t("excluded")
                }
              >
                <fieldset
                  disabled={
                    fieldsDisabled || busy || placement === "SUPPLEMENTARY"
                  }
                  className="space-y-4 disabled:opacity-50"
                >
                  <legend className="sr-only">{t("scoring")}</legend>
                  <label className="flex items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      checked={placement !== "SUPPLEMENTARY" && includeInScore}
                      onChange={(e) => {
                        setIncluded(e.target.checked);
                        setDirty(true);
                      }}
                    />
                    {t("include_score")}
                  </label>
                  {placement !== "SUPPLEMENTARY" && includeInScore ? (
                    <label className="grid max-w-48 gap-2 text-xs font-medium text-sub">
                      {t("maximum")}
                      <Input
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
                </fieldset>
                <p className="mt-3 text-xs leading-5 text-sub">
                  {placement === "SUPPLEMENTARY"
                    ? t("supplementary_score_hint")
                    : t("scoring_hint")}
                </p>
              </VideoAuthorSection>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-border bg-card px-5 py-4 sm:px-7">
            <p className="mr-auto flex max-w-full items-start gap-2 text-xs leading-5 text-sub sm:max-w-80">
              <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {processing ? t("processing_footer") : t("hidden_notice")}
              </span>
            </p>
            <button type="button" className={videoActionClass} onClick={close}>
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={!canSave}
              onClick={() => void save()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy && asset?.state !== "UPLOADING" ? (
                <Loader2
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Save aria-hidden className="size-4" />
              )}
              {t("save")}
            </button>
          </div>
        </ModalContent>
      </Modal>
    </PrivateImageContext.Provider>
  );
}
