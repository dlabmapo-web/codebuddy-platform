import { describe, expect, it } from "vitest";
import { Webhook } from "svix";

import {
  parseEvents,
  verifySignature,
} from "./delivery-webhook.controller.js";

const SECRET = `whsec_${Buffer.from("a-secret-at-least-sixteen-characters").toString("base64")}`;

function sign(raw: string, timestamp: string, secret = SECRET, eventId = "msg_test"): string {
  return new Webhook(secret).sign(eventId, new Date(Number(timestamp) * 1_000), raw);
}

describe("verifySignature", () => {
  const raw = '{"type":"email.delivered"}';
  const timestamp = String(Math.floor(Date.now() / 1_000));

  it("accepts a signature the provider actually produced", () => {
    expect(
      verifySignature({
        raw,
        secret: SECRET,
        eventId: "msg_test",
        signature: sign(raw, timestamp),
        timestamp,
      }),
    ).toBe(true);
  });

  it("rejects a body that was altered after signing", () => {
    expect(
      verifySignature({
        raw: '{"type":"email.bounced"}',
        secret: SECRET,
        eventId: "msg_test",
        signature: sign(raw, timestamp),
        timestamp,
      }),
    ).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(
      verifySignature({
        raw,
        secret: SECRET,
        eventId: "msg_test",
        signature: sign(
          raw,
          timestamp,
          `whsec_${Buffer.from("a-different-secret-value-here").toString("base64")}`,
        ),
        timestamp,
      }),
    ).toBe(false);
  });

  it("rejects a genuine signature replayed under a fresh timestamp", () => {
    // The timestamp is inside the signed string, which is the whole reason it
    // cannot be swapped for a current one on an old body.
    expect(
      verifySignature({
        raw,
        secret: SECRET,
        eventId: "msg_test",
        signature: sign(raw, timestamp),
        timestamp: "1755509999",
      }),
    ).toBe(false);
  });

  it("rejects a malformed signature without throwing", () => {
    // The provider verifier throws for malformed signature envelopes; the
    // controller deliberately reduces that to a normal verification failure.
    expect(
      verifySignature({
        raw,
        secret: SECRET,
        eventId: "msg_test",
        signature: "nope",
        timestamp,
      }),
    ).toBe(false);
  });
});

describe("parseEvents", () => {
  it("reads a single provider event", () => {
    expect(
      parseEvents(
        JSON.stringify({
          type: "email.delivered",
          created_at: "2026-08-18T03:00:00.000Z",
          data: { email_id: "msg_1" },
        }),
        "evt_1",
      ),
    ).toEqual([
      {
        eventId: "evt_1",
        type: "delivered",
        messageId: "msg_1",
        occurredAt: "2026-08-18T03:00:00.000Z",
      },
    ]);
  });

  it("reads a batch", () => {
    const events = parseEvents(
      JSON.stringify([
        { id: "e1", type: "email.sent", data: { email_id: "m1" } },
        { id: "e2", type: "email.bounced", data: { email_id: "m2" } },
      ]),
    );
    expect(events.map((event) => event.type)).toEqual(["sent", "bounced"]);
  });

  it("drops an unmodelled event without losing the batch", () => {
    // An `opened` event beside a `bounced` one must not stop the bounce being
    // applied — and an invitation record has no business storing opens.
    const events = parseEvents(
      JSON.stringify([
        { id: "e1", type: "email.opened", data: { email_id: "m1" } },
        { id: "e2", type: "email.bounced", data: { email_id: "m2" } },
      ]),
    );
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("bounced");
  });

  it("maps a complaint onto a bounce", () => {
    expect(
      parseEvents(
        JSON.stringify({ id: "e", type: "email.complained", data: { email_id: "m" } }),
      )[0].type,
    ).toBe("bounced");
  });

  it("returns nothing for a body that is not JSON", () => {
    expect(parseEvents("not json at all")).toEqual([]);
  });

  it("returns nothing when neither the signed header nor payload has an event id", () => {
    expect(
      parseEvents(JSON.stringify({ type: "email.sent", data: { email_id: "m" } })),
    ).toEqual([]);
  });
});
