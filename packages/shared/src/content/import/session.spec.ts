import { describe, expect, it } from "vitest";

import { contentImportResultSchema } from "./session.js";

describe("contentImportResultSchema", () => {
  it("accepts a valid structure-heavy receipt beyond the problem-only bound", () => {
    const entity = {
      kind: "LECTURE" as const,
      key: "LECTURE-1",
      title: "Lecture",
      action: "CREATE" as const,
      id: "10000000-0000-4000-8000-000000000001",
      lectureId: null,
    };

    const result = contentImportResultSchema.safeParse({
      sessionId: "20000000-0000-4000-8000-000000000001",
      status: "COMPLETED",
      created: 601,
      updated: 0,
      unchanged: 0,
      failed: 0,
      entities: Array.from({ length: 601 }, () => entity),
      contentRevision: 2,
      committedAt: "2026-08-24T00:00:00.000Z",
      failureCode: null,
    });

    expect(result.success).toBe(true);
  });
});
