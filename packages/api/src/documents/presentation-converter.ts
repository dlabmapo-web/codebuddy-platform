import { openAsBlob } from "node:fs";
import { open, readFile, stat, writeFile } from "node:fs/promises";

import { AppException } from "../common/app-exception.js";

/**
 * PPT and PPTX uploads, turned into a PDF once, when the author saves them
 * (QA-002, 2026-11-20). Readers then open the stored PDF exactly as any other:
 * a signed storage URL and pdf.js on their own device, so reading a deck costs
 * the server nothing.
 *
 * The conversion itself runs in a separate Gotenberg (LibreOffice) container
 * with its own CPU and memory caps (`deploy/compose.production.yml`), never
 * in the API process. This side sends one deck at a time, so two uploads
 * never double the converter's memory, and gives up after two minutes.
 */
export type DocumentKind = "pdf" | "ppt" | "pptx" | "unknown";

const OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const CONVERSION_TIMEOUT_MS = 120_000;
/** A converted deck larger than this is not a lesson file. */
const MAX_CONVERTED_BYTES = 300 * 1024 * 1024;

/** What an uploaded file is, by its content (never by its name alone). */
export async function documentKind(path: string): Promise<DocumentKind> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const head = Buffer.alloc(8);
    await handle.read(head, 0, 8, 0);
    if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
    if (head.equals(OLE2)) {
      // An OLE2 file may be any old Office document; PowerPoint's carries a
      // "PowerPoint Document" stream, named in UTF-16 in the directory.
      const bytes = await readFile(path);
      return bytes.includes(Buffer.from("PowerPoint Document", "utf16le")) ? "ppt" : "unknown";
    }
    if (head.subarray(0, 4).equals(ZIP)) {
      // The central directory at the end lists every part's name.
      const length = Math.min(size, 4 * 1024 * 1024);
      const tail = Buffer.alloc(length);
      await handle.read(tail, 0, length, size - length);
      return tail.includes(Buffer.from("ppt/presentation.xml", "latin1")) ? "pptx" : "unknown";
    }
    return "unknown";
  } finally {
    await handle.close();
  }
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Converts the deck at `path` to a PDF written to `outputPath`.
 *
 * Failures reuse the PDF codes (the shared error namespace has no room left):
 * `PDF_BUSY` when the converter is not configured, unreachable or too slow —
 * try again shortly — and `PDF_INVALID` when it refuses the deck.
 */
export function convertPresentation(
  input: { path: string; kind: "ppt" | "pptx"; outputPath: string },
  converterUrl: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const run = queue.then(() => convertNow(input, converterUrl, fetcher));
  queue = run.catch(() => undefined);
  return run;
}

async function convertNow(
  input: { path: string; kind: "ppt" | "pptx"; outputPath: string },
  converterUrl: string | undefined,
  fetcher: typeof fetch,
) {
  if (!converterUrl) throw new AppException("PDF_BUSY", 503);
  const form = new FormData();
  // Streamed from disk: the deck is never held in the API's memory.
  form.append("files", await openAsBlob(input.path), `slides.${input.kind}`);
  let response: Response;
  try {
    response = await fetcher(new URL("/forms/libreoffice/convert", converterUrl), {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(CONVERSION_TIMEOUT_MS),
    });
  } catch {
    throw new AppException("PDF_BUSY", 504);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new AppException("PDF_INVALID", 422);
  }
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > MAX_CONVERTED_BYTES) throw new AppException("PDF_INVALID", 413);
    parts.push(Buffer.from(chunk));
  }
  await writeFile(input.outputPath, Buffer.concat(parts), { mode: 0o600 });
  if ((await stat(input.outputPath)).size === 0) throw new AppException("PDF_INVALID", 422);
}
