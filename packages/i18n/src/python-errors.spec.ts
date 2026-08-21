import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pythonErrorFamilies,
  pythonErrorKinds,
  syntaxLessonCategories,
} from "@cove/shared";
import type {
  PythonErrorFamily,
  PythonErrorKind,
  SyntaxLessonCategory,
} from "@cove/shared";
import { describe, expect, it } from "vitest";

import { layoutNamespaces, locales } from "./settings.js";
import enPythonErrors from "./locales/en/python-errors.json" with { type: "json" };
import koPythonErrors from "./locales/ko/python-errors.json" with { type: "json" };

// Typecheck-level coverage, the same seam `error-messages.spec.ts` uses: a kind
// added to `pythonErrorKinds` without a sentence in both locales fails
// `pnpm typecheck` before the runtime suite starts.
const exhaustiveEnglish: Record<PythonErrorKind, string> =
  enPythonErrors.explanation;
const exhaustiveKorean: Record<PythonErrorKind, string> =
  koPythonErrors.explanation;
const englishFamilies: Record<PythonErrorFamily, string> =
  enPythonErrors.family;
const koreanFamilies: Record<PythonErrorFamily, string> = koPythonErrors.family;
type Lesson = {
  title: string;
  what: string;
  why: string;
  where: string;
  example: string;
  next: string;
};
const englishLessons: Record<SyntaxLessonCategory, Lesson> = enPythonErrors.lesson;
const koreanLessons: Record<SyntaxLessonCategory, Lesson> = koPythonErrors.lesson;
void englishLessons;
void koreanLessons;
void exhaustiveEnglish;
void exhaustiveKorean;
void englishFamilies;
void koreanFamilies;

type Catalog = {
  family: Record<string, string>;
  explanation: Record<string, string>;
  source_caption: string;
  line_label: string;
  coach: Record<string, string>;
  lesson: Record<string, Record<string, string>>;
};

function catalog(locale: string): Catalog {
  return JSON.parse(
    readFileSync(
      join(import.meta.dirname, "locales", locale, "python-errors.json"),
      "utf8",
    ),
  ) as Catalog;
}

/**
 * The panel renders `explanation.${classifyPythonError(type)}` for whatever the
 * Pyodide worker reported. A kind without copy would put a raw key in front of
 * a child mid-exercise, so the catalogs are pinned to the union rather than
 * kept in step by hand.
 */
describe("python error explanations", () => {
  it.each(locales)("covers every kind in %s", (locale) => {
    const { explanation } = catalog(locale);
    for (const kind of pythonErrorKinds) {
      expect(explanation[kind]?.trim()).toBeTruthy();
    }
    expect(Object.keys(explanation).sort()).toEqual([...pythonErrorKinds].sort());
  });

  it.each(locales)("covers every family in %s", (locale) => {
    const { family } = catalog(locale);
    expect(Object.keys(family).sort()).toEqual([...pythonErrorFamilies].sort());
    for (const name of pythonErrorFamilies) {
      expect(family[name]?.trim()).toBeTruthy();
    }
  });

  it.each(locales)("keeps the line label interpolated in %s", (locale) => {
    expect(catalog(locale).line_label).toContain("{{line}}");
    expect(catalog(locale).source_caption.trim()).toBeTruthy();
  });

  /**
   * The exception class is already the panel's headline, in the code face. A
   * sentence that repeats it spends a beginner's attention on the jargon
   * instead of the explanation.
   */
  it.each(locales)("keeps class names out of the sentences in %s", (locale) => {
    const { explanation } = catalog(locale);
    for (const kind of pythonErrorKinds) {
      if (kind === "unknown") continue;
      expect(explanation[kind]).not.toContain(kind);
    }
  });

  it.each(locales)("covers every syntax lesson in %s", (locale) => {
    const { lesson } = catalog(locale);
    expect(Object.keys(lesson).sort()).toEqual(
      [...syntaxLessonCategories].sort(),
    );
    for (const category of syntaxLessonCategories) {
      for (const field of ["title", "what", "why", "where", "example", "next"]) {
        expect(lesson[category]?.[field]?.trim()).toBeTruthy();
      }
    }
  });

  /**
   * The example teaches the shape of the syntax, not the answer to the
   * exercise, so it must be code a student can read — and it must be correct.
   */
  it.each(locales)("gives every lesson a runnable-looking example in %s", (locale) => {
    const { lesson } = catalog(locale);
    for (const category of syntaxLessonCategories) {
      const example = lesson[category]!.example!;
      expect(example.length).toBeLessThan(120);
      // Whatever it demonstrates, it is more than one token.
      expect(example.trim().split(/\s+/).length).toBeGreaterThan(1);
    }
  });

  it.each(locales)("keeps the coach's placeholders in %s", (locale) => {
    const { coach } = catalog(locale);
    expect(coach.location).toContain("{{line}}");
    expect(coach.location).toContain("{{column}}");
    expect(coach.where_with_column).toContain("{{detail}}");
    expect(coach.where_with_column).toContain("{{column}}");
    expect(coach.where_line_only).toContain("{{detail}}");
    expect(coach.where_no_line).toContain("{{detail}}");
    for (const key of ["my_code", "why_heading", "example_heading", "goto"]) {
      expect(coach[key]?.trim()).toBeTruthy();
    }
  });

  /**
   * Page-scoped on purpose. Sixteen sentences of Korean would not fit the root
   * RSC payload: see §8 of the design, and the budget in `locales.spec.ts`.
   */
  it("stays out of the layout namespaces", () => {
    expect(layoutNamespaces).not.toContain("python-errors");
  });
});
