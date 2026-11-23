import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { deflateSync } from "node:zlib";
import type { Request } from "express";
import { pdfMaxUploadBytes } from "@cove/shared";
import { pdfValidationLimits, safePdfFilename, validatePdf, receivePdf } from "./pdf-files.js";

/**
 * A one-page PDF holding `images` large greyscale pictures. Deflated zeros keep
 * the file small; decoding them would take `width × height × 4` bytes each.
 */
function imageHeavyPdf(images: number, width: number, height: number) {
  const pixels = deflateSync(Buffer.alloc(width * height));
  const objects: Buffer[] = [];
  const names = Array.from({ length: images }, (_, i) => `/Im${i} ${4 + i} 0 R`).join(" ");
  const draw = Array.from({ length: images }, (_, i) => `q 100 0 0 100 0 ${i * 100} cm /Im${i} Do Q`).join("\n");
  objects.push(Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"));
  objects.push(Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"));
  objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << ${names} >> >> /Contents ${4 + images} 0 R >>`));
  for (let i = 0; i < images; i++)
    objects.push(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`),
      pixels,
      Buffer.from("\nendstream"),
    ]));
  objects.push(Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let length = parts[0]!.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

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
  it("accepts image-heavy PDFs without decoding their pictures (QA-002)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pdf-test-"));
    try {
      const path = join(dir, "deck.pdf");
      // Four 6000×4000 pictures: about 384 MB if decoded, over the old 256 MB ceiling.
      await writeFile(path, imageHeavyPdf(4, 6000, 4000));
      expect(await validatePdf(path)).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
  it("scales the checker's memory ceiling with the file, up to 1 GB", () => {
    expect(pdfValidationLimits(0).rssKb).toBe(256 * 1024);
    expect(pdfValidationLimits(95_000_000).rssKb).toBe((256 + 2 * 91) * 1024);
    expect(pdfValidationLimits(10 ** 9).rssKb).toBe(1024 * 1024);
  });
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
