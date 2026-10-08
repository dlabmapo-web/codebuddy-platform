import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import type { Request } from "express";
import { pdfMaxUploadBytes } from "@cove/shared";
import { safePdfFilename, validatePdf, receivePdf } from "./pdf-files.js";

describe("PDF processing boundary", () => {
  it("refuses an oversized declared body before reading or parsing", async () => {
    const request = new PassThrough();
    Object.assign(request, {
      headers: { "content-length": String(pdfMaxUploadBytes + 1) },
    });
    await expect(
      receivePdf(request as unknown as Request),
    ).rejects.toMatchObject({ code: "PDF_TOO_LARGE" });
    request.end();
  });
  it("rejects empty uploads and cleans their temporary file", async () => {
    const request = new PassThrough();
    Object.assign(request, { headers: {} });
    request.end();
    await expect(
      receivePdf(request as unknown as Request),
    ).rejects.toMatchObject({ code: "PDF_INVALID" });
  });
  it("reads actual page trees in a separate process", async () => {
    expect(
      await validatePdf(resolve("../../e2e/fixtures/lecture-material.pdf")),
    ).toBe(2);
  }, 30_000);
  it("rejects fake PDF headers and malformed content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-test-"));
    try {
      const path = join(dir, "fake.pdf");
      await writeFile(path, "%PDF-1.4\nnot a PDF");
      await expect(validatePdf(path)).rejects.toMatchObject({
        code: "PDF_INVALID",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
  it("sanitizes paths and download header control characters", () => {
    expect(safePdfFilename('../lectures/lesson\n".pdf')).toBe("lesson__.pdf");
    expect(safePdfFilename("C:\\secret\\자료.pdf")).toBe("자료.pdf");
  });
});
