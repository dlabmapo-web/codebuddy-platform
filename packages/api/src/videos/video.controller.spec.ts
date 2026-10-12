import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { VideoController } from "./video.controller.js";

const id = "00000000-0000-4000-8000-000000000001";
const query = {
  academyId: id,
  materialId: id,
  assetId: id,
  path: "encoded/playback.mp4",
};
function fixture(get: (...args: unknown[]) => Promise<globalThis.Response>) {
  const response = Object.assign(new EventEmitter(), {
    status: vi.fn(),
    setHeader: vi.fn(),
  });
  const controller = new VideoController(
    {
      mediaKey: vi
        .fn()
        .mockResolvedValue({
          key: "private/encoded/playback.mp4",
          bucket: "course-videos",
        }),
    } as never,
    { get } as never,
    {
      verifyAccessToken: vi.fn().mockResolvedValue({ authUserId: "learner" }),
    } as never,
    {} as never,
    { isStudentAnywhere: vi.fn().mockResolvedValue(false) } as never,
    { assert: vi.fn() } as never,
  );
  const run = () =>
    controller.media(
      query,
      "Bearer test-token",
      undefined,
      {} as Request,
      response as unknown as Response,
    );
  return { response, run };
}

describe("video media cancellation", () => {
  it("cancels the upstream download when a learner leaves before headers arrive", async () => {
    let signal: AbortSignal | undefined;
    const { response, run } = fixture(async (_key, _range, incoming) => {
      signal = incoming as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal!.addEventListener("abort", () =>
          reject(new DOMException("Cancelled", "AbortError")),
        );
        queueMicrotask(() => response.emit("close"));
      });
    });
    await expect(run()).resolves.toBeUndefined();
    expect(signal?.aborted).toBe(true);
    expect(response.status).not.toHaveBeenCalled();
  });

  it("still reports an upstream failure while the client is connected", async () => {
    const error = new Error("Storage unavailable");
    const { run } = fixture(async () => {
      throw error;
    });
    await expect(run()).rejects.toBe(error);
  });

  it("releases an upstream body returned after the client disconnected", async () => {
    const cancel = vi.fn();
    const { response, run } = fixture(async () => {
      response.emit("close");
      return { body: { cancel } } as unknown as globalThis.Response;
    });
    await expect(run()).resolves.toBeUndefined();
    expect(cancel).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });
});
