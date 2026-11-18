import { Prisma } from "../generated/prisma/client.js";

/**
 * One `UPDATE … FROM jsonb_to_recordset` for many rows with different values
 * (AGENTS.md: no statement per row). Table and column names are compile-time
 * constants from this module's callers, never input.
 */

type Tx = Pick<Prisma.TransactionClient, "$executeRaw">;

export type BulkColumn = readonly [name: string, sqlType: string];

export async function bulkUpdate(
  tx: Tx,
  spec: {
    table: string;
    key: BulkColumn;
    columns: readonly BulkColumn[];
    /** Columns readable as `v."name"` by `also`, but not assigned directly. */
    recordOnly?: readonly BulkColumn[];
    /** Extra assignments, raw, e.g. `updated_at = now()` or `revision = t.revision + 1`. */
    also?: readonly string[];
  },
  rows: ReadonlyArray<Record<string, unknown>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const [keyName, keyType] = spec.key;
  const all = [spec.key, ...spec.columns, ...(spec.recordOnly ?? [])];
  const definitions = all.map(([name, type]) => `"${name}" ${type}`).join(", ");
  const assignments = [
    ...spec.columns.map(([name]) => `"${name}" = v."${name}"`),
    ...(spec.also ?? []),
  ].join(", ");
  const payload = JSON.stringify(rows.map((row) => pick(row, all)));
  return tx.$executeRaw(Prisma.sql`
    UPDATE ${Prisma.raw(`"${spec.table}"`)} AS t
    SET ${Prisma.raw(assignments)}
    FROM jsonb_to_recordset(${payload}::jsonb) AS v(${Prisma.raw(definitions)})
    WHERE t.${Prisma.raw(`"${keyName}"`)} = v.${Prisma.raw(`"${keyName}"`)}::${Prisma.raw(keyType)}`);
}

function pick(row: Record<string, unknown>, columns: readonly BulkColumn[]) {
  const out: Record<string, unknown> = {};
  for (const [name] of columns)
    out[name] = row[name] === undefined ? null : row[name];
  return out;
}

/**
 * Rewrite sibling positions densely for whole parents, in two statements.
 *
 * Positions are unique per parent and positive, so every row is first parked
 * above any real position, with its new parent if it moves, and only then
 * given `1..n`. Every member of each affected parent must be in `rows`.
 */
export async function rewriteSiblings(
  tx: Tx,
  table: "course_modules" | "lectures" | "materials",
  parentColumn: "course_id" | "course_module_id" | "lecture_id",
  rows: ReadonlyArray<{ id: string; parentId: string; position: number }>,
): Promise<void> {
  if (rows.length === 0) return;
  const PARK = 1_000_000_000;
  const parked = rows.map((row) => ({
    id: row.id,
    parent: row.parentId,
    position: PARK + row.position,
  }));
  const final = rows.map((row) => ({
    id: row.id,
    parent: row.parentId,
    position: row.position,
  }));
  for (const batch of [parked, final])
    await bulkUpdate(
      tx,
      {
        table,
        key: ["id", "uuid"],
        columns: [
          [parentColumn, "uuid"],
          ["position", "int"],
        ],
      },
      batch.map((row) => ({
        id: row.id,
        [parentColumn]: row.parent,
        position: row.position,
      })),
    );
}
