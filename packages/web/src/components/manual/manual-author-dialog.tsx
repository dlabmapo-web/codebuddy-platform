"use client";
import { FileCode2, ListChecks, PenLine, Save, X } from "lucide-react";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { PrivateImageContext } from "@/components/editor/private-image-context";
import { ChoiceFields } from "./choice-fields";
import { ShortAnswerFields } from "./short-answer-fields";
import { publicConfig } from "@/lib/config";
import { useManualTranslation } from "./use-manual-translation";
import { RichEditor } from "@/components/editor/RichEditor";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useContentAcademySlug } from "@/components/studio/content-base-path-provider";
import { Modal, ModalContent } from "@/components/studio/primitives";
import {
  manualConfigSchema,
  saveManualSchema,
  type ManualConfig,
  type MultipleChoiceDefinition,
  type SaveManual,
} from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { routes } from "@/lib/routes";
export function ManualAuthorDialog({
  target,
  material,
  type = "TURTLE_EXERCISE",
  shortAnswer = false,
  onClose,
  onSaved,
}: {
  target: { academyId: string; courseId: string; lectureId: string };
  material?: { id: string; title: string; type: string };
  type?: SaveManual["type"];
  shortAnswer?: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { t: mt } = useManualTranslation();
  const slug = useContentAcademySlug();
  const materialId = material?.id;
  const imageUrls = useRef(new Map<string, string>());
  useEffect(
    () => () => {
      for (const url of imageUrls.current.values())
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    },
    [],
  );
  const resolveImage = useCallback(
    async (src: string) => {
      const cached = imageUrls.current.get(src);
      if (cached) return cached;
      if (!materialId) throw new Error("Image is unavailable");
      const { url } = await manualApi.choiceImage({
        academyId: target.academyId,
        materialId,
        assetId: src.slice("cove-asset:".length),
        preview: true,
      });
      imageUrls.current.set(src, url);
      return url;
    },
    [materialId, target.academyId],
  );
  const [title, setTitle] = useState(material?.title ?? "");
  const [config, setConfig] = useState<ManualConfig>(() => ({
    ...manualConfigSchema.parse({}),
    multipleChoice:
      type === "MULTIPLE_CHOICE"
        ? {
            version: 1,
            question: "",
            problemDescription: "",
            selectionMode: "SINGLE",
            options: [
              { id: crypto.randomUUID(), content: "" },
              { id: crypto.randomUUID(), content: "" },
            ],
            correctOptionIds: [],
            shuffleOptions: false,
            explanationEnabled: false,
            explanation: "",
          }
        : null,
    shortAnswer: shortAnswer
      ? {
          version: 1,
          question: "",
          gradingMode: "MANUAL",
          expectedAnswer: "",
          pattern: "",
          explanationEnabled: false,
          explanation: "",
        }
      : null,
  }));
  const [locked, setLocked] = useState(false);
  const [revision, setRevision] = useState<number>();
  const [busy, setBusy] = useState(Boolean(material));
  const [error, setError] = useState("");
  const [kind, setKind] = useState<SaveManual["type"]>(
    (material?.type as SaveManual["type"]) ?? type,
  );
  const [sourceName, setSourceName] = useState("main.py");
  useEffect(() => {
    let active = true;
    if (material)
      void manualApi
        .read({
          academyId: target.academyId,
          materialId: material.id,
          preview: true,
        })
        .then((data) => {
          if (active) {
            setConfig(data.config);
            setLocked(Boolean(data.definitionLocked));
            setRevision(data.config.revision);
            setSourceName(data.config.entryPoint);
            setBusy(false);
          }
        })
        .catch((e) => {
          if (active) {
            setError(e.message);
            setBusy(false);
          }
        });
    return () => {
      active = false;
    };
  }, [material, target.academyId]);
  function field<K extends keyof ManualConfig>(key: K, value: ManualConfig[K]) {
    setConfig((old) => ({ ...old, [key]: value }));
  }
  async function uploadImage(file: File, privateImage = false) {
    try {
      const asset = await manualApi.upload(target, file);
      imageUrls.current.set(
        `cove-asset:${asset.assetId}`,
        URL.createObjectURL(file),
      );
      setConfig((old) => ({
        ...old,
        [privateImage ? "solutionAssets" : "assets"]: [
          ...old[privateImage ? "solutionAssets" : "assets"],
          asset,
        ],
      }));
      return `cove-asset:${asset.assetId}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("could_not_save"));
      throw e;
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      if (
        config.multipleChoice &&
        !(await manualApi.capabilities()).multipleChoice
      )
        throw new Error(mt("choice_unavailable"));
      if (config.shortAnswer && !(await manualApi.capabilities()).shortAnswer)
        throw new Error(mt("evaluation_unavailable"));
      await manualApi.save(
        saveManualSchema.parse({
          ...target,
          ...config,
          ...(kind !== "TURTLE_EXERCISE"
            ? {
                files: {},
                solutionFiles: null,
                ...(kind === "WRITTEN_RESPONSE"
                  ? { assets: [], solutionAssets: [] }
                  : {}),
              }
            : {}),
          title,
          type: kind,
          materialId: material?.id,
          revision,
        }),
      );
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("could_not_save"));
    } finally {
      setBusy(false);
    }
  }
  const ActivityIcon = kind === "MULTIPLE_CHOICE" ? ListChecks : kind === "TURTLE_EXERCISE" ? FileCode2 : PenLine;
  return (
    <PrivateImageContext.Provider value={resolveImage}>
      <Modal
        open
        onOpenChange={(value) => {
          if (!value && !busy) onClose();
        }}
      >
        <ModalContent
          title={material ? mt("edit_activity") : mt(shortAnswer ? "add_short_answer" : kind === "MULTIPLE_CHOICE" ? "add_multiple_choice" : "add_activity")}
          description={mt("author_description")}
          className="max-w-3xl"
        >
          <button type="button" aria-label={mt("close_author")} disabled={busy} onClick={onClose} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40">
            <X aria-hidden className="size-5" />
          </button>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="flex items-start gap-3 rounded-xl border border-brand/15 bg-brand-soft/50 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><ActivityIcon aria-hidden className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs font-semibold text-sub">{mt("activity_type")}</p>
                <ChoiceSelector
                  label={mt("activity_type")}
                  className="bg-card"
                  selectedId={kind}
                  disabled={Boolean(material) || busy || type === "MULTIPLE_CHOICE" || shortAnswer}
                  list={[
                    ...(publicConfig.guiEnabled || kind === "TURTLE_EXERCISE" ? [{ id: "TURTLE_EXERCISE", name: mt("turtle_exercise") }] : []),
                    ...(kind === "MULTIPLE_CHOICE" ? [{ id: "MULTIPLE_CHOICE", name: mt("multiple_choice") }] : []),
                    { id: "WRITTEN_RESPONSE", name: shortAnswer ? mt("short_answer") : mt("written_response") },
                  ]}
                  onSelect={(item) => setKind(item.id as SaveManual["type"])}
                />
              </div>
            </div>
            <label className="grid gap-2 text-sm font-semibold">
              {mt("title")}
              <input
                className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={128}
              />
            </label>
            <div className="space-y-2">
              <p className="text-sm font-semibold">{mt("instructions")}</p>
              <RichEditor
                minHeight={kind === "MULTIPLE_CHOICE" ? 120 : 200}
                value={config.description}
                onChange={(value) => field("description", value)}
                onImageUpload={
                  kind === "MULTIPLE_CHOICE"
                    ? (file) => uploadImage(file)
                    : undefined
                }
              />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-border bg-canvas/60 p-4 text-sm">
              <label>
                <input
                  className="size-4 align-middle accent-brand"
                  type="checkbox"
                  checked={config.submitEnabled}
                  onChange={(e) => field("submitEnabled", e.target.checked)}
                />{" "}
                {mt("enable_submit")}
              </label>
              <label>
                <input
                  className="size-4 align-middle accent-brand"
                  type="checkbox"
                  checked={!config.includeInScore}
                  onChange={(e) => field("includeInScore", !e.target.checked)}
                />{" "}
                {mt("exclude_from_score")}
              </label>
            </div>
            {kind === "TURTLE_EXERCISE" ? (
              <p className="text-xs text-sub">
                {mt(
                  "teacher_graded_drawings_are_not_automatically_marked_correct_or_wrong",
                )}
              </p>
            ) : null}
            {config.multipleChoice ? (
              <ChoiceFields
                academyId={target.academyId}
                value={config.multipleChoice as MultipleChoiceDefinition}
                onChange={(value) => field("multipleChoice", value)}
                locked={locked}
                uploadImage={uploadImage}
              />
            ) : null}
            {config.shortAnswer ? (
              <ShortAnswerFields
                academyId={target.academyId}
                value={config.shortAnswer}
                onChange={(value) => field("shortAnswer", value)}
                locked={locked}
              />
            ) : null}
            <label className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas/60 p-4 text-sm font-semibold">
              {mt("maximum_score")}
              <input
                aria-label={mt("maximum_score")}
                type="number"
                min={0.01}
                step={0.01}
                className="w-28 rounded-lg border border-border bg-card p-2 text-right font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                value={config.maximumHundredths / 100}
                onChange={(e) =>
                  field(
                    "maximumHundredths",
                    Math.round(Number(e.target.value) * 100),
                  )
                }
              />
            </label>
            {kind === "TURTLE_EXERCISE" ? (
              <>
                <div className="flex gap-3">
                  <label>
                    {mt("entry_point")}
                    <input
                      className="ml-2 rounded border border-border bg-card p-2"
                      value={config.entryPoint}
                      onChange={(e) => field("entryPoint", e.target.value)}
                    />
                  </label>
                  <label>
                    {mt("file")}
                    <ChoiceSelector label={mt("file")} selectedId={sourceName} list={Object.keys(config.files).map((name) => ({ id: name, name }))} onSelect={(item) => setSourceName(item.id)} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const name = window.prompt(mt("python_file_name"));
                      if (name && !Object.hasOwn(config.files, name)) {
                        field("files", { ...config.files, [name]: "" });
                        setSourceName(name);
                      }
                    }}
                  >
                    {mt("add_file")}
                  </button>
                </div>
                <label>
                  {mt("starter_code")}
                  <textarea
                    aria-label={mt("starter_code")}
                    className="mt-1 block min-h-48 w-full rounded border border-border bg-editor-bg p-3 font-mono text-sm text-white"
                    spellCheck={false}
                    value={config.files[sourceName] ?? ""}
                    onChange={(e) =>
                      field("files", {
                        ...config.files,
                        [sourceName]: e.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  {mt("lesson_data_image_files_read_only_under_assets")}
                  <input
                    aria-label={mt("lesson_asset")}
                    type="file"
                    accept=".gif,.png,.jpg,.txt,.csv,.json"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBusy(true);
                        void manualApi
                          .upload(target, file)
                          .then((asset) =>
                            field("assets", [...config.assets, asset]),
                          )
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }
                    }}
                  />
                </label>
                <ul>
                  {config.assets.map((asset) => (
                    <li key={asset.assetId}>
                      {asset.name} · {asset.byteSize} bytes{" "}
                      <button
                        type="button"
                        onClick={() =>
                          field(
                            "assets",
                            config.assets.filter(
                              (a) => a.assetId !== asset.assetId,
                            ),
                          )
                        }
                      >
                        {mt("remove_asset")}
                      </button>
                    </li>
                  ))}
                </ul>
                <label>
                  {mt("solution_asset_private")}
                  <input
                    aria-label={mt("solution_asset_private")}
                    type="file"
                    accept=".gif,.png,.jpg,.txt,.csv,.json"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setBusy(true);
                        void manualApi
                          .upload(target, file)
                          .then((asset) =>
                            field("solutionAssets", [
                              ...config.solutionAssets,
                              asset,
                            ]),
                          )
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }
                    }}
                  />
                </label>
                <ul>
                  {config.solutionAssets.map((a) => (
                    <li key={a.assetId}>
                      {a.name}{" "}
                      <button
                        type="button"
                        onClick={() =>
                          field(
                            "solutionAssets",
                            config.solutionAssets.filter(
                              (x) => x.assetId !== a.assetId,
                            ),
                          )
                        }
                      >
                        {mt("remove_asset")}
                      </button>
                    </li>
                  ))}
                </ul>
                <label>
                  {mt("solution_code_private")}
                  <textarea
                    aria-label={mt("solution_code")}
                    className="mt-1 block min-h-24 w-full rounded border border-border bg-card p-2 font-mono text-sm"
                    value={config.solutionFiles?.[config.entryPoint] ?? ""}
                    onChange={(e) =>
                      field(
                        "solutionFiles",
                        e.target.value
                          ? { [config.entryPoint]: e.target.value }
                          : null,
                      )
                    }
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      "width",
                      "height",
                      "timeLimitSeconds",
                      "memoryLimitMb",
                    ] as const
                  ).map((key) => (
                    <label key={key}>
                      {
                        {
                          width: "Display width",
                          height: "Display height",
                          timeLimitSeconds: "Time limit (seconds)",
                          memoryLimitMb: "Memory limit (MiB)",
                        }[key]
                      }
                      <input
                        aria-label={key}
                        type="number"
                        className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                        value={config[key]}
                        onChange={(e) => field(key, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </>
            ) : kind === "WRITTEN_RESPONSE" ? (
              <div className="space-y-4 rounded-xl border border-border bg-canvas/40 p-4">
                <label className="block text-sm font-semibold">
                  {mt("model_answer_private")}
                  <textarea
                    aria-label={mt("model_answer_private")}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    value={config.modelAnswer}
                    onChange={(e) => field("modelAnswer", e.target.value)}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  {mt("input_hint")}
                  <input
                    className="mt-1 block min-h-11 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
                    value={config.hint}
                    onChange={(e) => field("hint", e.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {material ? (
              <Link
                target="_blank"
                href={routes.academyLearnAssessment(slug, material.id, kind, {
                  preview: true,
                })}
              >
                {mt("preview_activity")}
              </Link>
            ) : null}
            {error ? (
              <p role="alert" className="rounded-lg border border-danger/20 bg-danger/5 p-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-canvas/60 px-6 py-4">
            <button type="button" disabled={busy} onClick={onClose} className="h-10 rounded-lg border border-border bg-card px-4 text-sm font-semibold text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-40">
              {mt("cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40"
              disabled={
                busy || !title.trim() ||
                Boolean(
                  config.multipleChoice &&
                  !saveManualSchema.safeParse({
                    ...target,
                    ...config,
                    title,
                    type: kind,
                    materialId: material?.id,
                    revision,
                  }).success,
                )
              }
              onClick={() => void save()}
            >
              <Save aria-hidden className="size-4" />{mt("save_activity")}
            </button>
          </div>
        </ModalContent>
      </Modal>
    </PrivateImageContext.Provider>
  );
}
