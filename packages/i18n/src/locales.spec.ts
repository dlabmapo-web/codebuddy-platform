import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fallbackLocale, layoutNamespaces, locales } from "./settings.js";

const localesDir = join(import.meta.dirname, "locales");

/**
 * Total bytes of the layout namespaces allowed in the root RSC payload.
 *
 * Raised from 50 KiB when Answer records landed: `learn` is a layout namespace
 * and the student history page, the historical-submission workspace copy, and
 * the lecture progress labels all belong to it. The per-namespace cap below is
 * the one that still forces a split, and nothing here has reached it.
 *
 * The next feature to push this should move a namespace to a page provider
 * rather than raise it again — `classes` and `auth` are both large and used by
 * one route group each.
 *
 * Raised for the class assistant-teacher copy — a dialog, a removal
 * confirmation, and the panel's new labels — which found `ko` sitting 30 bytes
 * under the line. That was the whole headroom, so the guidance above is now
 * due rather than optional, and it is a smaller job than it looks: `classes`
 * has 20 consumers, 19 of them under `/classes/`, which already has a layout
 * mounting a page provider. The twentieth is `teach/loading.tsx`, borrowing
 * four column labels that belong in `teach` anyway. The split is its own
 * change because it moves 19 files off `useLayoutTranslation`, and getting one
 * wrong renders raw keys rather than failing a build.
 */
const TOTAL_BUDGET_BYTES = 59 * 1024;
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
    const layout = new Set<string>(
      layoutNamespaces.map((namespace) => `${namespace}.json`),
    );
    for (const locale of locales) {
      let total = 0;
      for (const file of namespaceFiles(locale)) {
        const bytes = readFileSync(join(localesDir, locale, file)).byteLength;
        // Every namespace is capped, whichever provider loads it: one that
        // large is a payload problem on whatever route it ships with.
        expect(
          bytes,
          `${locale}/${file} should be split`,
        ).toBeLessThan(NAMESPACE_BUDGET_BYTES);
        // Only the layout list counts toward the root payload. A page-scoped
        // namespace is paid for by the one route that mounts it.
        if (layout.has(file)) total += bytes;
      }
      expect(total, `${locale} layout total`).toBeLessThan(TOTAL_BUDGET_BYTES);
    }
  });

  it("loads every layout namespace from a file that exists", () => {
    const files = new Set(namespaceFiles(fallbackLocale));
    for (const namespace of layoutNamespaces) {
      expect(files, namespace).toContain(`${namespace}.json`);
    }
  });
});
