import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { convertPresentation, documentKind } from "./presentation-converter.js";

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe("PowerPoint uploads (QA-002)", () => {
  let dir = "";
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "deck-test-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const file = async (name: string, bytes: Buffer) => {
    const path = join(dir, name);
    await writeFile(path, bytes);
    return path;
  };

  it("recognises PDF, PPT and PPTX by content, not by name", async () => {
    expect(await documentKind(await file("a.bin", Buffer.from("%PDF-1.7\n")))).toBe("pdf");
    expect(await documentKind(await file("b.bin", Buffer.concat([OLE2, Buffer.alloc(64), Buffer.from("PowerPoint Document", "utf16le")])))).toBe("ppt");
    expect(await documentKind(await file("c.bin", Buffer.concat([ZIP, Buffer.alloc(64), Buffer.from("ppt/presentation.xml")])))).toBe("pptx");
    // A Word file is OLE2 or ZIP too, but not a deck.
    expect(await documentKind(await file("d.doc", Buffer.concat([OLE2, Buffer.from("WordDocument", "utf16le")])))).toBe("unknown");
    expect(await documentKind(await file("e.pptx", Buffer.concat([ZIP, Buffer.from("word/document.xml")])))).toBe("unknown");
    expect(await documentKind(await file("f.pptx", Buffer.from("not a deck")))).toBe("unknown");
  });

  it("sends the deck to the converter and writes the PDF it returns", async () => {
    const path = await file("upload.pdf", Buffer.concat([ZIP, Buffer.from("ppt/presentation.xml")]));
    const outputPath = join(dir, "converted.pdf");
    const fetcher = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(String(url)).toBe("http://converter.test/forms/libreoffice/convert");
      const form = init!.body as FormData;
      expect((form.get("files") as File).name).toBe("slides.pptx");
      return new Response("%PDF-1.7 converted");
    });
    await convertPresentation({ path, kind: "pptx", outputPath }, "http://converter.test", fetcher as never);
    expect(await readFile(outputPath, "utf8")).toBe("%PDF-1.7 converted");
  });

  it("answers PDF_BUSY when the converter is missing or unreachable", async () => {
    const path = await file("upload.pdf", OLE2);
    const outputPath = join(dir, "converted.pdf");
    await expect(convertPresentation({ path, kind: "ppt", outputPath }, undefined)).rejects.toMatchObject({ code: "PDF_BUSY" });
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    await expect(convertPresentation({ path, kind: "ppt", outputPath }, "http://converter.test", down as never)).rejects.toMatchObject({ code: "PDF_BUSY" });
  });

  it("answers PDF_INVALID when the converter refuses the deck", async () => {
    const path = await file("upload.pdf", OLE2);
    const refuse = vi.fn(async () => new Response("LibreOffice failed", { status: 400 }));
    await expect(
      convertPresentation({ path, kind: "ppt", outputPath: join(dir, "converted.pdf") }, "http://converter.test", refuse as never),
    ).rejects.toMatchObject({ code: "PDF_INVALID" });
  });
});
