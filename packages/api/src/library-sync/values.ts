import { Prisma } from "../generated/prisma/client.js";
import { valueByteSize, type CanonicalValue } from "./canonical.js";

/**
 * The content-addressed value store (design §7.3).
 *
 * One statement to write, one to read, whatever the number of values. There
 * is deliberately no lookup by bare hash outside this module's callers, which
 * each authorize a release, copy or conflict first: a hash is not a
 * capability.
 */

type Db = Pick<Prisma.TransactionClient, "$executeRaw" | "$queryRaw">;

export async function storeValues(
  db: Db,
  entries: ReadonlyArray<{ hash: string; value: CanonicalValue }>,
): Promise<void> {
  const unique = new Map<string, CanonicalValue>();
  for (const entry of entries)
    if (!unique.has(entry.hash)) unique.set(entry.hash, entry.value);
  if (unique.size === 0) return;
  const rows = [...unique].map(([hash, value]) => ({
    hash,
    value,
    byteSize: valueByteSize(value),
  }));
  await db.$executeRaw`
    INSERT INTO library_sync_values (hash, value, byte_size)
    -- A unit whose value is JSON null (an empty side body, no reference PDF)
    -- comes out of the recordset as SQL NULL; store the JSON null it was.
    SELECT v.hash, coalesce(v.value, 'null'::jsonb), v.byte_size
    FROM jsonb_to_recordset(${JSON.stringify(rows.map((row) => ({ hash: row.hash, value: row.value, byte_size: row.byteSize })))}::jsonb)
      AS v(hash text, value jsonb, byte_size int)
    ON CONFLICT (hash) DO NOTHING`;
}

export async function readValues(
  db: Db,
  hashes: Iterable<string>,
): Promise<Map<string, CanonicalValue>> {
  const wanted = [...new Set(hashes)];
  if (wanted.length === 0) return new Map();
  const rows = await db.$queryRaw<
    Array<{ hash: string; value: CanonicalValue }>
  >`
    SELECT hash, value FROM library_sync_values WHERE hash = ANY(${wanted}::text[])`;
  return new Map(rows.map((row) => [row.hash, row.value]));
}

/** Which of these hashes the store already holds. */
export async function existingHashes(
  db: Db,
  hashes: Iterable<string>,
): Promise<Set<string>> {
  const wanted = [...new Set(hashes)];
  if (wanted.length === 0) return new Set();
  const rows = await db.$queryRaw<Array<{ hash: string }>>`
    SELECT hash FROM library_sync_values WHERE hash = ANY(${wanted}::text[])`;
  return new Set(rows.map((row) => row.hash));
}
