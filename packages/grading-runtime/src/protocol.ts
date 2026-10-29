import { GRADING_BROKER_MAX_FRAME_BYTES } from "@cove/shared";
import { invariant } from "./errors.js";
/** Four byte unsigned big-endian length, followed by one UTF-8 JSON frame. */
export function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value));
  invariant(body.length <= GRADING_BROKER_MAX_FRAME_BYTES, "Frame too large");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length);
  return Buffer.concat([header, body]);
}
export class FrameDecoder {
  private header = Buffer.alloc(4);
  private headerBytes = 0;
  private body: Buffer | null = null;
  private offset = 0;
  constructor(
    private readonly receive: (frame: string) => void,
    private readonly max = GRADING_BROKER_MAX_FRAME_BYTES,
  ) {}
  push(chunk: Buffer) {
    let cursor = 0;
    while (cursor < chunk.length) {
      if (!this.body) {
        const n = Math.min(4 - this.headerBytes, chunk.length - cursor);
        chunk.copy(this.header, this.headerBytes, cursor, cursor + n);
        cursor += n;
        this.headerBytes += n;
        if (this.headerBytes < 4) continue;
        const size = this.header.readUInt32BE();
        invariant(size > 0 && size <= this.max, "Invalid frame length");
        this.body = Buffer.allocUnsafe(size);
        this.offset = 0;
      }
      const n = Math.min(this.body.length - this.offset, chunk.length - cursor);
      chunk.copy(this.body, this.offset, cursor, cursor + n);
      cursor += n;
      this.offset += n;
      if (this.offset === this.body.length) {
        const value = new TextDecoder("utf-8", { fatal: true }).decode(
          this.body,
        );
        this.body = null;
        this.headerBytes = 0;
        this.receive(value);
      }
    }
  }
  get partial() {
    return this.headerBytes !== 0 || this.body !== null;
  }
}
