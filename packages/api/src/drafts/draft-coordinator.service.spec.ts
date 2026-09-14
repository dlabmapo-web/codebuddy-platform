import { describe, expect, it, vi } from "vitest";

import type { PrismaService } from "../database/prisma.service.js";
import { DraftCoordinator, type LiveDraftAuthority } from "./draft-coordinator.service.js";

const draftId = "d0000000-0000-4000-8000-000000000001";
const userId = "u0000000-0000-4000-8000-000000000001";
const materialId = "m0000000-0000-4000-8000-000000000001";

type Row = { id: string; code: string; updatedAt: Date };

const at = (iso: string) => new Date(iso);

/**
 * Postgres reduced to one row, with the one property that matters here: a
 * conditional update sees the row as it is at the moment it runs, not as the
 * caller last read it.
 */
function createCoordinator(
  existing: Row | null,
  options?: {
    /** Runs between every read and the write that follows it. */
    concurrently?: () => void;
    /** Rejects the first create, as a racing tab's insert would. */
    createLosesRace?: boolean;
  },
) {
  const state: { row: Row | null; clock: number } = { row: existing, clock: 0 };
  const tick = () => at(`2026-09-14T10:00:${String(state.clock++).padStart(2, "0")}.000Z`);
  let createsAttempted = 0;

  const prisma = {
    exerciseDraft: {
      findUnique: vi.fn(async () => {
        const row = state.row ? { ...state.row } : null;
        options?.concurrently?.();
        return row;
      }),
      create: vi.fn(async ({ data }: { data: { code: string } }) => {
        createsAttempted += 1;
        if (options?.createLosesRace && createsAttempted === 1) {
          state.row = { id: draftId, code: "written by the other tab", updatedAt: tick() };
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        state.row = { id: draftId, code: data.code, updatedAt: tick() };
        return { updatedAt: state.row.updatedAt };
      }),
      updateManyAndReturn: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; updatedAt: Date };
          data: { code: string };
        }) => {
          if (
            !state.row ||
            state.row.id !== where.id ||
            state.row.updatedAt.getTime() !== where.updatedAt.getTime()
          ) {
            return [];
          }
          state.row = { ...state.row, code: data.code, updatedAt: tick() };
          return [{ updatedAt: state.row.updatedAt }];
        },
      ),
      deleteMany: vi.fn(async () => {
        state.row = null;
        return { count: 1 };
      }),
    },
  } as unknown as PrismaService;

  return { coordinator: new DraftCoordinator(prisma), prisma, state };
}

const save = (code: string, baseUpdatedAt: Date | null) => ({
  userId,
  materialId,
  sourceMaterialId: materialId,
  courseId: "c0000000-0000-4000-8000-000000000001",
  code,
  baseUpdatedAt,
});

describe("saving a draft", () => {
  it("creates the first draft canonically", async () => {
    const { coordinator, state } = createCoordinator(null);
    const result = await coordinator.save(save("a\r\nb", null));
    expect(result.outcome).toBe("SAVED");
    expect(state.row?.code).toBe("a\nb");
  });

  it("normalizes line endings on every write", async () => {
    const { coordinator, state } = createCoordinator(
      { id: draftId, code: "old", updatedAt: at("2026-09-14T09:00:00.000Z") },
    );
    await coordinator.save(save("x\r\ny\rz", at("2026-09-14T09:00:00.000Z")));
    expect(state.row?.code).toBe("x\ny\nz");
  });

  it("writes through when the buffer is based on what is stored", async () => {
    const base = at("2026-09-14T09:00:00.000Z");
    const { coordinator, state } = createCoordinator({
      id: draftId,
      code: "old",
      updatedAt: base,
    });
    const result = await coordinator.save(save("new", base));
    expect(result.outcome).toBe("SAVED");
    expect(state.row?.code).toBe("new");
  });

  it("refuses a buffer edited from a revision the server has moved past", async () => {
    const { coordinator, state } = createCoordinator({
      id: draftId,
      code: "the teacher's correction",
      updatedAt: at("2026-09-14T09:30:00.000Z"),
    });
    const result = await coordinator.save(
      save("my stale text", at("2026-09-14T09:00:00.000Z")),
    );
    expect(result).toEqual({
      outcome: "CONFLICT",
      updatedAt: at("2026-09-14T09:30:00.000Z"),
      // Handed back rather than dropped, so nothing is lost silently.
      code: "the teacher's correction",
    });
    expect(state.row?.code).toBe("the teacher's correction");
  });

  it("is not a conflict when the text already agrees", async () => {
    // A collaboration flush touching the row must not start rejecting the
    // student's own ordinary autosave.
    const { coordinator } = createCoordinator({
      id: draftId,
      code: "same",
      updatedAt: at("2026-09-14T09:30:00.000Z"),
    });
    const result = await coordinator.save(
      save("same", at("2026-09-14T09:00:00.000Z")),
    );
    expect(result.outcome).toBe("SAVED");
  });

  it("refuses a write that cannot say what it was based on", async () => {
    // Null is not a way past the check. A client that loaded this draft knows
    // its revision; one that does not cannot show it is not replacing work.
    const { coordinator, state } = createCoordinator({
      id: draftId,
      code: "somebody else's",
      updatedAt: at("2026-09-14T09:30:00.000Z"),
    });
    const result = await coordinator.save(save("closing tab", null));
    expect(result.outcome).toBe("CONFLICT");
    expect(state.row?.code).toBe("somebody else's");
  });
});

