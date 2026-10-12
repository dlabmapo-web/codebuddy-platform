import "dotenv/config";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
const project = "lnrmxjxsjxymgphgatwn";
assert.equal(
  new URL(process.env.SUPABASE_URL!).hostname,
  `${project}.supabase.co`,
  "Development only",
);
assert.ok(
  process.env.DATABASE_URL?.includes(project),
  "Development database only",
);
const db = new Client({ connectionString: process.env.DATABASE_URL });
const storage = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);
await db.connect();
try {
  const { data: bucket, error } =
    await storage.storage.getBucket("course-videos");
  assert.ifError(error);
  assert.equal(bucket?.public, false);
  const { rows } = await db.query(
    `SELECT c.relname, c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_read,
 has_table_privilege('authenticated',c.oid,'SELECT') AS user_read
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY($1)`,
    [
      [
        "video_assets",
        "video_lessons",
        "video_captions",
        "video_processing_jobs",
        "video_watch_progress",
      ],
    ],
  );
  assert.equal(rows.length, 5);
  for (const row of rows) {
    assert.equal(row.relrowsecurity, true);
    assert.equal(row.anon_read, false);
    assert.equal(row.user_read, false);
  }
  const policy = await db.query(
    "SELECT cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='video_reserved_source_insert'",
  );
  assert.equal(policy.rows[0]?.cmd, "INSERT");
  const asset = (
    await db.query(
      "SELECT id, object_key FROM video_assets WHERE state='READY' LIMIT 1",
    )
  ).rows[0];
  assert.ok(asset, "Run the synthetic video fixture first");
  const original = await fetch(
    `${process.env.SUPABASE_URL}/storage/v1/object/public/course-videos/${asset.object_key}`,
  );
  assert.notEqual(original.status, 200);
  await original.body?.cancel();
  await db.query("BEGIN");
  let rejected = false;
  try {
    await db.query("UPDATE video_assets SET outputs='[]'::jsonb WHERE id=$1", [
      asset.id,
    ]);
  } catch {
    rejected = true;
  } finally {
    await db.query("ROLLBACK");
  }
  assert.ok(rejected, "READY output manifest must be immutable");
  console.log(
    "Video storage verified: private bucket, five RLS-protected tables, no direct reads, INSERT-only reservation policy, private original, immutable READY manifest.",
  );
} finally {
  await db.end();
}
