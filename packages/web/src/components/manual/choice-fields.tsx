"use client";
import { useState } from "react";
import {
  type MultipleChoiceDefinition,
  multipleChoiceSchema,
} from "@cove/shared";
import { RichEditor } from "@/components/editor/RichEditor";
import { manualApi } from "@/lib/manual-api";
import { useManualTranslation } from "./use-manual-translation";
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
    <fieldset className="grid gap-3 rounded border border-border p-4">
      <legend>{t("multiple_choice")}</legend>
      <label>
        {t("question")}
        <input
          maxLength={1000}
          className="block w-full rounded border border-border bg-card p-2"
          value={value.question}
          onChange={(e) => update({ question: e.target.value })}
        />
      </label>
      <div>
        {t("problem_description")}
        <RichEditor
          value={value.problemDescription}
          onChange={(problemDescription) => update({ problemDescription })}
          onImageUpload={uploadImage}
        />
      </div>
      {locked ? <p>{t("definition_locked")}</p> : null}
      <label>
        {t("activity_type")}
        <select
          aria-label={t("multiple_choice")}
          disabled={locked}
          value={value.selectionMode}
          onChange={(e) =>
            update({
              selectionMode: e.target.value as "SINGLE" | "MULTIPLE",
              correctOptionIds:
                e.target.value === "SINGLE" &&
                value.correctOptionIds.length !== 1
                  ? []
                  : value.correctOptionIds,
            })
          }
        >
          <option value="SINGLE">{t("single_answer")}</option>
          <option value="MULTIPLE">{t("multiple_answers")}</option>
        </select>
      </label>
      {value.options.map((option, index) => (
        <section
          key={option.id}
          className="rounded border border-border p-3"
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
          <div className="flex gap-4">
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
