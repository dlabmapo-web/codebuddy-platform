import { open, mkdir, rename, readdir, stat } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { serialize, deserialize } from "node:v8";
import { invariant } from "./errors.js";
// Old snapshot + atomic replacement are both charged to the 64 MiB disk quota.
const QUOTA = 32 * 1024 * 1024;
// Store captures as UTF-8 bytes. V8 otherwise uses two bytes for an entire
// mostly-ASCII string containing a single non-Latin-1 character.
function pack(value: unknown, key = ""): unknown {
  if ((key === "stdout" || key === "stderr") && typeof value === "string")
    return { captureUtf8: Buffer.from(value, "utf8") };
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((v) => pack(v));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, pack(v, k)]),
    );
  return value;
}
function unpack(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(unpack);
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (
      entries.length === 1 &&
      entries[0][0] === "captureUtf8" &&
      Buffer.isBuffer(entries[0][1])
    )
      return new TextDecoder("utf-8", { fatal: true }).decode(entries[0][1]);
    return Object.fromEntries(entries.map(([k, v]) => [k, unpack(v)]));
  }
  return value;
}
/** Single fsync/rename snapshot: no source, stdin, answer, score or app credential. */
export class Journal<T> {
  private tail: Promise<void> = Promise.resolve();
  constructor(readonly directory: string) {
    invariant(isAbsolute(directory), "Journal directory must be absolute");
  }
  async read(): Promise<T | null> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const s = await stat(this.directory);
    invariant(
      (s.mode & 0o077) === 0 && s.uid === process.getuid?.(),
      "Journal must be private and owned",
    );
    const files = await readdir(this.directory);
    invariant(
      files.every((f) => f === "state.bin" || f === "state.next"),
      "Unknown journal contents",
    );
    let f;
    try {
      f = await open(join(this.directory, "state.bin"), "r");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
    try {
      const size = (await f.stat()).size;
      invariant(size <= QUOTA, "Journal quota exceeded");
      const data = Buffer.alloc(size + 1);
      let n = 0;
      while (n < data.length) {
        const r = await f.read(data, n, data.length - n, null);
        if (!r.bytesRead) break;
        n += r.bytesRead;
      }
      invariant(n <= QUOTA, "Journal quota exceeded");
      const snapshot = deserialize(data.subarray(0, n));
      invariant(
        snapshot.format === "utf8-capture-v1",
        "Unknown private journal format",
      );
      return unpack(snapshot.data) as T;
    } finally {
      await f.close();
    }
  }
  write(value: T): Promise<void> {
    const data = serialize({ format: "utf8-capture-v1", data: pack(value) });
    invariant(data.length <= QUOTA, "Journal quota exceeded");
    const run = async () => {
      const f = await open(join(this.directory, "state.next"), "w", 0o600);
      try {
        await f.writeFile(data);
        await f.sync();
      } finally {
        await f.close();
      }
      await rename(
        join(this.directory, "state.next"),
        join(this.directory, "state.bin"),
      );
      const d = await open(this.directory, "r");
      try {
        await d.sync();
      } finally {
        await d.close();
      }
    };
    const result = this.tail.then(run);
    this.tail = result.catch(() => {});
    return result;
  }
}
