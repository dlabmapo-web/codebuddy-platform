"use client";
import { useTranslation } from "react-i18next";
import type { QuizDefinition } from "@cove/shared";

export function QuizEditor({
  value,
  onChange,
  disabled,
}: {
  value: QuizDefinition;
  onChange: (value: QuizDefinition) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation("quiz");
  return (
    <fieldset
      disabled={disabled}
      className="space-y-4 rounded-xl border border-border bg-card p-5"
    >
      <legend className="px-2 font-bold">{t("choices")}</legend>
      <p className="text-sm text-sub">{t("choose_correct")}</p>
      {value.choices.map((choice, index) => (
        <div className="flex items-center gap-3" key={choice.id}>
          <input
            type="radio"
            name="correct-choice"
            aria-label={t("correct_choice", { number: index + 1 })}
            checked={value.correctChoiceId === choice.id}
            onChange={() => onChange({ ...value, correctChoiceId: choice.id })}
          />
          <textarea
            className="min-h-12 flex-1 rounded-lg border border-border bg-canvas p-3"
            maxLength={4000}
            aria-label={t("choice", { number: index + 1 })}
            value={choice.text}
            onChange={(event) =>
              onChange({
                ...value,
                choices: value.choices.map((c) =>
                  c.id === choice.id ? { ...c, text: event.target.value } : c,
                ),
              })
            }
          />
          <button
            type="button"
            disabled={value.choices.length <= 2}
            onClick={() =>
              onChange({
                ...value,
                choices: value.choices.filter((c) => c.id !== choice.id),
                correctChoiceId:
                  value.correctChoiceId === choice.id
                    ? ""
                    : value.correctChoiceId,
              })
            }
          >
            {t("remove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={value.choices.length >= 10}
        onClick={() =>
          onChange({
            ...value,
            choices: [...value.choices, { id: crypto.randomUUID(), text: "" }],
          })
        }
      >
        {t("add_choice")}
      </button>
      <label className="block space-y-2">
        {t("explanation")}
        <textarea
          className="block min-h-24 w-full rounded-lg border border-border bg-canvas p-3"
          maxLength={10000}
          value={value.explanation}
          onChange={(event) =>
            onChange({ ...value, explanation: event.target.value })
          }
        />
      </label>
    </fieldset>
  );
}
