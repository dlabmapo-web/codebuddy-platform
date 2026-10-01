"use client";
import { useTranslation } from "react-i18next";
import type { SubmissionResult } from "@cove/shared";
import { RichTextFrame } from "@/components/studio/rich-text-frame";

export function QuizFeedback({
  quiz,
}: {
  quiz: NonNullable<SubmissionResult["quiz"]>;
}) {
  const { t } = useTranslation("quiz");
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="font-bold">{quiz.title}</h2>
      <RichTextFrame
        content={quiz.description}
        title={quiz.title}
        minHeight={24}
        padding={0}
      />
      <ol className="space-y-2">
        {quiz.choices.map((choice, index) => (
          <li
            key={choice.id}
            className="whitespace-pre-wrap rounded-lg border border-border p-3"
          >
            <span aria-hidden>
              {choice.id === quiz.selectedChoiceId ? "● " : "○ "}
            </span>
            {index + 1}. {choice.text}
            {choice.id === quiz.selectedChoiceId ? (
              <span className="ml-2 text-sm text-sub">({t("selected")})</span>
            ) : null}
          </li>
        ))}
      </ol>
      <p>
        {t("correct_choice", {
          number:
            quiz.choices.findIndex((c) => c.id === quiz.correctChoiceId) + 1,
        })}
      </p>
      {quiz.explanation ? (
        <p className="whitespace-pre-wrap">{quiz.explanation}</p>
      ) : null}
    </section>
  );
}