describe("two writers at once", () => {
  it("does not let the second of two saves on one revision overwrite the first", async () => {
    // Both read the same revision. Without the revision in the write's own
    // predicate both reported success and the second silently won.
    const base = at("2026-09-14T09:00:00.000Z");
    let interfered = false;
    const { coordinator, state } = createCoordinator(
      { id: draftId, code: "base", updatedAt: base },
      {
        concurrently: () => {
          if (interfered) return;
          interfered = true;
          state.row = {
            id: draftId,
            code: "the other writer",
            updatedAt: at("2026-09-14T09:00:30.000Z"),
          };
        },
      },
    );

    const result = await coordinator.save(save("mine", base));

    expect(result.outcome).toBe("CONFLICT");
    expect(state.row?.code).toBe("the other writer");
  });

  it("retries against what it finds when the row moves under it", async () => {
    // The same collision, but the other writer stored text this one agrees
    // with, so there is nothing to refuse and the retry simply proceeds.
    const base = at("2026-09-14T09:00:00.000Z");
    let interfered = false;
    const { coordinator, state, prisma } = createCoordinator(
      { id: draftId, code: "base", updatedAt: base },
      {
        concurrently: () => {
          if (interfered) return;
          interfered = true;
          state.row = {
            id: draftId,
            code: "mine",
            updatedAt: at("2026-09-14T09:00:30.000Z"),
          };
        },
      },
    );

    const result = await coordinator.save(save("mine", base));

    expect(result.outcome).toBe("SAVED");
    expect(state.row?.code).toBe("mine");
    expect(
      (prisma as unknown as { exerciseDraft: { updateManyAndReturn: ReturnType<typeof vi.fn> } })
        .exerciseDraft.updateManyAndReturn,
    ).toHaveBeenCalled();
  });

  it("survives losing the race to create the first draft", async () => {
    const { coordinator, state } = createCoordinator(null, {
      createLosesRace: true,
    });
    const result = await coordinator.save(save("written by the other tab", null));
    // The second round finds the row the other tab inserted and agrees with it.
    expect(result.outcome).toBe("SAVED");
    expect(state.row?.code).toBe("written by the other tab");
  });
});

