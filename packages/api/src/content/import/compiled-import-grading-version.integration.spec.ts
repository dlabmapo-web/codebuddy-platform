import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("compiled import grading-version data repair", () => {
  it("repairs only the known mismatch, preserves definitions, and is idempotent", async () => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("Use a disposable local PostgreSQL database for this test");
    }
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query("BEGIN");
      // A temporary relation shadows the real table, so no persistent exercise
      // can be changed even if the local database already contains other tests.
      await client.query(`CREATE TEMP TABLE programming_exercises (
        id text PRIMARY KEY, language text, grading_mode text,
        input_prompt_policy text, grading_semantic_version text,
        submission_policy text DEFAULT 'AUTOMATIC', grading_revision int DEFAULT 7,
        definition jsonb DEFAULT '{"cases":[{"input":"","expectedOutput":"hello","weight":1}],"maximumPoints":100,"timeLimitMs":3000}',
        updated_at timestamptz DEFAULT '2026-01-01T00:00:00Z'
      ) ON COMMIT DROP`);
      const rows = [
        ["bad-c", "C", "ELICE_STDIO", "INCLUDE", "legacy-v1", "AUTOMATIC"],
        ["bad-cpp", "CPP", "ELICE_STDIO", "INCLUDE", "legacy-v1", "AUTOMATIC"],
        ["bad-practice", "C", "ELICE_STDIO", "INCLUDE", "legacy-v1", "PRACTICE_ONLY"],
        ["valid-c", "C", "ELICE_STDIO", "INCLUDE", "elice-v1", "AUTOMATIC"],
        ["python", "PYTHON", "LEGACY_STDIO", "INCLUDE", "legacy-v1", "AUTOMATIC"],
        ["python-weighted", "PYTHON", "ELICE_STDIO", "INCLUDE", "legacy-v1", "AUTOMATIC"],
        ["unknown-cpp", "CPP", "ELICE_STDIO", "INCLUDE", "future-version", "AUTOMATIC"],
        ["other-prompt-policy", "C", "ELICE_STDIO", "IGNORE", "legacy-v1", "AUTOMATIC"],
        ["other-mode", "C", "LEGACY_STDIO", "INCLUDE", "legacy-v1", "AUTOMATIC"],
        ["existing-ignore-version", "CPP", "ELICE_STDIO", "IGNORE", "elice-v2", "AUTOMATIC"],
      ];
      await client.query(`INSERT INTO programming_exercises
        (id,language,grading_mode,input_prompt_policy,grading_semantic_version,submission_policy)
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
          id text,language text,grading_mode text,input_prompt_policy text,
          grading_semantic_version text,submission_policy text)`,
      [JSON.stringify(rows.map(([id, language, grading_mode, input_prompt_policy, grading_semantic_version, submission_policy]) =>
        ({ id, language, grading_mode, input_prompt_policy, grading_semantic_version, submission_policy })))]);
      const before = (await client.query("SELECT * FROM programming_exercises ORDER BY id")).rows;
      const sql = await readFile(new URL("../../../prisma/migrations/20261112090000_repair_compiled_import_grading_versions/migration.sql", import.meta.url), "utf8");
      expect((await client.query(sql)).rowCount).toBe(3);
      const after = (await client.query("SELECT * FROM programming_exercises ORDER BY id")).rows;
      const repaired = new Set(["bad-c", "bad-cpp", "bad-practice"]);
      for (const [index, row] of after.entries()) {
        const original = before[index];
        if (repaired.has(row.id)) {
          expect(row).toEqual({ ...original, grading_semantic_version: "elice-v1", updated_at: expect.any(Date) });
          expect(row.updated_at.getTime()).toBeGreaterThan(original.updated_at.getTime());
        } else {
          expect(row).toEqual(original);
        }
      }
      expect((await client.query(sql)).rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
});
