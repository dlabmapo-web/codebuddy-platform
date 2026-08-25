import { describe, expect, it, vi } from "vitest";

import type { AuditService } from "../academies/audit.service.js";
import type { RateLimitService } from "../academies/rate-limit.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { EmailSender } from "./email-sender.js";
import { InvitationDeliveryService } from "./invitation-delivery.service.js";
import type { ManagerScopeService } from "./manager-scope.service.js";

function createService(options: {
  attempt?: Record<string, unknown> | null;
  updateError?: unknown;
} = {}) {
  const update = options.updateError
    ? vi.fn().mockRejectedValue(options.updateError)
    : vi.fn().mockImplementation(async ({ data }) => ({ id: "attempt-1", ...data }));
  const prisma = {
    academy: {
      findUnique: vi.fn().mockResolvedValue({ name: "Cove Academy", status: "ACTIVE" }),
    },
    invitationDeliveryAttempt: {
      create: vi.fn().mockResolvedValue({ id: "attempt-1" }),
      findFirst: vi.fn().mockResolvedValue(options.attempt ?? null),
      update,
    },
  } as unknown as PrismaService;
  const send = vi.fn().mockResolvedValue({ ok: true, providerMessageId: "email_1" });
  const sender = { name: "resend", send } as EmailSender;
  const service = new InvitationDeliveryService(
    prisma,
    {} as ManagerScopeService,
    {} as AuditService,
    {} as RateLimitService,
    { get: vi.fn().mockReturnValue("https://cs.coveedu.com") } as never,
    sender,
  );
  return { service, send, update };
}

describe("InvitationDeliveryService delivery integration", () => {
  it("uses the durable attempt id as the Resend idempotency key", async () => {
    const { service, send, update } = createService();

    await service.queueForInvitation({
      invitationId: "invitation-1",
      academyId: "academy-1",
      email: "student@example.com",
      token: "private-token",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "student@example.com",
        idempotencyKey: "invitation-delivery/attempt-1",
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "attempt-1" },
        data: expect.objectContaining({ state: "SENT", providerMessageId: "email_1" }),
      }),
    );
  });

  it.each(["suppressed", "complained"] as const)(
    "records later %s evidence after delivery",
    async (failureCode) => {
      const { service, update } = createService({ attempt: deliveredAttempt() });

      await service.applyProviderEvent({
        eventId: `evt_${failureCode}`,
        messageId: "email_1",
        type: "failed",
        failureCode,
      });

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: "FAILED", failureCode }),
        }),
      );
    },
  );

  it("does not let an ordinary late failure erase confirmed delivery", async () => {
    const { service, update } = createService({ attempt: deliveredAttempt() });

    await service.applyProviderEvent({
      eventId: "evt_failed",
      messageId: "email_1",
      type: "failed",
      failureCode: "failed",
    });

    expect(update).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate event rejected by the unique index", async () => {
    const { service } = createService({
      attempt: { ...deliveredAttempt(), state: "SENT" },
      updateError: { code: "P2002" },
    });

    await expect(
      service.applyProviderEvent({
        eventId: "evt_delivered",
        messageId: "email_1",
        type: "delivered",
      }),
    ).resolves.toBeUndefined();
  });

  it("ignores a message id not owned by Cove", async () => {
    const { service, update } = createService();
    await service.applyProviderEvent({
      eventId: "evt_other",
      messageId: "supabase_email_1",
      type: "delivered",
    });
    expect(update).not.toHaveBeenCalled();
  });
});

function deliveredAttempt() {
  return {
    id: "attempt-1",
    state: "DELIVERED",
    attemptNumber: 1,
    failureCode: null,
    sentAt: new Date("2026-08-25T00:00:00.000Z"),
    deliveredAt: new Date("2026-08-25T00:01:00.000Z"),
    failedAt: null,
  };
}
