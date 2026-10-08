import "dotenv/config";
import pg from "pg";
import assert from "node:assert/strict";
if (
  new URL(process.env.SUPABASE_URL ?? "").hostname !==
  "lnrmxjxsjxymgphgatwn.supabase.co"
)
  throw new Error("Development database required");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  for (const table of [
    "manual_materials",
    "manual_drafts",
    "manual_submissions",
    "manual_reviews",
    "manual_assets",
  ]) {
    const result = await db.query(
      "SELECT relrowsecurity AS secured, has_table_privilege($1,$2,$3) AS readable, has_table_privilege($4,$2,$3) AS authenticated FROM pg_class WHERE oid=$2::regclass",
      ["anon", table, "SELECT", "authenticated"],
    );
    assert.equal(result.rows[0].secured, true);
    assert.equal(result.rows[0].readable, false);
    assert.equal(result.rows[0].authenticated, false);
  }
  for (const table of ["manual_submissions", "manual_reviews"]) {
    const fixture =
      table === "manual_submissions"
        ? `SELECT s.id FROM manual_submissions s JOIN materials m ON m.id=s.material_id JOIN lectures l ON l.id=m.lecture_id JOIN course_modules cm ON cm.id=l.course_module_id WHERE cm.course_id='ee020000-0000-4000-8000-000000000001' LIMIT 1`
        : `SELECT r.id FROM manual_reviews r JOIN manual_submissions s ON s.id=r.submission_id JOIN materials m ON m.id=s.material_id JOIN lectures l ON l.id=m.lecture_id JOIN course_modules cm ON cm.id=l.course_module_id WHERE cm.course_id='ee020000-0000-4000-8000-000000000001' LIMIT 1`;
    const rows = await db.query(fixture);
    assert.ok(rows.rows.length, "Run turtle E2E before database verification");
    await db.query("BEGIN");
    let rejected = false;
    try {
      await db.query(
        `UPDATE ${table} SET ${table === "manual_submissions" ? "answer='IMMUTABILITY_PROBE'" : "feedback='IMMUTABILITY_PROBE'"} WHERE id=$1`,
        [rows.rows[0].id],
      );
    } catch (error) {
      assert.equal((error as { code: string }).code, "P0001");
      rejected = true;
    } finally {
      await db.query("ROLLBACK");
    }
    assert.ok(rejected, "Snapshot mutation must be rejected");
  }
  console.log(
    "Manual table client restrictions and immutable submission/review guards verified",
  );
} finally {
  await db.end();
}
