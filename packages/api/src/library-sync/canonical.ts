import { createHash } from "node:crypto";

/**
 * Canonical values and their hashes (design §7.3).
 *
 * A large text field travels as a tagged object so the same unit hashes the
 * same whether it was read in full or as a SQL digest:
 *
 * - `{ $t: "<full text>" }` from a full read;
 * - `{ $h: "<sha256 hex>" }` from a digest read, computed in SQL with
 *   `encode(sha256(convert_to(col, 'UTF8')), 'hex')`.
 *
 * Hashing always reduces `$t` to `$h`, so the API never needs an 8 Mi test
 * input to decide that it did not change. The tags are objects, never
 * strings, and every JSON column that could hold an object is validated by a
 * strict schema, so authored text cannot impersonate a digest.
 */

/** Bumped whenever the canonical form or any unit's shape changes. */
export const CATALOG_VERSION = 1;

export type Big = { $t: string } | { $h: string };
export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | Big
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function isBig(value: unknown): value is Big {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && (keys[0] === "$t" || keys[0] === "$h");
}

export function big(text: string): Big {
  return { $t: text };
}

/** The text of a full big value; a digest has none. */
export function bigText(value: Big): string {
  if ("$t" in value) return value.$t;
  throw new Error("A digest has no text; read this unit in full.");
}

/** Replace every big value by its digest, recursively. */
export function digestForm(value: CanonicalValue): CanonicalValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(digestForm);
  if (isBig(value)) return "$t" in value ? { $h: sha256Hex(value.$t) } : value;
  const out: Record<string, CanonicalValue> = {};
  for (const key of Object.keys(value)) out[key] = digestForm(value[key]!);
  return out;
}

/** JSON with sorted keys and no whitespace. Undefined object members are dropped. */
export function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Non-finite number in a canonical value");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item ?? null)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      );
    return `{${entries.join(",")}}`;
  }
  throw new Error(`Unsupported canonical value: ${typeof value}`);
}

/**
 * The hash of one unit's value.
 *
 * The unit kind (the unit key without its item suffix) and the catalog
 * version are part of the input, so two units whose values happen to be equal
 * JSON never share a hash, and a catalog change cannot compare equal to the
 * old encoding.
 */
export function unitHash(unitKey: string, value: CanonicalValue): string {
  return sha256Hex(
    canonicalJson({
      v: CATALOG_VERSION,
      k: unitKind(unitKey),
      d: digestForm(value),
    }),
  );
}

/** `exercise.testCase:<key>` → `exercise.testCase`; structural units keep their name. */
export function unitKind(unitKey: string): string {
  const colon = unitKey.indexOf(":");
  return colon === -1 ? unitKey : unitKey.slice(0, colon);
}

/** Byte size of a stored value, for the value store's accounting. */
export function valueByteSize(value: CanonicalValue): number {
  return Buffer.byteLength(canonicalJson(value), "utf8");
}
