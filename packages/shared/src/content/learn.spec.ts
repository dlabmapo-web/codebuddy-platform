import { describe, expect, it } from "vitest";

import {
  DRAFT_MAX_BYTES,
  flattenOutlineExercises,
  learnExerciseWorkspaceSchema,
  progressStatusFromDraft,
  resolveExerciseNeighbors,
  resolveInitialCode,
  saveDraftSchema,
} from "./learn.js";

const exercise = (materialId: string, position: number) => ({
  materialId,
  title: `Exercise ${materialId}`,
  position,
});

const outline = [
  {
    position: 2,
    lectures: [
      { id: "lecture-c", position: 1, exercises: [exercise("d", 1)] },
    ],
  },
  {
    position: 1,
    lectures: [
      {
        id: "lecture-b",
        position: 2,
        exercises: [exercise("c", 1)],
      },
      {
        id: "lecture-a",
        position: 1,
        exercises: [exercise("b", 2), exercise("a", 1)],
      },
    ],
  },
];

describe("flattenOutlineExercises", () => {
  it("orders by module, then lecture, then exercise position", () => {
    expect(flattenOutlineExercises(outline).map((item) => item.materialId))
      .toEqual(["a", "b", "c", "d"]);
  });

  it("carries the owning lecture id so callers can link back", () => {
    const [first] = flattenOutlineExercises(outline);
    expect(first.lectureId).toBe("lecture-a");
  });

  it("does not mutate the input", () => {
    const modules = structuredClone(outline);
    flattenOutlineExercises(modules);
    expect(modules).toEqual(outline);
  });

  it("returns nothing for an outline with no exercises", () => {
    expect(
      flattenOutlineExercises([
        { position: 1, lectures: [{ id: "l", position: 1, exercises: [] }] },
      ]),
    ).toEqual([]);
  });
});

describe("resolveExerciseNeighbors", () => {
  const ordered = flattenOutlineExercises(outline);

  it("crosses lecture and module boundaries", () => {
    // "b" ends lecture-a and "c" opens lecture-b.
    const fromB = resolveExerciseNeighbors(ordered, "b");
    expect(fromB.next?.materialId).toBe("c");
    // "c" ends module 1 and "d" opens module 2.
    const fromC = resolveExerciseNeighbors(ordered, "c");
    expect(fromC.next?.materialId).toBe("d");
  });

  it("has no previous at the start and no next at the end", () => {
    expect(resolveExerciseNeighbors(ordered, "a").previous).toBeNull();
    expect(resolveExerciseNeighbors(ordered, "d").next).toBeNull();
  });

  it("returns both null for an exercise outside the outline", () => {
    expect(resolveExerciseNeighbors(ordered, "missing")).toEqual({
      previous: null,
      next: null,
    });
  });
});

describe("resolveInitialCode", () => {
  const starterCode = "# start here";

  it("falls back to starter code when nothing is saved", () => {
    expect(
      resolveInitialCode({ localDraft: null, serverDraft: null, starterCode }),
    ).toEqual({ code: starterCode, source: "starter" });
  });

  it("prefers a local draft newer than the server's", () => {
    expect(
      resolveInitialCode({
        localDraft: { code: "local", updatedAt: "2026-07-31T10:00:01.000Z" },
        serverDraft: { code: "server", updatedAt: "2026-07-31T10:00:00.000Z" },
        starterCode,
      }),
    ).toEqual({ code: "local", source: "local" });
  });

  it("prefers the server draft when it is newer", () => {
    expect(
      resolveInitialCode({
        localDraft: { code: "local", updatedAt: "2026-07-31T10:00:00.000Z" },
        serverDraft: { code: "server", updatedAt: "2026-07-31T10:00:01.000Z" },
        starterCode,
      }),
    ).toEqual({ code: "server", source: "server" });
  });

  it("prefers the server draft on an exact tie", () => {
    // A tie means the last sync completed, so the server copy is authoritative
    // and there is nothing local to recover.
    const updatedAt = "2026-07-31T10:00:00.000Z";
    expect(
      resolveInitialCode({
        localDraft: { code: "local", updatedAt },
        serverDraft: { code: "server", updatedAt },
        starterCode,
      }),
    ).toEqual({ code: "server", source: "server" });
  });

  it("uses an empty local draft rather than reinstating starter code", () => {
    // A student who deleted everything must not have it silently restored.
    expect(
      resolveInitialCode({
        localDraft: { code: "", updatedAt: "2026-07-31T10:00:00.000Z" },
        serverDraft: null,
        starterCode,
      }),
    ).toEqual({ code: "", source: "local" });
  });
});

describe("progressStatusFromDraft", () => {
  it("maps draft presence to a status", () => {
    expect(progressStatusFromDraft(true)).toBe("IN_PROGRESS");
    expect(progressStatusFromDraft(false)).toBe("NOT_STARTED");
  });
});

describe("saveDraftSchema", () => {
  const base = {
    academyId: "3f1e6b1e-6c3e-4a4f-9b6a-1d2e3f4a5b6c",
    materialId: "8a7b6c5d-4e3f-4a2b-9c8d-7e6f5a4b3c2d",
  };

  it("accepts an empty draft", () => {
    expect(saveDraftSchema.safeParse({ ...base, code: "" }).success).toBe(true);
  });

  it("rejects a draft over the size cap", () => {
    const code = "x".repeat(DRAFT_MAX_BYTES + 1);
    expect(saveDraftSchema.safeParse({ ...base, code }).success).toBe(false);
  });
});

describe("learnExerciseWorkspaceSchema", () => {
  it("strips a hidden test case smuggled into the exercise payload", () => {
    // The structural guarantee behind §7.3: even if a service builds an object
    // carrying hidden expectations, the schema has nowhere to put them, so
    // parsing drops them before they reach the wire.
    const parsed = learnExerciseWorkspaceSchema.parse({
      breadcrumb: {
        course: { id: "11111111-1111-4111-8111-111111111111", title: "C" },
        module: { id: "22222222-2222-4222-8222-222222222222", title: "M" },
        lecture: { id: "33333333-3333-4333-8333-333333333333", title: "L" },
      },
      exercise: {
        materialId: "44444444-4444-4444-8444-444444444444",
        title: "Sum",
        difficulty: "EASY",
        language: "PYTHON",
        description: "",
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        starterCode: "",
        timeLimitMs: 3000,
        memoryLimitMb: 256,
        sampleTestCases: [{ position: 1, input: "1", expectedOutput: "1" }],
        hints: [],
        hiddenTestCaseCount: 4,
        testCases: [{ input: "SECRET_IN", expectedOutput: "SECRET_OUT" }],
      },
      neighbors: { previous: null, next: null },
      draft: null,
      status: "NOT_STARTED",
    });

    expect(JSON.stringify(parsed)).not.toContain("SECRET_OUT");
    expect(parsed.exercise).not.toHaveProperty("testCases");
  });
});
