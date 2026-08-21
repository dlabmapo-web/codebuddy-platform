import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { curriculumAuditActions } from "@cove/shared";
import { describe, expect, it } from "vitest";

/**
 * The promise `curriculumAuditActions` makes, enforced.
 *
 * The shared list says the API's content actions are kept in step with it, and
 * without this test that is a comment rather than a guarantee. `AuditService`
 * takes `action: string` — widening it to a union would touch every audit
 * writer in the product, including people operations and the platform console,
 * which is a change this feature has no business making — so the coupling is
 * checked here instead, at the one place both halves are visible.
 *
 * The failure mode it exists to prevent is specific and has already happened
 * once, to the manager's panel: a service starts writing a new action, the
 * panel has no name for it, and a real change in a real academy renders as a
 * raw dotted code with nothing in the type system able to notice.
 */

const source = readFileSync(
  fileURLToPath(new URL("../content/course.service.ts", import.meta.url)),
  "utf8",
);

/** Every `content.*` string literal the content service actually writes. */
const written = new Set(
  [...source.matchAll(/"(content\.[a-z_.]+)"/g)].map((match) => match[1]),
);

describe("curriculum audit vocabulary", () => {
  it("finds the content service's audit actions at all", () => {
    // A guard on the guard: if the service is refactored so these literals stop
    // being literals, the two assertions below would both pass vacuously.
    expect(written.size).toBeGreaterThan(10);
  });

  it("names every action the content service writes", () => {
    const named = new Set<string>(curriculumAuditActions);
    const unnamed = [...written].filter((action) => !named.has(action)).sort();
    expect(unnamed).toEqual([]);
  });

  it("does not name an action nothing writes", () => {
    const stale = curriculumAuditActions
      .filter((action) => !written.has(action))
      .sort();
    expect(stale).toEqual([]);
  });
});
