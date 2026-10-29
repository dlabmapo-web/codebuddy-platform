/** Capture raw bytes first. Re-encode replacement characters within the wire byte bound. */
export class BoundedCapture {
  private chunks: Buffer[] = [];
  private bytes = 0;
  truncated = false;
  constructor(readonly limit: number) {}
  push(chunk: Buffer) {
    const n = Math.max(0, Math.min(chunk.length, this.limit - this.bytes));
    if (n) this.chunks.push(Buffer.from(chunk.subarray(0, n)));
    this.bytes += n;
    if (n < chunk.length) this.truncated = true;
  }
  text() {
    const value = Buffer.concat(this.chunks, this.bytes).toString("utf8");
    const encoded = Buffer.from(value, "utf8");
    if (encoded.length > this.limit) this.truncated = true;
    let end = Math.min(encoded.length, this.limit);
    while (end > 0 && (encoded[end]! & 0xc0) === 0x80) end--;
    return encoded.subarray(0, end).toString("utf8");
  }
}
