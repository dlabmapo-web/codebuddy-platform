import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fallbackLocale, locales } from "./settings.js";

const localesDir = join(import.meta.dirname, "locales");

/** Total bytes of one locale's namespaces allowed in the root RSC payload. */
const TOTAL_BUDGET_BYTES = 50 * 1024;
/** Bytes above which a single namespace should move to a page provider. */
const NAMESPACE_BUDGET_BYTES = 15 * 1024;

type Json = Record<string, unknown>;

function namespaceFiles(locale: string): string[] {
  return readdirSync(join(localesDir, locale))
    .filter((file) => file.endsWith(".json"))
    .sort();
}

function read(locale: string, file: string): Json {
  return JSON.parse(readFileSync(join(localesDir, locale, file), "utf8")) as Json;
}

/**
 * Korean has no grammatical plural, so i18next gives `ko` only an `_other`
 * form while English needs `_one` and `_other`. Collapsing the suffix is what
 * makes parity checkable across the two.
 */
function logicalKeys(value: Json, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const [rawKey, child] of Object.entries(value)) {
    const key = rawKey.replace(/_(zero|one|two|few|many|other)$/, "");
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      for (const nested of logicalKeys(child as Json, path)) keys.add(nested);
    } else {
      keys.add(path);
    }
  }
  return keys;
}

describe("locale files", () => {
  const reference = namespaceFiles(fallbackLocale);

  it("defines the same namespaces in every locale", () => {
    for (const locale of locales) {
      expect(namespaceFiles(locale), `namespaces in ${locale}`).toEqual(reference);
    }
  });

  describe.each(reference)("%s", (file) => {
    const referenceKeys = logicalKeys(read(fallbackLocale, file));

    it.each(locales.filter((locale) => locale !== fallbackLocale))(
      `has every key translated in %s`,
      (locale) => {
        const keys = logicalKeys(read(locale, file));
        const missing = [...referenceKeys].filter((key) => !keys.has(key));
        const extra = [...keys].filter((key) => !referenceKeys.has(key));
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      },
    );

    it("has no empty values", () => {
      for (const locale of locales) {
        const flat = JSON.stringify(read(locale, file));
        expect(flat, `${locale}/${file}`).not.toMatch(/:\s*""/);
      }
    });
  });

  it("stays inside the layout payload budget", () => {
    for (const locale of locales) {
      let total = 0;
      for (const file of namespaceFiles(locale)) {
        const bytes = readFileSync(join(localesDir, locale, file)).byteLength;
        expect(
          bytes,
          `${locale}/${file} should move to a page provider`,
        ).toBeLessThan(NAMESPACE_BUDGET_BYTES);
        total += bytes;
      }
      expect(total, `${locale} total`).toBeLessThan(TOTAL_BUDGET_BYTES);
    }
  });
});
