import { describe, expect, it } from "vitest";

import {
  canAdvanceDelivery,
  providerEventSchema,
  providerEventToState,
  terminalDeliveryStates,
  type InvitationDeliveryState,
} from "./invitation-delivery.js";

describe("canAdvanceDelivery", () => {
  it("moves forward along the evidence ladder", () => {
    expect(canAdvanceDelivery("QUEUED", "SENT")).toBe(true);
    expect(canAdvanceDelivery("SENT", "DELIVERED")).toBe(true);
  });

  it("ignores an event that would weaken what is already known", () => {
    // Providers routinely deliver `sent` after `delivered`. Applying it would
    // walk the record backwards and make the interface understate its evidence.
    expect(canAdvanceDelivery("DELIVERED", "SENT")).toBe(false);
    expect(canAdvanceDelivery("SENT", "QUEUED")).toBe(false);
  });

  it("lets a bounce win from any state", () => {
    const states: InvitationDeliveryState[] = [
      "QUEUED",
      "SENT",
      "DELIVERED",
      "FAILED",
    ];
    for (const from of states) {
      expect(canAdvanceDelivery(from, "BOUNCED")).toBe(true);
    }
  });

  it("treats a repeated event as no change", () => {
    expect(canAdvanceDelivery("DELIVERED", "DELIVERED")).toBe(false);
    expect(canAdvanceDelivery("BOUNCED", "BOUNCED")).toBe(false);
  });

  it("does not let a late failure overwrite a confirmed delivery", () => {
    expect(canAdvanceDelivery("DELIVERED", "FAILED")).toBe(false);
  });
});

describe("terminalDeliveryStates", () => {
  it("names the three states nothing follows", () => {
    expect([...terminalDeliveryStates].sort()).toEqual([
      "BOUNCED",
      "DELIVERED",
      "FAILED",
    ]);
  });
});

describe("providerEventToState", () => {
  it("maps each understood event to one state", () => {
    expect(providerEventToState("sent")).toBe("SENT");
    expect(providerEventToState("delivered")).toBe("DELIVERED");
    expect(providerEventToState("bounced")).toBe("BOUNCED");
    expect(providerEventToState("failed")).toBe("FAILED");
  });
});

describe("providerEventSchema", () => {
  it("accepts the shape a webhook actually carries", () => {
    expect(
      providerEventSchema.parse({
        eventId: "evt_1",
        type: "delivered",
        messageId: "msg_1",
      }),
    ).toMatchObject({ eventId: "evt_1", type: "delivered" });
  });

  it("refuses an event type the platform does not model", () => {
    // Opens and clicks are real provider events and deliberately unmodelled:
    // an invitation record has no business storing whether a parent opened it.
    expect(
      providerEventSchema.safeParse({
        eventId: "evt_2",
        type: "opened",
        messageId: "msg_1",
      }).success,
    ).toBe(false);
  });

  it("requires an event id, which is what deduplication rests on", () => {
    expect(
      providerEventSchema.safeParse({ type: "sent", messageId: "msg_1" })
        .success,
    ).toBe(false);
  });
});
