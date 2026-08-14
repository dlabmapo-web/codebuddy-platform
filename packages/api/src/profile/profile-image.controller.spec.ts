import { Readable } from "node:stream";
import { EventEmitter } from "node:events";

import { maxUploadBytes } from "@cove/shared";
import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  ProfileImageController,
  readBody,
} from "./profile-image.controller.js";

function request(chunks: Buffer[], contentLength?: number): Request {
  return Object.assign(Readable.from(chunks), {
    headers: contentLength === undefined
      ? {}
      : { "content-length": String(contentLength) },
  }) as unknown as Request;
}

describe("profile image request body", () => {
  it("returns the uploaded bytes", async () => {
    await expect(readBody(request([Buffer.from("abc")]))).resolves.toEqual(
      Buffer.from("abc"),
    );
  });

  it("rejects a declared oversized body before reading the stream", async () => {
    await expect(
      readBody(request([], maxUploadBytes + 1)),
    ).rejects.toMatchObject({
      code: "PROFILE_IMAGE_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects a lying sender without destroying the response socket", async () => {
    const stream = new EventEmitter();
    const resume = vi.fn();
    const incoming = Object.assign(stream, { headers: {}, resume }) as unknown as Request;
    const body = readBody(incoming);
    stream.emit("data", Buffer.alloc(maxUploadBytes));
    stream.emit("data", Buffer.alloc(1));

    await expect(body).rejects.toMatchObject({
      code: "PROFILE_IMAGE_TOO_LARGE",
      status: 413,
    });
    expect(resume).toHaveBeenCalledOnce();
  });
});

describe("ProfileImageController upload limits", () => {
  it("rate-limits before reading or processing image bytes", async () => {
    const profile = { uploadImage: vi.fn() };
    const auth = {
      verifyAccessToken: vi.fn().mockResolvedValue({ authUserId: "auth-1" }),
    };
    const rateLimit = {
      assert: vi.fn(() => {
        throw Object.assign(new Error("limited"), { code: "RATE_LIMITED" });
      }),
    };
    const controller = new ProfileImageController(
      profile as never,
      {} as never,
      auth as never,
      rateLimit as never,
    );

    await expect(
      controller.uploadGlobal(request([Buffer.from("not-read")]), "Bearer token"),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(profile.uploadImage).not.toHaveBeenCalled();
  });
});
