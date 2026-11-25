import { describe, expect, it, vi } from "vitest";

import { AiModelError, OpenAiModelClient, withDeadline, type AiModelRequest } from "./ai-model.js";
import { withinHours } from "./ai-settings.js";
import { costMicros, usageMonth } from "./usage.js";

const request: AiModelRequest = {
  model: "m", effort: "none", instructions: "i", content: "secret code", maxOutputTokens: 100,
  schema: { name: "help", schema: { type: "object" } },
};
const body = (over: object = {}) => ({
  status: "completed", model: "m-1", usage: { input_tokens: 10, output_tokens: 5 },
  output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text: '{"reply":"hi"}' }] }], ...over,
});
const client = (response: Response | Error) => {
  const send = vi.fn(async () => { if (response instanceof Error) throw response; return response; });
  return { send, client: new OpenAiModelClient("sk-test-0000000000000000", send as never) };
};
const run = (c: OpenAiModelClient) => c.complete(request, new AbortController().signal);

describe("OpenAiModelClient", () => {
  it("sends a private request and parses the answer", async () => {
    const { send, client: c } = client(Response.json(body()));
    expect(await run(c)).toEqual({ json: { reply: "hi" }, inputTokens: 10, outputTokens: 5, model: "m-1" });
    const sent = JSON.parse((send.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(sent).toMatchObject({ store: false, model: "m", reasoning: { effort: "none" }, text: { format: { type: "json_schema", strict: true } } });
  });
  it.each([401, 429, 500])("reports status %i and nothing from the body", async (status) => {
    const error = await run(client(new Response("sk-leak and secret code", { status })).client).catch((e) => e);
    expect(error).toBeInstanceOf(AiModelError);
    expect(error).toMatchObject({ code: "PROVIDER", detail: `status ${status}` });
    expect(String(error)).not.toMatch(/secret|sk-/);
  });
  it.each([
    [Response.json({ nope: 1 }), "MALFORMED"],
    [Response.json(body({ status: "incomplete" })), "MALFORMED"],
    [Response.json(body({ output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] })), "MALFORMED"],
    [new Response("<html>", { status: 200 }), "PROVIDER"],
    [new Error("ECONNRESET secret"), "PROVIDER"],
  ])("turns a bad answer into %#", async (response, code) => {
    const error = await run(client(response as Response).client).catch((e) => e);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain("secret");
  });
  it("still counts tokens it paid for", async () => {
    const error = await run(client(Response.json(body({ status: "incomplete" }))).client).catch((e) => e);
    expect(error.usage).toEqual({ inputTokens: 10, outputTokens: 5 });
  });
  it("is unavailable without a key and sends nothing", async () => {
    const send = vi.fn();
    const c = new OpenAiModelClient(undefined, send as never);
    expect(c.available).toBe(false);
    await expect(run(c)).rejects.toMatchObject({ code: "PROVIDER" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("withDeadline", () => {
  it("aborts the request it gives up on", async () => {
    let aborted = false;
    await expect(withDeadline(20, (signal) => new Promise(() => signal.addEventListener("abort", () => { aborted = true; }))))
      .rejects.toMatchObject({ code: "TIMEOUT" });
    expect(aborted).toBe(true);
  });
  it("returns in time", async () => {
    expect(await withDeadline(1_000, async () => 7)).toBe(7);
  });
});

describe("usage", () => {
  it("rounds cost up, so a limit is never undercounted", () => {
    expect(costMicros({ inputTokens: 535, outputTokens: 54 }, { inputUsdPerMtok: 0.1, outputUsdPerMtok: 0.5 })).toBe(81);
    expect(costMicros({ inputTokens: 1, outputTokens: 0 }, { inputUsdPerMtok: 0.1, outputUsdPerMtok: 0.5 })).toBe(1);
  });
  it("starts a month at midnight in Seoul", () => {
    expect(usageMonth(new Date("2026-11-30T14:59:59Z"))).toBe("2026-11-01");
    expect(usageMonth(new Date("2026-11-30T15:00:00Z"))).toBe("2026-12-01");
  });
});

describe("withinHours", () => {
  it.each([
    ["22-7", "2026-11-25T13:00:00Z", true], // 22:00
    ["22-7", "2026-11-25T21:59:00Z", true], // 06:59
    ["22-7", "2026-11-25T22:00:00Z", false], // 07:00
    ["22-7", "2026-11-25T03:00:00Z", false], // 12:00
    ["0-24", "2026-11-25T03:00:00Z", true],
    ["9-18", "2026-11-25T03:00:00Z", true],
    ["9-18", "2026-11-25T09:00:00Z", false], // 18:00
    ["5-5", "2026-11-25T20:00:00Z", false],
  ])("%s at %s is %s", (hours, at, inside) => {
    expect(withinHours(hours, new Date(at))).toBe(inside);
  });
});
