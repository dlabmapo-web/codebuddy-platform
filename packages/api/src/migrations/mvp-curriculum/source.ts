import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { SOURCE_PROJECT_REF, type SourceSnapshot } from "./types.js";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const orderedBase = {
  id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  order_no: z.number().int(),
  is_published: z.boolean(),
  created_at: timestamp,
  updated_at: timestamp,
};
const schemas = {
  subjects: z.object(orderedBase),
  stages: z.object({ ...orderedBase, subject_id: uuid }),
  chapters: z.object({ ...orderedBase, stage_id: uuid }),
  problems: z.object({
    id: uuid, problem_no: z.number().int(), chapter_id: uuid.nullable(), order_no: z.number().int(),
    title: z.string(), description: z.string(), difficulty: z.string(),
    input_format: z.string().nullable(), output_format: z.string().nullable(),
    constraint_text: z.string().nullable(), starter_code: z.string().nullable(),
    time_limit_ms: z.number().int().positive(), memory_limit_mb: z.number().int().positive(),
    is_published: z.boolean(), use_ai_feedback: z.boolean(), created_at: timestamp, updated_at: timestamp,
  }),
  test_cases: z.object({
    id: uuid, problem_id: uuid, input: z.string(), expected_output: z.string(),
    is_sample: z.boolean(), is_hidden: z.boolean(), order_no: z.number().int(), created_at: timestamp,
  }),
  problem_hints: z.object({
    id: uuid, problem_id: uuid, trigger_pattern: z.string().nullable(), hint_text: z.string(),
    order_no: z.number().int(), created_at: timestamp,
  }),
};

type TableName = keyof typeof schemas;

function assertSourceProject(url: string): void {
  const host = new URL(url).hostname;
  if (!host.startsWith(`${SOURCE_PROJECT_REF}.`)) {
    throw new Error(`Source URL must belong to the approved project ${SOURCE_PROJECT_REF}.`);
  }
}

async function readAll(client: SupabaseClient, table: TableName): Promise<unknown[]> {
  const pageSize = 1_000;
  const rows: unknown[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read source ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

function parseRows<T extends TableName>(table: T, rows: unknown[]): z.infer<(typeof schemas)[T]>[] {
  const result = z.array(schemas[table]).safeParse(rows);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new Error(`Invalid source ${table} row at ${first?.path.join(".") || "unknown"}: ${first?.message ?? "validation failed"}`);
  }
  return result.data;
}

export async function extractSourceSnapshot(environment: {
  sourceUrl: string;
  sourceKey: string;
}): Promise<SourceSnapshot> {
  assertSourceProject(environment.sourceUrl);
  const client = createClient(environment.sourceUrl, environment.sourceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const [subjects, stages, chapters, problems, testCases, hints] = await Promise.all([
    readAll(client, "subjects"), readAll(client, "stages"), readAll(client, "chapters"),
    readAll(client, "problems"), readAll(client, "test_cases"), readAll(client, "problem_hints"),
  ]);
  return {
    sourceProjectRef: SOURCE_PROJECT_REF,
    extractedAt: new Date().toISOString(),
    subjects: parseRows("subjects", subjects), stages: parseRows("stages", stages),
    chapters: parseRows("chapters", chapters), problems: parseRows("problems", problems),
    testCases: parseRows("test_cases", testCases), hints: parseRows("problem_hints", hints),
  } as SourceSnapshot;
}
