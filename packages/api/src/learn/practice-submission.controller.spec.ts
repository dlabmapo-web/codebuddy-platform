import { EventEmitter } from "node:events";
import type { SubmissionResult } from "@cove/shared";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import type { JudgeQueue } from "../judge/judge.queue.js";
import { StaffPracticeService } from "./staff-practice.service.js";
import { PracticeSubmissionController } from "./practice-submission.controller.js";
const academyId = "20000000-0000-4000-8000-000000000001",
  id = "50000000-0000-4000-8000-000000000001",
  materialId = "70000000-0000-4000-8000-000000000001";
const result = (status = "RUNNING") => ({
  submissionId: id,
  materialId,
  status,
  passedCount: 0,
  totalCount: 1,
  score: 0,
  runtimeMs: null,
  failureReason: null,
  elapsedSec: 0,
  attemptCount: 0,
  createdAt: new Date(0).toISOString(),
  gradedAt: null,
  cases: [
    {
      position: 1,
      isSample: false,
      outcome: "WRONG_OUTPUT",
      runtimeMs: 0,
      input: "SECRET",
      expectedOutput: "SECRET",
      actualOutput: "SECRET",
    },
  ],
  expectedOutput: "SECRET",
  lease: "SECRET",
});
function fixture() {
  const events = new EventEmitter(),
    student = new EventEmitter();
  const access = {
    requirePermission: vi.fn().mockResolvedValue({
      userId: "owner",
      via: "membership",
      roles: ["TEACHER"],
    }),
  };
  const attempt = {
    id,
    academyId,
    userId: "owner",
    materialId,
    context: "live",
    result: result(),
  };
  const db = {
    staffPracticeAttempt: {
      findFirst: vi.fn(async ({ where }) =>
        where.academyId === attempt.academyId && where.userId === attempt.userId
          ? attempt
          : null,
      ),
    },
    material: {
      findFirst: vi.fn().mockResolvedValue({ programmingExercise: {} }),
    },
  };
  const service = new StaffPracticeService(
    db as unknown as PrismaService,
    access as unknown as AcademyAccessService,
    new ConfigService(),
  );
  const auth = {
    verifyAccessToken: vi.fn().mockResolvedValue({ authUserId: "auth" }),
  };
  const controller = new PracticeSubmissionController(
    service,
    auth as unknown as SupabaseAuthService,
    { practiceEvents: events, events: student } as unknown as JudgeQueue,
  );
  return { events, student, access, attempt, db, service, controller };
}
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());
describe("owner-scoped practice completion", () => {
  it.each(["other-owner", "other-academy", "revoked"])(
    "rejects %s before attaching listeners",
    async (kind) => {
      const f = fixture();
      if (kind === "other-owner") f.attempt.userId = "other";
      if (kind === "other-academy") f.attempt.academyId = "other";
      if (kind === "revoked")
        f.access.requirePermission.mockRejectedValue(new Error("DENIED"));
      await expect(
        f.controller.stream(id, academyId, "Bearer token"),
      ).rejects.toThrow();
      expect(f.events.listenerCount("completed")).toBe(0);
    },
  );
  it("requires a bearer token", async () => {
    await expect(
      fixture().controller.stream(id, academyId),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("replays a result committed before connect, filters private fields and cleans up", async () => {
    const f = fixture();
    f.attempt.result = result("PASSED");
    const received: unknown[] = [];
    let complete = false;
    const stream = await f.controller.stream(id, academyId, "Bearer token");
    stream.subscribe({
      next: (v) => received.push(v),
      complete: () => {
        complete = true;
      },
    });
    await flush();
    expect(JSON.stringify(received)).toContain("PASSED");
    expect(JSON.stringify(received)).not.toContain("SECRET");
    expect(complete).toBe(true);
    expect(f.events.listenerCount("completed")).toBe(0);
    expect(f.student.eventNames()).toEqual([]);
  });
  it("rechecks current membership on completion and discloses no revoked result", async () => {
    const f = fixture();
    const stream = await f.controller.stream(id, academyId, "Bearer token");
    const received: { type: string; data: string }[] = [];
    stream.subscribe((v) => received.push(v));
    await flush();
    received.length = 0;
    f.access.requirePermission.mockRejectedValue(new Error("REVOKED"));
    f.attempt.result = result("PASSED");
    f.events.emit("completed", { jobId: id });
    await flush();
    expect(received.map((v) => v.type)).toEqual(["error"]);
    expect(JSON.stringify(received)).not.toContain("PASSED");
    expect(f.events.listenerCount("completed")).toBe(0);
  });
  it("ignores other attempts, closes a disconnect, and reads committed result on reconnect", async () => {
    const f = fixture();
    const stream = await f.controller.stream(id, academyId, "Bearer token");
    const subscription = stream.subscribe();
    await flush();
    f.events.emit("completed", { jobId: "other" });
    subscription.unsubscribe();
    expect(f.events.listenerCount("completed")).toBe(0);
    f.attempt.result = result("PASSED");
    const received: unknown[] = [];
    (await f.controller.stream(id, academyId, "Bearer token")).subscribe((v) =>
      received.push(v),
    );
    await flush();
    expect(JSON.stringify(received)).toContain("PASSED");
  });
  it("bounds leaked streams and removes all listeners", async () => {
    vi.useFakeTimers();
    const f = fixture();
    (await f.controller.stream(id, academyId, "Bearer token")).subscribe();
    await flush();
    await vi.advanceTimersByTimeAsync(300000);
    expect(f.events.eventNames()).toEqual([]);
  });
});

it("does not miss completion while the post-attachment read is pending", async () => {
  const f = fixture();
  let resolveRead!: (value: SubmissionResult) => void;
  const pending = await f.service.get({ authUserId: "auth" } as SupabaseIdentity, {
    academyId,
    submissionId: id,
  });
  vi.spyOn(f.service, "get")
    .mockImplementationOnce(async () => pending)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    )
    .mockImplementationOnce(async () => ({ ...pending, status: "PASSED" }));
  const stream = await f.controller.stream(id, academyId, "Bearer token");
  const received: { type: string; data: string }[] = [];
  stream.subscribe((value) => received.push(value));
  f.events.emit("completed", { jobId: id });
  resolveRead(pending);
  await flush();
  expect(JSON.parse(received.at(-1)!.data).status).toBe("PASSED");
  expect(f.events.eventNames()).toEqual([]);
});