describe("while a live document owns the draft", () => {
  function withAuthority(live: string, owns = true) {
    const { coordinator, prisma, state } = createCoordinator({
      id: draftId,
      code: "on disk",
      updatedAt: at("2026-09-14T09:00:00.000Z"),
    });
    const authority: LiveDraftAuthority = {
      owns: () => owns,
      readCode: vi.fn(async () => live),
      persist: vi.fn(async () => {
        state.row = {
          id: draftId,
          code: live,
          updatedAt: at("2026-09-14T09:45:00.000Z"),
        };
        return { code: state.row.code, updatedAt: state.row.updatedAt };
      }),
      forget: vi.fn(),
    };
    coordinator.register(authority);
    return { coordinator, prisma, state, authority };
  }

  it("refuses a snapshot that disagrees with the live document", async () => {
    // The reported loss: an old student snapshot replacing newer teacher text.
    const { coordinator, state, authority } = withAuthority(
      "the teacher's newer text",
    );

    const result = await coordinator.save(
      save("my older buffer", at("2026-01-01T00:00:00.000Z")),
    );

    expect(result).toEqual({
      outcome: "CONFLICT",
      updatedAt: at("2026-09-14T09:00:00.000Z"),
      code: "the teacher's newer text",
    });
    expect(authority.persist).not.toHaveBeenCalled();
    expect(state.row?.code).toBe("on disk");
  });

  it("makes a matching snapshot durable before reporting it saved", async () => {
    // Not "saved" the moment the document happens to agree: the document
    // writes on a debounce, and durability is what the word means.
    const { coordinator, state, authority } = withAuthority("agreed text");

    const result = await coordinator.save(save("agreed text", null));

    expect(authority.persist).toHaveBeenCalledWith(draftId);
    expect(result).toEqual({
      outcome: "SAVED",
      updatedAt: at("2026-09-14T09:45:00.000Z"),
    });
    expect(state.row?.code).toBe("agreed text");
  });

  it("normalizes before comparing, so line endings are not a disagreement", async () => {
    const { coordinator } = withAuthority("a\nb");
    const result = await coordinator.save(save("a\r\nb", null));
    expect(result.outcome).toBe("SAVED");
  });

  it("reports a failure rather than a save when the document cannot be written", async () => {
    const { coordinator } = createCoordinator({
      id: draftId,
      code: "on disk",
      updatedAt: at("2026-09-14T09:00:00.000Z"),
    });
    coordinator.register({
      owns: () => true,
      readCode: async () => "agreed",
      persist: async () => null,
      forget: vi.fn(),
    });

    await expect(coordinator.save(save("agreed", null))).rejects.toThrow();
  });

  it("writes the row directly once no document owns the draft", async () => {
    const base = at("2026-09-14T09:00:00.000Z");
    const { coordinator, state, authority } = withAuthority("unused", false);
    await coordinator.save(save("unwatched", base));
    expect(authority.readCode).not.toHaveBeenCalled();
    expect(state.row?.code).toBe("unwatched");
  });
});

describe("discarding a draft", () => {
  it("drops the live document with the row", async () => {
    const { coordinator, state } = createCoordinator({
      id: draftId,
      code: "throw away",
      updatedAt: at("2026-09-14T09:00:00.000Z"),
    });
    const authority: LiveDraftAuthority = {
      owns: () => true,
      readCode: vi.fn(),
      persist: vi.fn(),
      forget: vi.fn(),
    };
    coordinator.register(authority);

    await expect(coordinator.discard({ userId, materialId })).resolves.toBe(true);

    expect(authority.forget).toHaveBeenCalledWith(draftId);
    expect(state.row).toBeNull();
  });

  it("reports nothing discarded when there was no draft", async () => {
    const { coordinator } = createCoordinator(null);
    await expect(coordinator.discard({ userId, materialId })).resolves.toBe(false);
  });
});


describe("revision returned by the conditional write", () => {
  it("does not read a later writer's revision after its write", async () => {
    const base = at("2026-09-14T09:00:00.000Z");
    const { coordinator, prisma, state } = createCoordinator({ id: draftId, code: "old", updatedAt: base });
    const ownRevision = at("2026-09-14T10:00:00.000Z");
    vi.mocked(prisma.exerciseDraft.updateManyAndReturn).mockImplementationOnce((async () => {
      state.row = { id: draftId, code: "another tab", updatedAt: at("2026-09-14T11:00:00.000Z") };
      return [{ updatedAt: ownRevision }];
    }) as never);
    expect(await coordinator.save(save("mine", base))).toEqual({ outcome: "SAVED", updatedAt: ownRevision });
    expect(prisma.exerciseDraft.findUnique).toHaveBeenCalledTimes(1);
  });
});
