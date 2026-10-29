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
  const read = vi
    .fn()
    .mockResolvedValue({ status: "RUNNING", passedCount: 0, totalCount: 2 });
  const prisma = {
    submission: { findUnique: read },
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
    read,
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

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
it("reconciles a historical failure as RUNNING and still delivers current completion", async () => {
  const f = createController();
  const received: { type: string; data: string }[] = [];
  const stream = await f.controller.stream(
    submissionId,
    academyId,
    "Bearer token",
  );
  stream.subscribe((event) => received.push(event));
  await flush();
  f.events.emit("failed", { jobId: submissionId, failedReason: SECRET });
  await flush();
  expect(received.filter((event) => event.type === "error")).toEqual([]);
  expect(f.events.listenerCount("completed")).toBe(1);
  f.read.mockResolvedValue({
    status: "PASSED",
    passedCount: 2,
    totalCount: 2,
    lease: SECRET,
  });
  f.events.emit("completed", { jobId: submissionId });
  await flush();
  expect(JSON.parse(received.at(-1)!.data)).toEqual({
    status: "PASSED",
    passedCount: 2,
    totalCount: 2,
  });
  expect(JSON.stringify(received)).not.toContain(SECRET);
  expect(f.events.eventNames()).toEqual([]);
});
it("reports a durable ERRORED verdict rather than a worker failure as a grade", async () => {
  const f = createController();
  const received: { type: string; data: string }[] = [];
  const stream = await f.controller.stream(
    submissionId,
    academyId,
    "Bearer token",
  );
  stream.subscribe((event) => received.push(event));
  await flush();
  f.read.mockResolvedValue({
    status: "ERRORED",
    passedCount: 0,
    totalCount: 2,
    failedReason: SECRET,
  });
  f.events.emit("failed", { jobId: submissionId, failedReason: SECRET });
  await flush();
  expect(received.at(-1)).toEqual({
    type: "result",
    data: JSON.stringify({ status: "ERRORED", passedCount: 0, totalCount: 2 }),
  });
  expect(JSON.stringify(received)).not.toContain(SECRET);
  expect(f.events.eventNames()).toEqual([]);
});

it("reconciles completion arriving during a pending failure/result read", async () => {
  const f = createController();
  let resolve!: (value: {
    status: string;
    passedCount: number;
    totalCount: number;
  }) => void;
  f.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const received: { type: string; data: string }[] = [];
  (
    await f.controller.stream(submissionId, academyId, "Bearer token")
  ).subscribe((event) => received.push(event));
  f.events.emit("failed", { jobId: submissionId, failedReason: SECRET });
  f.read.mockResolvedValue({ status: "PASSED", passedCount: 2, totalCount: 2 });
  f.events.emit("completed", { jobId: submissionId });
  resolve({ status: "RUNNING", passedCount: 0, totalCount: 2 });
  await flush();
  expect(received.map((event) => JSON.parse(event.data).status)).toEqual([
    "RUNNING",
    "PASSED",
  ]);
  expect(f.events.eventNames()).toEqual([]);
});
it("closes with a generic error when current durable state cannot be read", async () => {
  const f = createController();
  const received: { type: string; data: string }[] = [];
  (
    await f.controller.stream(submissionId, academyId, "Bearer token")
  ).subscribe((event) => received.push(event));
  await flush();
  f.read.mockRejectedValue(new Error(SECRET));
  f.events.emit("failed", { jobId: submissionId, failedReason: SECRET });
  await flush();
  expect(received.at(-1)!.type).toBe("error");
  expect(JSON.stringify(received)).not.toContain(SECRET);
  expect(f.events.eventNames()).toEqual([]);
});
