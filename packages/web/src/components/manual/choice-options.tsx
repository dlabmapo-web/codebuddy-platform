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
    <fieldset className="grid min-w-0 gap-4 p-5 sm:p-6">
      <legend className="sr-only">{definition.question}</legend>
      <h2 className="mb-2 flex items-start gap-3 text-base font-bold leading-7"><span aria-hidden className="text-lg font-extrabold text-brand">Q.</span>{definition.question}</h2>
      {definition.problemDescription ? (
        <ChoiceRich content={definition.problemDescription} scope={scope} />
      ) : null}
      <p className="mb-1 text-xs text-sub">
        {t(definition.selectionMode === "SINGLE" ? "select_one" : "select_all")}
      </p>
      {definition.options.map((o, i) => (
        <label
          key={o.id}
          className={`group flex min-h-13 min-w-0 items-start gap-3 rounded-md border px-4 py-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand ${selected.includes(o.id) ? 'border-brand bg-brand-soft/60' : 'border-transparent bg-canvas'} ${disabled ? 'cursor-default' : 'cursor-pointer hover:border-brand/50 hover:bg-brand-soft/30'}`}
          onClick={(e) => {
            if ((e.target as Element).closest("a")) e.stopPropagation();
          }}
        >
          <input
            className="mt-1 size-4 shrink-0 accent-brand"
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
          <div className="min-w-0 flex-1 pt-0.5 text-base leading-6"><ChoiceRich content={o.content} scope={scope} /></div>
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
