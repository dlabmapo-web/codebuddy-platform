"use client";
import { useState } from "react";
import {
  type MultipleChoiceDefinition,
  multipleChoiceSchema,
} from "@cove/shared";
import { RichEditor } from "@/components/editor/RichEditor";
import { manualApi } from "@/lib/manual-api";
import { useManualTranslation } from "./use-manual-translation";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { ChoiceOptions } from "./choice-options";

export function ChoiceFields({
  academyId,
  value,
  onChange,
  locked,
  uploadImage,
}: {
  academyId: string;
  value: MultipleChoiceDefinition;
  onChange: (value: MultipleChoiceDefinition) => void;
  locked: boolean;
  uploadImage: (file: File, privateImage?: boolean) => Promise<string>;
}) {
  const { t } = useManualTranslation();
  const [preview, setPreview] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [result, setResult] = useState("");
  const update = (next: Partial<MultipleChoiceDefinition>) => {
    onChange({ ...value, ...next });
    setSelected([]);
    setResult("");
  };
  const move = (index: number, direction: number) => {
    const options = [...value.options];
    [options[index], options[index + direction]] = [
      options[index + direction],
      options[index],
    ];
    update({ options });
  };
  return (
    <fieldset className="grid gap-4 rounded-xl border border-border p-4">
      <legend className="px-2 text-sm font-bold text-brand">{t("multiple_choice")}</legend>
      <label className="grid gap-2 text-sm font-semibold">
        {t("question")}
        <input
          maxLength={1000}
          className="h-11 w-full rounded-lg border border-border bg-card px-3 font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          value={value.question}
          onChange={(e) => update({ question: e.target.value })}
        />
      </label>
      <div>
        {t("problem_description")}
        <RichEditor
          minHeight={120}
          value={value.problemDescription}
          onChange={(problemDescription) => update({ problemDescription })}
          onImageUpload={uploadImage}
        />
      </div>
      {locked ? <p>{t("definition_locked")}</p> : null}
      <div className="grid gap-2">
        <p className="text-sm font-semibold">{t("answer_mode")}</p>
        <ChoiceSelector
          label={t("answer_mode")}
          disabled={locked}
          selectedId={value.selectionMode}
          list={[{ id: "SINGLE", name: t("single_answer") }, { id: "MULTIPLE", name: t("multiple_answers") }]}
          onSelect={(item) => update({ selectionMode: item.id as "SINGLE" | "MULTIPLE", correctOptionIds: item.id === "SINGLE" && value.correctOptionIds.length !== 1 ? [] : value.correctOptionIds })}
        />
      </div>
      {value.options.map((option, index) => (
        <section
          key={option.id}
          className="space-y-3 rounded-xl border border-border bg-canvas/40 p-3"
          aria-label={`${t("option")} ${index + 1}`}
        >
          <label>
            <input
              aria-label={`${t("correct_option")} ${index + 1}`}
              disabled={locked}
              type={value.selectionMode === "SINGLE" ? "radio" : "checkbox"}
              name="author-correct-choice"
              checked={value.correctOptionIds.includes(option.id)}
              onChange={(e) =>
                update({
                  correctOptionIds:
                    value.selectionMode === "SINGLE"
                      ? [option.id]
                      : e.target.checked
                        ? [...value.correctOptionIds, option.id]
                        : value.correctOptionIds.filter(
                            (id) => id !== option.id,
                          ),
                })
              }
            />
            {t("correct_option")} {index + 1}
          </label>
          <RichEditor
            minHeight={80}
            value={option.content}
            onChange={(content) =>
              update({
                options: value.options.map((o) =>
                  o.id === option.id ? { ...o, content } : o,
                ),
              })
            }
            onImageUpload={uploadImage}
          />
          <div className="flex flex-wrap gap-2 text-xs font-semibold [&>button]:rounded-lg [&>button]:border [&>button]:border-border [&>button]:bg-card [&>button]:px-3 [&>button]:py-2 [&>button:disabled]:opacity-40">
            <button
              type="button"
              disabled={locked || value.options.length <= 2}
              onClick={() =>
                update({
                  options: value.options.filter((o) => o.id !== option.id),
                  correctOptionIds: value.correctOptionIds.filter(
                    (id) => id !== option.id,
                  ),
                })
              }
            >
              {t("remove_option")}
            </button>
            <button
              type="button"
              disabled={locked || index === 0}
              onClick={() => move(index, -1)}
            >
              {t("move_up")}
            </button>
            <button
              type="button"
              disabled={locked || index === value.options.length - 1}
              onClick={() => move(index, 1)}
            >
              {t("move_down")}
            </button>
          </div>
        </section>
      ))}
      {new Set(value.options.map((o) => o.content)).size !==
        value.options.length && value.options.some((o) => o.content) ? (
        <p>{t("duplicate_options")}</p>
      ) : null}
      <button
        type="button"
        disabled={locked || value.options.length >= 20}
        onClick={() =>
          update({
            options: [
              ...value.options,
              { id: crypto.randomUUID(), content: "" },
            ],
          })
        }
      >
        {t("add_option")}
      </button>
      <label>
        <input
          type="checkbox"
          disabled={locked}
          checked={value.shuffleOptions}
          onChange={(e) => update({ shuffleOptions: e.target.checked })}
        />
        {t("shuffle_options")}
      </label>
      <label>
        <input
          type="checkbox"
          checked={value.explanationEnabled}
          onChange={(e) => update({ explanationEnabled: e.target.checked })}
        />
        {t("write_explanation")}
      </label>
      {value.explanationEnabled ? (
        <RichEditor
          value={value.explanation}
          onChange={(explanation) => update({ explanation })}
          onImageUpload={(file) => uploadImage(file, true)}
        />
      ) : null}
      <button type="button" onClick={() => setPreview(!preview)}>
        {t("preview_question")}
      </button>
      {preview ? (
        <>
          <ChoiceOptions
            definition={value}
            selected={selected}
            onChange={setSelected}
          />
          <button
            type="button"
            disabled={!selected.length}
            onClick={() => {
              setResult("");
              try {
                const definition = multipleChoiceSchema.parse(value);
                void manualApi
                  .choicePreview({
                    academyId,
                    definition,
                    selectedOptionIds: selected,
                    displayOrder: value.options.map((o) => o.id),
                  })
                  .then((r) =>
                    setResult(t(r.correct ? "correct" : "incorrect")),
                  )
                  .catch((e) => setResult(e.message));
              } catch {
                setResult(t("could_not_save"));
              }
            }}
          >
            {t("test_selection")}
          </button>
          <p role="status">{result}</p>
        </>
      ) : null}
    </fieldset>
  );
}
