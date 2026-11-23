import { createHash } from "node:crypto";
import { mkdtemp, open, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { Request } from "express";
import { pdfMaxUploadBytes } from "@cove/shared";
import { AppException } from "../common/app-exception.js";

export function safePdfFilename(name: string) {
  return (
    (name.split(/[\\/]/).pop() ?? "document.pdf")
      .replace(/[\x00-\x1f\x7f"<>:|?*]/g, "_")
      .slice(0, 180) || "document.pdf"
  );
}

/** Backpressure keeps the original file on disk, never a growing array of buffers. */
export async function receivePdf(request: Request) {
  if (Number(request.headers["content-length"]) > pdfMaxUploadBytes) {
    request.resume();
    throw new AppException("PDF_TOO_LARGE", 413);
  }
  const directory = await mkdtemp(join(tmpdir(), "cove-pdf-"));
  const path = join(directory, "upload.pdf");
  const file = await open(path, "wx", 0o600);
  let byteSize = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of request.iterator({ destroyOnReturn: false })) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      byteSize += bytes.length;
      if (byteSize > pdfMaxUploadBytes)
        throw new AppException("PDF_TOO_LARGE", 413);
      hash.update(bytes);
      let written = 0;
      while (written < bytes.length)
        written += (await file.write(bytes, written, bytes.length - written))
          .bytesWritten;
    }
    if (!byteSize) throw new AppException("PDF_INVALID");
    return {
      path,
      byteSize,
      checksumSha256: hash.digest("hex"),
      dispose: () => rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    request.resume();
    await rm(directory, { recursive: true, force: true });
    if (error instanceof AppException) throw error;
    throw new AppException("PDF_INVALID");
  } finally {
    await file.close();
  }
}

const parser = `
import { readFile } from 'node:fs/promises';
const { getDocument } = await import(process.argv[2]);
try {
 const file = await readFile(process.argv[1]);
 const data = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
 if (new TextDecoder().decode(data.slice(0,5)) !== '%PDF-') process.exit(2);
 const task = getDocument({data, isEvalSupported:false, stopAtErrors:true, verbosity:0, useSystemFonts:false, disableFontFace:true, maxImageSize:1});
 const doc = await task.promise;
 if (doc.numPages < 1) process.exit(2);
 for(let n=1; n<=doc.numPages; n++) { const page=await doc.getPage(n); await page.getOperatorList(); page.cleanup(); }
 process.stdout.write(JSON.stringify({pages:doc.numPages}));
 await task.destroy();
} catch { process.exit(2); }
`;

const MB = 1024 * 1024;
/** The checker's memory ceiling grows with the file it holds, up to 1 GB. */
export function pdfValidationLimits(byteSize: number) {
  const fileMb = Math.ceil(byteSize / MB);
  return {
    rssKb: Math.min(256 + 2 * fileMb, 1024) * 1024,
    heapMb: Math.min(192 + fileMb, 768),
  };
}

let validationQueue: Promise<unknown> = Promise.resolve();

/**
 * Separate heap, wall-clock deadline, and RSS ceiling: uploaded PDFs never run
 * in the API process. One check at a time, so two large uploads never add up.
 *
 * Pictures are not decoded (`maxImageSize: 1`): the check proves the file
 * parses and counts its pages; readers' browsers draw the pictures. Decoding
 * them here is what pushed image-heavy decks of 4 MB and more past the
 * ceiling (QA-002: 11–27 MB decks peaked at 317–333 MB, 135–184 MB without).
 */
export function validatePdf(path: string): Promise<number> {
  const run = validationQueue.then(() => validatePdfNow(path));
  validationQueue = run.catch(() => undefined);
  return run;
}

async function validatePdfNow(path: string): Promise<number> {
  const limits = pdfValidationLimits((await stat(path)).size);
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        `--max-old-space-size=${limits.heapMb}`,
        "--input-type=module",
        "-e",
        parser,
        path,
        pathToFileURL(
          createRequire(import.meta.url).resolve(
            "pdfjs-dist/legacy/build/pdf.mjs",
          ),
        ).href,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    let limited = false;
    const kill = () => {
      limited = true;
      child.kill("SIGKILL");
    };
    const timeout = setTimeout(kill, 30_000);
    let checking = false;
    const memory = setInterval(() => {
      if (checking || !child.pid) return;
      checking = true;
      void (async () => {
        try {
          const rss =
            process.platform === "linux"
              ? Number(
                  (await readFile(`/proc/${child.pid}/status`, "utf8")).match(
                    /VmRSS:\s+(\d+)/,
                  )?.[1],
                )
              : Number(
                  (
                    await promisify(execFile)("ps", [
                      "-o",
                      "rss=",
                      "-p",
                      String(child.pid),
                    ])
                  ).stdout.trim(),
                );
          if (rss > limits.rssKb) kill();
        } catch {
          /* Child may already have exited. */
        } finally {
          checking = false;
        }
      })();
    }, 300);
    const finish = () => {
      clearTimeout(timeout);
      clearInterval(memory);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 4096) kill();
    });
    child.on("error", () => {
      finish();
      reject(new AppException("PDF_INVALID"));
    });
    child.on("close", (code) => {
      finish();
      if (limited) return reject(new AppException("PDF_VALIDATION_LIMIT", 422));
      try {
        const parsed = JSON.parse(output) as { pages: number };
        if (
          code !== 0 ||
          !Number.isSafeInteger(parsed.pages) ||
          parsed.pages < 1
        )
          throw new Error();
        resolve(parsed.pages);
      } catch {
        reject(new AppException("PDF_INVALID", 422));
      }
    });
  });
}
