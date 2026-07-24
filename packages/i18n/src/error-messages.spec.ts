import { readFileSync } from "node:fs";
import { join } from "node:path";
import { appErrorCodes } from "@cove/shared/errors";
import type { AppErrorCode } from "@cove/shared/errors";
import { describe, expect, it } from "vitest";

import { locales } from "./settings.js";
import enErrors from "./locales/en/errors.json" with { type: "json" };
import koErrors from "./locales/ko/errors.json" with { type: "json" };

// Typecheck-level coverage: adding a code without both locale entries fails
// before the runtime test suite starts.
const exhaustiveEnglish: Record<AppErrorCode, string> = enErrors;
const exhaustiveKorean: Record<AppErrorCode, string> = koErrors;
void exhaustiveEnglish;
void exhaustiveKorean;

function messages(locale: string): Record<string, string> {
  return JSON.parse(
    readFileSync(join(import.meta.dirname, "locales", locale, "errors.json"), "utf8"),
  ) as Record<string, string>;
}

/**
 * The API returns `AppErrorCode` values and the web renders the matching
 * message, so a code added to the union without a message would surface the
 * raw code to a user. This is the seam that stops that.
 */
describe("error messages", () => {
  it.each(locales)("covers every AppErrorCode in %s", (locale) => {
    const table = messages(locale);
    expect(appErrorCodes.filter((code) => !(code in table))).toEqual([]);
  });

  it.each(locales)("has an UNKNOWN fallback in %s", (locale) => {
    expect(messages(locale).UNKNOWN).toBeTruthy();
  });
});
