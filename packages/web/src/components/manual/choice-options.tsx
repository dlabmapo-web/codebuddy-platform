"use client";
import { useEffect, useState, useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePrivateImageResolver } from "@/components/editor/private-image-context";
import DOMPurify from "dompurify";
import {
  effectiveManualResult,
  type PublicChoiceDefinition,
  type ManualAttempt,
} from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { useManualTranslation } from "./use-manual-translation";
type ImageScope = {
  academyId: string;
  materialId: string;
  classId?: string;
  submissionId?: string;
  preview?: boolean;
};
export function ChoiceRich({
  content,
  scope,
}: {
  content: string;
  scope?: ImageScope;
}) {
  const [html, setHtml] = useState("");
  const resolvePrivate = usePrivateImageResolver();
  const scopeKey = JSON.stringify(scope);
  useEffect(() => {
    let active = true;
    const safe = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "s",
        "code",
        "pre",
        "ul",
        "ol",
        "li",
        "blockquote",
        "h1",
        "h2",
        "h3",
        "h4",
        "a",
        "img",
      ],
      ALLOWED_ATTR: ["href", "target", "rel", "src", "alt"],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|cove-asset:)/i,
    });
    const doc = new DOMParser().parseFromString(safe, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));
    for (const image of images) image.removeAttribute("src");
    // DOMParser exists only in the browser, so sanitised HTML is set after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHtml(doc.body.innerHTML);
    if (scope || resolvePrivate)
      void Promise.all(
        images.map(async (image, index) => {
          const original = new DOMParser()
            .parseFromString(safe, "text/html")
            .querySelectorAll("img")
            [index]?.getAttribute("src");
          const id = original?.match(/^cove-asset:([0-9a-f-]{36})$/i)?.[1];
          if (id) {
            try {
              const url = scope
                ? (await manualApi.choiceImage({ ...scope, assetId: id })).url
                : await resolvePrivate!("cove-asset:" + id);
              image.setAttribute("src", url);
            } catch {
              image.replaceWith(doc.createTextNode(image.alt));
            }
          }
        }),
      ).then(() => {
        if (active) setHtml(doc.body.innerHTML);
      });
    return () => {
      active = false;
    };
  }, [content, scopeKey, resolvePrivate]);
  return (
    <div
      className="choice-rich min-w-0 break-words [&_img]:max-w-full [&_pre]:overflow-auto [&_a]:text-brand"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
export function ChoiceOptions({
  definition,
  selected,
  onChange,
  disabled = false,
  scope,
}: {
  definition: PublicChoiceDefinition;
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  scope?: ImageScope;
}) {
  const { t } = useManualTranslation();
  const groupName = useId();
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-3 font-semibold">Q. {definition.question}</legend>
      {definition.problemDescription ? (
        <ChoiceRich content={definition.problemDescription} scope={scope} />
      ) : null}
      <p className="text-sm text-sub">
        {t(definition.selectionMode === "SINGLE" ? "select_one" : "select_all")}
      </p>
      {definition.options.map((o, i) => (
        <label
          key={o.id}
          className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 has-[:checked]:border-brand has-[:focus-visible]:outline-2"
          onClick={(e) => {
            if ((e.target as Element).closest("a")) e.stopPropagation();
          }}
        >
          <input
            className="mt-1"
            aria-label={`${t("option")} ${i + 1}: ${o.content
              .replace(/<img\b[^>]*\balt=["']([^"']*)["'][^>]*>/gi, " $1 ")
              .replace(/<[^>]*>/g, " ")
              .trim()}`}
            name={groupName}
            type={definition.selectionMode === "SINGLE" ? "radio" : "checkbox"}
            checked={selected.includes(o.id)}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                definition.selectionMode === "SINGLE"
                  ? [o.id]
                  : e.target.checked
                    ? [...selected, o.id]
                    : selected.filter((id) => id !== o.id),
              )
            }
          />
          <ChoiceRich content={o.content} scope={scope} />
        </label>
      ))}
    </fieldset>
  );
}
export function ChoiceAttempt({
  attempt,
  scope,
}: {
  attempt: ManualAttempt;
  scope: ImageScope;
}) {
  const choice = attempt.multipleChoiceAssessment;
  if (!choice) return null;
  const options = choice.displayOrder
    .map((id) => choice.definition.options.find((o) => o.id === id)!)
    .filter(Boolean);
  return (
    <ChoiceOptions
      definition={{ ...choice.definition, options }}
      selected={choice.selectedOptionIds}
      disabled
      onChange={() => {}}
      scope={{ ...scope, submissionId: attempt.id, classId: attempt.classId }}
    />
  );
}

export function ChoiceHistoryExplanation({
  attempt,
  scope,
}: {
  attempt: ManualAttempt;
  scope: ImageScope;
}) {
  const { t } = useManualTranslation();
  const completed = effectiveManualResult(attempt)?.completed;
  const query = useQuery({
    queryKey: [
      "choice-history-explanation",
      scope.academyId,
      scope.materialId,
      attempt.classId,
      attempt.id,
      attempt.reviewVersion,
    ],
    queryFn: () =>
      manualApi.explanation({
        ...scope,
        classId: attempt.classId,
        submissionId: attempt.id,
      }),
    enabled: Boolean(
      completed &&
      attempt.multipleChoiceAssessment?.definition.explanationEnabled &&
      !scope.preview,
    ),
    retry: false,
  });
  if (!completed || !query.data?.explanation) return null;
  return (
    <section data-testid="choice-history-explanation">
      <h3 className="font-semibold">{t("explanation")}</h3>
      <ChoiceRich
        content={query.data.explanation}
        scope={{ ...scope, classId: attempt.classId, submissionId: attempt.id }}
      />
    </section>
  );
}
