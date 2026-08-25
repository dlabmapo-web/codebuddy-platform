import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpEmailSender, maskEmail } from "./email-sender.js";

const message = {
  to: "student@example.com",
  subject: "Your Cove invitation",
  text: "A private invitation link",
  idempotencyKey: "invitation-delivery/9d456b9a-358d-47b7-a13f-695b77d4084d",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpEmailSender", () => {
  it("sends a traceable, idempotent plain-text Resend request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const sender = new HttpEmailSender(
      "re_private",
      "Cove Studio <no-reply@mail.coveedu.com>",
    );

    await expect(sender.send(message)).resolves.toEqual({
      ok: true,
      providerMessageId: "email_123",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init).toMatchObject({ method: "POST" });
    expect(init?.headers).toMatchObject({
      authorization: "Bearer re_private",
      "content-type": "application/json",
      "Idempotency-Key": message.idempotencyKey,
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      from: "Cove Studio <no-reply@mail.coveedu.com>",
      to: [message.to],
      subject: message.subject,
      text: message.text,
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses an accepted response with no provider message id", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      new HttpEmailSender("re_private", "Cove <no-reply@mail.coveedu.com>")
        .send(message),
    ).resolves.toEqual({
      ok: false,
      failureCode: "provider_invalid_response",
      retryable: false,
    });
  });

  it.each([
    [429, "rate_limit_exceeded", "provider_rate_limit_exceeded", true],
    [409, "concurrent_idempotent_requests", "provider_concurrent_idempotent_requests", true],
    [409, "invalid_idempotent_request", "provider_invalid_idempotent_request", false],
    [422, "invalid_from_address", "provider_invalid_from_address", false],
    [401, "restricted_api_key", "provider_restricted_api_key", false],
    [503, "internal_server_error", "provider_internal_server_error", true],
  ])(
    "classifies status %s and provider error %s",
    async (status, name, failureCode, retryable) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ name, message: "provider prose" }), {
          status,
          headers: { "content-type": "application/json" },
        }),
      );

      await expect(
        new HttpEmailSender("re_private", "Cove <no-reply@mail.coveedu.com>")
          .send(message),
      ).resolves.toEqual({ ok: false, failureCode, retryable });
    },
  );

  it("falls back to the status without retaining arbitrary provider prose", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ name: "recipient@example.com", message: "private detail" }),
        { status: 400, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      new HttpEmailSender("re_private", "Cove <no-reply@mail.coveedu.com>")
        .send(message),
    ).resolves.toEqual({
      ok: false,
      failureCode: "provider_400",
      retryable: false,
    });
  });

  it("treats a transport failure as retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("timed out", "TimeoutError"),
    );

    await expect(
      new HttpEmailSender("re_private", "Cove <no-reply@mail.coveedu.com>")
        .send(message),
    ).resolves.toEqual({
      ok: false,
      failureCode: "transport_error",
      retryable: true,
    });
  });
});

describe("maskEmail", () => {
  it("keeps an address recognizable without exposing its local part", () => {
    expect(maskEmail("student@example.com")).toBe("st*****@example.com");
    expect(maskEmail("x@example.com")).toBe("x*@example.com");
    expect(maskEmail("not-an-address")).toBe("***");
  });
});
