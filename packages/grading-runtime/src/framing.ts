import { FRAME_LIMIT, NativeInfrastructureError } from "./contract.js";
/** A single length-prefixed frame per connection. Allocate only after bounded header. */
export class FrameDecoder {
  private header = Buffer.alloc(4);
  private headerBytes = 0;
  private payload?: Buffer;
  private used = 0;
  private done = false;
  constructor(
    private readonly limit = FRAME_LIMIT,
    private readonly reserve: (bytes: number) => void = () => {},
  ) {}
  push(chunk: Buffer): unknown | undefined {
    if (this.done) throw new NativeInfrastructureError("Extra frame data");
    let offset = 0;
    while (offset < chunk.length && this.headerBytes < 4)
      this.header[this.headerBytes++] = chunk[offset++];
    if (this.headerBytes < 4) return;
    if (!this.payload) {
      const length = this.header.readUInt32BE();
      if (length < 2 || length > this.limit)
        throw new NativeInfrastructureError("Frame exceeds bound");
      this.reserve(length);
      this.payload = Buffer.alloc(length);
    }
    const count = Math.min(
      chunk.length - offset,
      this.payload.length - this.used,
    );
    chunk.copy(this.payload, this.used, offset, offset + count);
    this.used += count;
    offset += count;
    if (offset < chunk.length)
      throw new NativeInfrastructureError("Trailing frame data");
    if (this.used !== this.payload.length) return;
    this.done = true;
    const payload = this.payload;
    this.payload = undefined;
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(payload),
    );
  }
}
export function encodeFrame(value: unknown, limit = FRAME_LIMIT): Buffer {
  const payload = Buffer.from(JSON.stringify(value));
  if (payload.length > limit)
    throw new NativeInfrastructureError("Response exceeds bound");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
}
/** Drop partial trailing codepoints: replacement characters may exceed byte budget. */
export class ByteCapture {
  private readonly buffer: Buffer;
  private size = 0;
  truncated = false;
  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new Error("Invalid capture bound");
    this.buffer = Buffer.allocUnsafe(limit);
  }
  append(chunk: Buffer) {
    const take = Math.min(chunk.length, this.limit - this.size);
    chunk.copy(this.buffer, this.size, 0, take);
    this.size += take;
    if (take < chunk.length) this.truncated = true;
  }
  text() {
    // Invalid input expands to replacement characters. Normalize once, then take
    // a UTF-8 boundary in O(n), rather than repeatedly measuring/slicing strings.
    const normalized = Buffer.from(
      new TextDecoder().decode(this.buffer.subarray(0, this.size), {
        stream: this.truncated,
      }),
    );
    let end = Math.min(normalized.length, this.limit);
    if (end < normalized.length) this.truncated = true;
    // At most three continuation bytes; never scan the whole string repeatedly.
    while (end > 0 && (normalized[end] & 0xc0) === 0x80) end--;
    return normalized.subarray(0, end).toString("utf8");
  }
}
