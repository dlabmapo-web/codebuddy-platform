"use client";
import { useState } from "react";
import type { ShortAnswerDefinition } from "@cove/shared";
import { RichEditor } from "@/components/editor/RichEditor";
import { manualApi } from "@/lib/manual-api";
import { useManualTranslation } from "./use-manual-translation";
export function ShortAnswerFields({
  academyId,
  value,
  onChange,
  locked,
}: {
  academyId: string;
  value: ShortAnswerDefinition;
  onChange: (value: ShortAnswerDefinition) => void;
  locked: boolean;
}) {
  const { t } = useManualTranslation();
  const [mode, setMode] = useState<"EXACT" | "REGEX">(
    value.gradingMode === "REGEX" ? "REGEX" : "EXACT",
  );
  const [test, setTest] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const field = <K extends keyof ShortAnswerDefinition>(
    key: K,
    next: ShortAnswerDefinition[K],
  ) => {
    setResult("");
    onChange({ ...value, [key]: next });
  };
  return (
    <fieldset className="grid gap-3 rounded border border-border p-4">
      <legend className="px-2 font-bold">{t("short_answer")}</legend>
      <label>
        {t("question")}
        <input
          className="mt-1 block w-full rounded border border-border bg-card p-2"
          maxLength={1000}
          value={value.question}
          onChange={(e) => field("question", e.target.value)}
        />
      </label>
      {locked ? (
        <p className="text-xs text-sub">{t("definition_locked")}</p>
      ) : null}
      <label>
        <input
          type="checkbox"
          disabled={locked}
          checked={value.gradingMode === "MANUAL"}
          onChange={(e) =>
            field("gradingMode", e.target.checked ? "MANUAL" : mode)
          }
        />{" "}
        {t("grade_manually")}
      </label>
      <div
        role="tablist"
        aria-label={t("matching_mode")}
        className="flex gap-4"
      >
        {(["EXACT", "REGEX"] as const).map((next) => (
          <button
            key={next}
            type="button"
            role="tab"
            aria-selected={mode === next}
            disabled={locked || value.gradingMode === "MANUAL"}
            onClick={() => {
              setMode(next);
              field("gradingMode", next);
            }}
          >
            {t(next === "EXACT" ? "normal_mode" : "advanced_mode")}
          </button>
        ))}
      </div>
      {mode === "EXACT" ? (
        <label>
          {t("correct_answer")}
          <input
            aria-label={t("correct_answer")}
            disabled={locked || value.gradingMode === "MANUAL"}
            className="mt-1 block w-full rounded border border-border bg-card p-2"
            value={value.expectedAnswer}
            maxLength={10000}
            onChange={(e) => field("expectedAnswer", e.target.value)}
          />
          <span className="text-xs text-sub">{t("exact_help")}</span>
        </label>
      ) : (
        <label>
          {t("regular_expression")}
          <input
            aria-label={t("regular_expression")}
            disabled={locked || value.gradingMode === "MANUAL"}
            className="mt-1 block w-full rounded border border-border bg-card p-2 font-mono"
            value={value.pattern}
            maxLength={2000}
            onChange={(e) => field("pattern", e.target.value)}
          />
          <span className="text-xs text-sub">{t("regex_help")}</span>
        </label>
      )}
      {value.gradingMode !== "MANUAL" ? (
        <div className="grid gap-2">
          <label>
            {t("test_answer")}
            <textarea
              className="block w-full rounded border border-border bg-card p-2"
              maxLength={10000}
              value={test}
              onChange={(e) => {
                setTest(e.target.value);
                setResult("");
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            className="justify-self-start rounded border border-border px-3 py-1"
            onClick={() => {
              setBusy(true);
              void manualApi
                .matchingPreview({ academyId, definition: value, answer: test })
                .then((r) => setResult(t(r.correct ? "correct" : "incorrect")))
                .catch((e) => setResult(e.message))
                .finally(() => setBusy(false));
            }}
          >
            {t("test_matching")}
          </button>
          <p role="status">{result}</p>
        </div>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={value.explanationEnabled}
          onChange={(e) => field("explanationEnabled", e.target.checked)}
        />{" "}
        {t("write_explanation")}
      </label>
      {value.explanationEnabled ? (
        <div>
          <p className="mb-2 text-xs text-sub">{t("explanation_help")}</p>
          <RichEditor
            value={value.explanation}
            onChange={(next) => field("explanation", next)}
          />
        </div>
      ) : null}
    </fieldset>
  );
}
