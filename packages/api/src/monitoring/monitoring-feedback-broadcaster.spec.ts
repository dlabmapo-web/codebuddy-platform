import { monitoringRooms, monitoringServerEvents } from "@cove/shared";
import { describe, expect, it, vi } from "vitest";
import type { Server } from "socket.io";

import type { PrismaService } from "../database/prisma.service.js";
import { MonitoringFeedbackBroadcaster } from "./monitoring-feedback-broadcaster.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const studentUserId = "70000000-0000-4000-8000-000000000001";
const materialId = "80000000-0000-4000-8000-000000000001";
const draftId = "a0000000-0000-4000-8000-000000000001";

function createBroadcaster(options?: { draft?: { id: string } | null }) {
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  const server = { to } as unknown as Server;
  const findUnique = vi
    .fn()
    .mockResolvedValue(
      options?.draft === undefined ? { id: draftId } : options.draft,
    );
  const prisma = {
    exerciseDraft: { findUnique },
  } as unknown as PrismaService;

  return {
    broadcaster: new MonitoringFeedbackBroadcaster(prisma),
    server,
    to,
    emit,
    findUnique,
  };
}

describe("MonitoringFeedbackBroadcaster", () => {
  it("emits into the draft room the server derived, not one a client named", async () => {
    const { broadcaster, server, to, emit } = createBroadcaster();
    broadcaster.attach(server);
    await broadcaster.feedbackRead({
      academyId,
      studentUserId,
      materialId,
      readCount: 2,
    });

    expect(to).toHaveBeenCalledWith(monitoringRooms.draft(academyId, draftId));
    expect(emit).toHaveBeenCalledWith(
      monitoringServerEvents.feedbackRead,
      expect.objectContaining({ materialId, readCount: 2 }),
    );
  });

  /**
   * The student's read is an HTTP write that has already committed. Nothing
   * about announcing it may become a condition of it succeeding.
   */
  it("is a no-op with no server attached", async () => {
    const { broadcaster, findUnique } = createBroadcaster();
    await expect(
      broadcaster.feedbackRead({
        academyId,
        studentUserId,
        materialId,
        readCount: 1,
      }),
    ).resolves.toBeUndefined();
    // Not even the lookup runs: there is nobody to tell.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("says nothing when no rows were marked", async () => {
    const { broadcaster, server, emit } = createBroadcaster();
    broadcaster.attach(server);
    await broadcaster.feedbackRead({
      academyId,
      studentUserId,
      materialId,
      readCount: 0,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("says nothing when the exercise has no draft, and so no room", async () => {
    const { broadcaster, server, emit } = createBroadcaster({ draft: null });
    broadcaster.attach(server);
    await broadcaster.feedbackRead({
      academyId,
      studentUserId,
      materialId,
      readCount: 1,
    });
    expect(emit).not.toHaveBeenCalled();
  });

  it("carries no message body or author", async () => {
    const { broadcaster, server, emit } = createBroadcaster();
    broadcaster.attach(server);
    await broadcaster.feedbackRead({
      academyId,
      studentUserId,
      materialId,
      readCount: 1,
    });

    const payload = emit.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("body");
    expect(payload).not.toHaveProperty("teacherMembershipRef");
    expect(payload).not.toHaveProperty("studentUserId");
  });
});
