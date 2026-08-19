import { createHash } from "node:crypto";

/**
 * A stable UUID for a demo record, derived from a human-readable name.
 *
 * The demo dataset is large enough that hand-written constant IDs would be
 * unmaintainable, but it still has to be rerunnable: seeding twice must update
 * the same rows rather than growing a second academy beside the first. Hashing
 * the name gives both — every ID is reproducible from the dataset alone, so
 * upserts key on something the file already knows.
 *
 * RFC 4122 version 5 layout, so Postgres accepts it as a `uuid` and nothing
 * downstream can tell it from a generated one.
 */
export function demoId(name: string): string {
  const hash = createHash("sha1").update(`cove-demo:${name}`).digest();
  const bytes = Uint8Array.prototype.slice.call(hash, 0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/**
 * A deterministic generator, so "which students struggled" is a fixed property
 * of the dataset rather than a fresh accident on every run.
 *
 * A demo is rehearsed. The manager overview a person practises on at nine has
 * to be the one an investor sees at two, and random activity would reshuffle
 * every chart between those two moments.
 */
export function seededRandom(seed: string): () => number {
  const hash = createHash("sha1").update(seed).digest();
  let state = Buffer.from(hash).readUInt32BE(0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks one element, deterministically, from a non-empty list. */
export function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length) % values.length];
}
