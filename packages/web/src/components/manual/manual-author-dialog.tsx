"use client";
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
      if (!material) throw new Error("Image is unavailable");
      const { url } = await manualApi.choiceImage({
        academyId: target.academyId,
        materialId: material.id,
        assetId: src.slice("cove-asset:".length),
        preview: true,
      });
      imageUrls.current.set(src, url);
      return url;
    },
    [material?.id, target.academyId],
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
  return (
    <PrivateImageContext.Provider value={resolveImage}>
      <Modal
        open
        onOpenChange={(value) => {
          if (!value && !busy) onClose();
        }}
      >
        <ModalContent
          title={material ? mt("edit_activity") : mt("add_activity")}
          className="max-w-3xl"
        >
          <h2 className="text-lg font-bold">
            {material ? mt("edit_activity") : mt("add_activity")}
          </h2>
          <div className="grid max-h-[70vh] gap-4 overflow-auto p-1">
            <label>
              {mt("activity_type")}
              <select
                className="ml-3 rounded border border-border bg-card p-2"
                value={kind}
                disabled={
                  Boolean(material) ||
                  busy ||
                  type === "MULTIPLE_CHOICE" ||
                  shortAnswer
                }
                onChange={(e) => setKind(e.target.value as SaveManual["type"])}
              >
                {publicConfig.guiEnabled ? (
                  <option value="TURTLE_EXERCISE">
                    {mt("turtle_exercise")}
                  </option>
                ) : null}
                {kind === "MULTIPLE_CHOICE" ? (
                  <option value="MULTIPLE_CHOICE">
                    {mt("multiple_choice")}
                  </option>
                ) : null}
                <option value="WRITTEN_RESPONSE">
                  {mt("written_response")}
                </option>
              </select>
            </label>
            <label>
              {mt("title")}
              <input
                className="mt-1 block w-full rounded border border-border bg-card p-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={128}
              />
            </label>
            <div>
              {mt("instructions")}
              <RichEditor
                value={config.description}
                onChange={(value) => field("description", value)}
                onImageUpload={
                  kind === "MULTIPLE_CHOICE"
                    ? (file) => uploadImage(file)
                    : undefined
                }
              />
            </div>
            <div className="flex gap-5">
              <label>
                <input
                  type="checkbox"
                  checked={config.submitEnabled}
                  onChange={(e) => field("submitEnabled", e.target.checked)}
                />{" "}
                {mt("enable_submit")}
              </label>
              <label>
                <input
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
            <label>
              {mt("maximum_score")}
              <input
                aria-label={mt("maximum_score")}
                type="number"
                min={0.01}
                step={0.01}
                className="ml-3 rounded border border-border bg-card p-2"
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
                    <select
                      aria-label={mt("file")}
                      className="ml-2 rounded border border-border bg-card p-2"
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                    >
                      {Object.keys(config.files).map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
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
                        className="mt-1 block w-full rounded border border-border bg-card p-2"
                        value={config[key]}
                        onChange={(e) => field(key, Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </>
            ) : kind === "WRITTEN_RESPONSE" ? (
              <div>
                <label>
                  {mt("model_answer_private")}
                  <textarea
                    aria-label={mt("model_answer_private")}
                    className="mt-1 block w-full rounded border border-border bg-card p-2"
                    value={config.modelAnswer}
                    onChange={(e) => field("modelAnswer", e.target.value)}
                  />
                </label>
                <label>
                  {mt("input_hint")}
                  <input
                    className="mt-1 block w-full rounded border border-border bg-card p-2"
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
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <div className="mt-5 flex justify-end gap-4">
            <button type="button" disabled={busy} onClick={onClose}>
              {mt("cancel")}
            </button>
            <button
              type="button"
              className="rounded bg-brand px-4 py-2 text-white"
              disabled={
                busy ||
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
              {mt("save_activity")}
            </button>
          </div>
        </ModalContent>
      </Modal>
    </PrivateImageContext.Provider>
  );
}
