import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { JudgeQueue } from "../judge/judge.queue.js";
import { SubmissionController } from "./submission.controller.js";
import type { SubmissionService } from "./submission.service.js";

const academyId = "20000000-0000-4000-8000-000000000001";
const submissionId = "50000000-0000-4000-8000-000000000001";
const SECRET = "HIDDEN_EXPECTATION_SENTINEL";

function createController(options?: { ownershipError?: Error }) {
  const events = new EventEmitter();
  const submissions = {
    assertOwnership: options?.ownershipError
      ? vi.fn().mockRejectedValue(options.ownershipError)
      : vi.fn().mockResolvedValue(undefined),
  } as unknown as SubmissionService;
  const prisma = {
    submission: {
      findUnique: vi.fn().mockResolvedValue({
        status: "RUNNING",
        passedCount: 0,
        totalCount: 2,
      }),
    },
  } as unknown as PrismaService;
  const auth = {
    verifyAccessToken: vi.fn().mockResolvedValue({
      authUserId: "10000000-0000-4000-8000-000000000001",
    }),
  } as unknown as SupabaseAuthService;
  const queue = { events } as unknown as JudgeQueue;
  return {
    events,
    submissions,
    controller: new SubmissionController(submissions, prisma, auth, queue),
  };
}

describe("SubmissionController.stream", () => {
  it("authorizes ownership before attaching queue listeners", async () => {
    const { controller, submissions } = createController();
    const stream = await controller.stream(
      submissionId,
      academyId,
      "Bearer access-token",
    );
    const subscription = stream.subscribe();

    expect(submissions.assertOwnership).toHaveBeenCalledWith(
      "10000000-0000-4000-8000-000000000001",
      academyId,
      submissionId,
    );
    subscription.unsubscribe();
  });

  it("does not attach when ownership is rejected", async () => {
    const { controller, events } = createController({
      ownershipError: new Error("SUBMISSION_NOT_FOUND"),
    });

    await expect(
      controller.stream(submissionId, academyId, "Bearer access-token"),
    ).rejects.toThrow("SUBMISSION_NOT_FOUND");
    expect(events.listenerCount("progress")).toBe(0);
  });

  it("strips every non-contract field from progress events", async () => {
    const { controller, events } = createController();
    const stream = await controller.stream(
      submissionId,
      academyId,
      "Bearer access-token",
    );
    const received: Array<{ type: string; data: string }> = [];
    const subscription = stream.subscribe((event) => received.push(event));

    events.emit("progress", {
      jobId: submissionId,
      data: {
        submissionId,
        position: 2,
        of: 2,
        outcome: "WRONG_OUTPUT",
        isSample: false,
        input: `${SECRET}_INPUT`,
        expectedOutput: `${SECRET}_OUTPUT`,
      },
    });

    const serialized = JSON.stringify(received);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).toContain("WRONG_OUTPUT");
    subscription.unsubscribe();
  });
});
