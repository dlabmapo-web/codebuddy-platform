import { describe, expect, it } from "vitest";

import { monitoringLimits } from "./monitoring.js";
import {
  documentUpdatePayloadSchema,
  feedbackSendPayloadSchema,
  monitoringAckSchema,
  monitoringRooms,
  presencePublishPayloadSchema,
  resultChangedEventSchema,
  runActivityPayloadSchema,
  watchStartPayloadSchema,
} from "./events.js";
import { z } from "zod";

const academyId = "11111111-1111-4111-8111-111111111111";
const classId = "22222222-2222-4222-8222-222222222222";
const membershipId = "33333333-3333-4333-8333-333333333333";
const draftId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";

describe("monitoringRooms", () => {
  it("carries ids only, never names, emails, or code", () => {
    expect(monitoringRooms.classPresence(academyId, classId)).toBe(
      `academy:${academyId}:class:${classId}:presence`,
    );
    expect(monitoringRooms.draft(academyId, draftId)).toBe(
      `academy:${academyId}:draft:${draftId}`,
    );
    expect(monitoringRooms.teacher(academyId, membershipId)).toBe(
      `academy:${academyId}:teacher:${membershipId}`,
    );
    expect(monitoringRooms.student(academyId, membershipId)).toBe(
      `academy:${academyId}:student:${membershipId}`,
    );
  });

  it("scopes every room to one academy", () => {
    for (const room of [
      monitoringRooms.classPresence(academyId, classId),
      monitoringRooms.draft(academyId, draftId),
      monitoringRooms.teacher(academyId, membershipId),
      monitoringRooms.student(academyId, membershipId),
    ]) {
      expect(room.startsWith(`academy:${academyId}:`)).toBe(true);
    }
  });
});

describe("watchStartPayloadSchema", () => {
  it("names the target but never the actor", () => {
    const parsed = watchStartPayloadSchema.parse({
      eventId,
      academyId,
      classId,
      studentMembershipId: membershipId,
      teacherMembershipId: "66666666-6666-4666-8666-666666666666",
      userId: "77777777-7777-4777-8777-777777777777",
    });
    expect(parsed).not.toHaveProperty("teacherMembershipId");
    expect(parsed).not.toHaveProperty("userId");
  });
});

describe("presencePublishPayloadSchema", () => {
  it("accepts signals rather than a state label", () => {
    const parsed = presencePublishPayloadSchema.parse({
      academyId,
      materialId: draftId,
      courseId: null,
      visibility: "VISIBLE",
      active: true,
      state: "SOLVING",
    });
    expect(parsed).not.toHaveProperty("state");
  });

  it("rejects an unsupported visibility", () => {
    expect(
      presencePublishPayloadSchema.safeParse({
        academyId,
        materialId: null,
        courseId: null,
        visibility: "MINIMIZED",
        active: false,
      }).success,
    ).toBe(false);
  });
});

describe("documentUpdatePayloadSchema", () => {
  it("accepts a bounded binary update", () => {
    const parsed = documentUpdatePayloadSchema.parse({
      eventId,
      draftId,
      update: new Uint8Array([1, 2, 3]),
    });
    expect(parsed.update.byteLength).toBe(3);
  });

  it("rejects an update over the size limit", () => {
    expect(
      documentUpdatePayloadSchema.safeParse({
        eventId,
        draftId,
        update: new Uint8Array(monitoringLimits.documentUpdateMaxBytes + 1),
      }).success,
    ).toBe(false);
  });

  it("rejects a plain-string document, which is what v1 broadcast", () => {
    expect(
      documentUpdatePayloadSchema.safeParse({
        eventId,
        draftId,
        update: "print(1)",
      }).success,
    ).toBe(false);
  });
});

describe("runActivityPayloadSchema", () => {
  it("has no field for a hidden case or its expected output", () => {
    const parsed = runActivityPayloadSchema.parse({
      draftId,
      clientRunId: eventId,
      lifecycle: "COMPLETED",
      sampleCount: 2,
      passedCount: 1,
      output: "1\n",
      at: "2026-08-04T09:00:00.000Z",
      hiddenCases: [{ input: "9", expectedOutput: "81" }],
    });
    expect(parsed).not.toHaveProperty("hiddenCases");
  });

  it("bounds the echoed output", () => {
    expect(
      runActivityPayloadSchema.safeParse({
        draftId,
        clientRunId: eventId,
        lifecycle: "COMPLETED",
        sampleCount: 1,
        passedCount: 1,
        output: "a".repeat(monitoringLimits.runOutputMaxLength + 1),
        at: "2026-08-04T09:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

describe("resultChangedEventSchema", () => {
  it("summarizes a verdict without the judge's internals", () => {
    const parsed = resultChangedEventSchema.parse({
      draftId,
      submissionId: eventId,
      status: "FAILED",
      score: 50,
      passedCount: 1,
      totalCount: 2,
      runtimeMs: 120,
      gradedAt: "2026-08-04T09:00:00.000Z",
      failureReason: "worker OOM",
      cases: [{ input: "9", expectedOutput: "81" }],
    });
    expect(parsed).not.toHaveProperty("failureReason");
    expect(parsed).not.toHaveProperty("cases");
  });
});

describe("feedbackSendPayloadSchema", () => {
  it("requires an idempotency key so a retry stores one row", () => {
    expect(
      feedbackSendPayloadSchema.safeParse({
        eventId,
        draftId,
        body: "try a loop",
      }).success,
    ).toBe(false);
  });

  it("trims and bounds the body", () => {
    const parsed = feedbackSendPayloadSchema.parse({
      eventId,
      draftId,
      idempotencyKey: eventId,
      body: "  try a loop  ",
    });
    expect(parsed.body).toBe("try a loop");
  });
});

describe("monitoringAckSchema", () => {
  const ack = monitoringAckSchema(z.object({ draftId: z.uuid() }));

  it("carries the event id back on success", () => {
    expect(ack.parse({ ok: true, eventId, data: { draftId } })).toEqual({
      ok: true,
      eventId,
      data: { draftId },
    });
  });

  it("carries a public error code and nothing else on failure", () => {
    const parsed = ack.parse({
      ok: false,
      eventId,
      code: "MONITORING_ACCESS_DENIED",
      message: 'relation "classes" does not exist',
      stack: "at PrismaClient",
    });
    expect(parsed).toEqual({ ok: false, eventId, code: "MONITORING_ACCESS_DENIED" });
  });

  it("rejects an error code outside the public vocabulary", () => {
    expect(
      ack.safeParse({ ok: false, eventId, code: "P2002" }).success,
    ).toBe(false);
  });
});
