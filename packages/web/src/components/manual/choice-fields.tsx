"use client";
import { useState, type ReactNode } from "react";
import {
  type MultipleChoiceDefinition,
  multipleChoiceSchema,
} from "@cove/shared";
import { RichEditor } from "@/components/editor/RichEditor";
import { manualApi } from "@/lib/manual-api";
import { useManualTranslation } from "./use-manual-translation";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from "lucide-react";
import { ChoiceOptionInput } from "./choice-option-input";
import { ChoiceOptions } from "./choice-options";

export function ChoiceFields({
  academyId,
  value,
  onChange,
  locked,
  uploadImage,
  additionalSettings,
}: {
  academyId: string;
  value: MultipleChoiceDefinition;
  onChange: (value: MultipleChoiceDefinition) => void;
  locked: boolean;
  uploadImage: (file: File, privateImage?: boolean) => Promise<string>;
  additionalSettings?: ReactNode;
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
    <fieldset className="grid gap-4">
      <legend className="sr-only">{t("multiple_choice")}</legend>
      <label className="grid gap-2 text-sm font-semibold">
        {t("question")}
        <textarea rows={2} maxLength={1000} placeholder={t("quiz_simple.question_placeholder")}
          className="min-h-20 w-full resize-y rounded-xl border border-border bg-card px-3 py-3 text-base font-normal outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
          value={value.question} onChange={(e) => update({ question: e.target.value })} />
      </label>
      {locked ? <p className="rounded-lg bg-canvas p-3 text-xs text-sub">{t("definition_locked")}</p> : null}
      <div><p className="text-sm font-semibold">{t("quiz_simple.options")}</p><p className="mt-1 text-xs text-sub">{t(value.selectionMode === "MULTIPLE" ? "quiz_simple.correct_multiple_help" : "quiz_simple.correct_help")}</p></div>
      {value.options.map((option, index) => (
        <section
          key={option.id}
          className={`flex items-start gap-3 rounded-xl border p-3 ${value.correctOptionIds.includes(option.id) ? "border-success/35 bg-success/5" : "border-border bg-canvas/30"}`}
          aria-label={`${t("option")} ${index + 1}`}
        >
          <label className="mt-2.5 grid size-5 shrink-0 cursor-pointer place-items-center">
            <input
              className="size-5 accent-success"
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
            <span className="sr-only">{t("correct_option")} {index + 1}</span>
          </label>
          <ChoiceOptionInput label={`${t("option")} ${index + 1}`} value={option.content} uploadImage={uploadImage}
            onChange={(content) => update({ options: value.options.map((o) => o.id === option.id ? { ...o, content } : o) })} />
          <div className="flex shrink-0 flex-col gap-0.5 text-sub [&>button]:grid [&>button]:size-7 [&>button]:place-items-center [&>button]:rounded-md [&>button:hover]:bg-card [&>button:disabled]:opacity-30 sm:flex-row">
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
              <Trash2 aria-hidden className="size-3.5" /><span className="sr-only">{t("remove_option")}</span>
            </button>
            <button
              type="button"
              disabled={locked || index === 0}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden className="size-3.5" /><span className="sr-only">{t("move_up")}</span>
            </button>
            <button
              type="button"
              disabled={locked || index === value.options.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden className="size-3.5" /><span className="sr-only">{t("move_down")}</span>
            </button>
          </div>
        </section>
      ))}
      {new Set(value.options.map((o) => o.content)).size !==
        value.options.length && value.options.some((o) => o.content) ? (
        <p>{t("duplicate_options")}</p>
      ) : null}
      <button
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-brand/30 px-3 text-sm font-semibold text-brand hover:bg-brand-soft disabled:opacity-40"
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
        <Plus aria-hidden className="size-4" />{t("add_option")}
      </button>
      <details className="group rounded-xl border border-border bg-canvas/40">
        <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold text-sub [&::-webkit-details-marker]:hidden"><ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />{t("quiz_simple.more_settings")}</summary>
        <div className="space-y-5 border-t border-border p-4">
          <div className="grid gap-2"><p className="text-sm font-semibold">{t("answer_mode")}</p>
            <ChoiceSelector label={t("answer_mode")} disabled={locked} selectedId={value.selectionMode}
              list={[{ id: "SINGLE", name: t("single_answer") }, { id: "MULTIPLE", name: t("multiple_answers") }]}
              onSelect={(item) => update({ selectionMode: item.id as "SINGLE" | "MULTIPLE", correctOptionIds: item.id === "SINGLE" && value.correctOptionIds.length !== 1 ? [] : value.correctOptionIds })} />
          </div>
          <div className="space-y-2"><p className="text-sm font-semibold">{t("problem_description")}</p><RichEditor minHeight={120} value={value.problemDescription} onChange={(problemDescription) => update({ problemDescription })} onImageUpload={uploadImage} /></div>
      <label className="flex items-center gap-2 text-sm">
        <input
          className="size-4 accent-brand"
          type="checkbox"
          disabled={locked}
          checked={value.shuffleOptions}
          onChange={(e) => update({ shuffleOptions: e.target.checked })}
        />
        {t("shuffle_options")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          className="size-4 accent-brand"
          type="checkbox"
          checked={value.explanationEnabled}
          onChange={(e) => update({ explanationEnabled: e.target.checked })}
        />
        {t("write_explanation")}
      </label>
      {value.explanationEnabled ? (
        <RichEditor
          minHeight={120}
          value={value.explanation}
          onChange={(explanation) => update({ explanation })}
          onImageUpload={(file) => uploadImage(file, true)}
        />
      ) : null}
          {additionalSettings}
        </div>
      </details>
      <button className="justify-self-start text-sm font-semibold text-brand" type="button" onClick={() => setPreview(!preview)}>
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
