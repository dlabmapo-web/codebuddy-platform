import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { remoteImageSources } from "../../content/lesson-images.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { downloadRemoteImage, ManualAssetsService, rasterImageType } from "../../manual/manual-assets.service.js";

/**
 * One-time copy of outside pictures (Elice, Jungol, Biko) into each course's
 * own storage, for statements saved before copy-on-save existed (QA-006).
 *
 *   # Dry run (default): counts per host, academy and course, and every URL
 *   # that can no longer be fetched. Writes nothing.
 *   pnpm --filter @cove/api images:backfill [--academy <slug>]
 *
 *   # Apply: needs the database (project ref and host) typed back, as a guard against the wrong
 *   # .env. `--limit <n>` copies only the first n statements (a trial batch).
 *   pnpm --filter @cove/api images:backfill --apply --confirm-database <ref@host> [--limit <n>] [--academy <slug>]
 *
 * `--out <dir>` chooses where the JSON report goes (default: the current
 * directory); `--out -` writes it to stdout, for read-only containers such as
 * production's `migrate`. Progress and the summary always go to stderr.
 * Production procedure: docs/operations/remote-images-backfill.md.
 *
 * Idempotent: rewritten pictures are `cove-asset:` and are not found again. A
 * statement edited while the run is going is skipped (its text is compared
 * on update). Every rewrite is logged to a JSON file, and the original URL
 * stays in `data-source-url`, so any change can be traced and undone.
 */
type Statement = {
  kind: "problem" | "explanation";
  materialId: string;
  academyId: string;
  academySlug: string;
  courseId: string;
  courseTitle: string;
  title: string;
  fields: Record<string, string>;
};

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function statementsWithRemoteImages(db: PrismaClient, academySlug?: string): Promise<Statement[]> {
  const scope = academySlug ? { lecture: { courseModule: { course: { academy: { slug: academySlug } } } } } : {};
  const like = { contains: "<img", mode: "insensitive" as const };
  const course = { select: { id: true, title: true, academyId: true, academy: { select: { slug: true } } } };
  const [problems, explanations] = await Promise.all([
    db.programmingExercise.findMany({
      where: { description: like, material: scope },
      select: { materialId: true, description: true, material: { select: { title: true, lecture: { select: { courseModule: { select: { course } } } } } } },
    }),
    db.explanationMaterial.findMany({
      where: { OR: [{ body: like }, { sideBody: like }], material: scope },
      select: { materialId: true, body: true, sideBody: true, material: { select: { title: true, lecture: { select: { courseModule: { select: { course } } } } } } },
    }),
  ]);
  const statements: Statement[] = [];
  for (const row of problems) {
    const owner = row.material.lecture.courseModule.course;
    statements.push({ kind: "problem", materialId: row.materialId, academyId: owner.academyId, academySlug: owner.academy.slug, courseId: owner.id, courseTitle: owner.title, title: row.material.title, fields: { description: row.description } });
  }
  for (const row of explanations) {
    const owner = row.material.lecture.courseModule.course;
    const fields: Record<string, string> = { body: row.body };
    if (row.sideBody) fields.sideBody = row.sideBody;
    statements.push({ kind: "explanation", materialId: row.materialId, academyId: owner.academyId, academySlug: owner.academy.slug, courseId: owner.id, courseTitle: owner.title, title: row.material.title, fields });
  }
  return statements.filter((statement) => remoteImageSources(...Object.values(statement.fields)).length > 0);
}

async function dryRun(statements: Statement[]) {
  const urls = new Map<string, Statement[]>();
  for (const statement of statements)
    for (const href of remoteImageSources(...Object.values(statement.fields)))
      urls.set(href, [...(urls.get(href) ?? []), statement]);

  const broken: string[] = [];
  const hrefs = [...urls.keys()];
  for (let at = 0; at < hrefs.length; at += 8) {
    const batch = hrefs.slice(at, at + 8);
    const results = await Promise.all(batch.map(async (href) => {
      const bytes = await downloadRemoteImage(href);
      return { href, ok: Boolean(bytes && rasterImageType(bytes)) };
    }));
    for (const result of results) if (!result.ok) broken.push(result.href);
    process.stderr.write(`\rchecked ${Math.min(at + 8, hrefs.length)}/${hrefs.length} pictures`);
  }
  process.stderr.write("\n");

  const count = <K extends string>(key: (href: string, statement: Statement) => K) => {
    const totals = new Map<K, number>();
    for (const [href, owners] of urls) for (const owner of owners) totals.set(key(href, owner), (totals.get(key(href, owner)) ?? 0) + 1);
    return Object.fromEntries([...totals].sort((a, b) => b[1] - a[1]));
  };
  return {
    statements: statements.length,
    pictures: urls.size,
    byHost: count((href) => new URL(href).hostname),
    byAcademy: count((_, owner) => owner.academySlug),
    byCourse: count((_, owner) => `${owner.academySlug} › ${owner.courseTitle}`),
    broken: broken.map((href) => ({ href, usedBy: urls.get(href)!.map((owner) => `${owner.academySlug} › ${owner.courseTitle} › ${owner.title}`) })),
  };
}

async function apply(db: PrismaClient, assets: ManualAssetsService, statements: Statement[]) {
  const log: Array<Record<string, unknown>> = [];
  for (const [index, statement] of statements.entries()) {
    const next: Record<string, string> = {};
    const failed: string[] = [];
    for (const [field, html] of Object.entries(statement.fields)) {
      const copy = await assets.copyRemoteImages(statement.academyId, statement.courseId, html);
      failed.push(...copy.failed);
      if (copy.html !== html) next[field] = copy.html;
    }
    let updated = 0;
    if (Object.keys(next).length) {
      // Compare-and-set: an author's edit during the run wins; that statement
      // is copied on its next save instead.
      updated = statement.kind === "problem"
        ? (await db.programmingExercise.updateMany({ where: { materialId: statement.materialId, description: statement.fields.description }, data: { description: next.description } })).count
        : (await db.explanationMaterial.updateMany({
            where: { materialId: statement.materialId, body: statement.fields.body, sideBody: statement.fields.sideBody ?? null },
            data: next,
          })).count;
    }
    log.push({ ...statement, fields: undefined, before: statement.fields, after: next, updated: updated === 1, failed });
    process.stderr.write(`\r${index + 1}/${statements.length} statements`);
  }
  process.stderr.write("\n");
  return log;
}

async function writeReport(name: string, report: unknown): Promise<string> {
  const out = option("--out") ?? ".";
  const json = JSON.stringify(report, null, 2);
  if (out === "-") {
    process.stdout.write(json + "\n");
    return "stdout";
  }
  const file = resolve(out, name);
  await writeFile(file, json);
  return file;
}

export async function main() {
  const applyChanges = process.argv.includes("--apply");
  const academySlug = option("--academy");
  const limit = option("--limit") === undefined ? undefined : Number(option("--limit"));
  if (limit !== undefined && !(Number.isSafeInteger(limit) && limit > 0)) throw new Error("--limit must be a positive whole number");
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  // Which database: the Supabase project ref (pooler user `postgres.<ref>`),
  // because dev and production share the regional pooler host name.
  const url = new URL(databaseUrl);
  const host = url.username.includes(".") ? `${url.username.split(".").pop()}@${url.hostname}` : url.hostname;
  if (applyChanges && option("--confirm-database") !== host)
    throw new Error(`--apply writes to ${host}. Repeat it with --confirm-database ${host} if that is intended.`);

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  try {
    const found = await statementsWithRemoteImages(db, academySlug);
    const statements = limit === undefined ? found : found.slice(0, limit);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (!applyChanges) {
      const report = await dryRun(statements);
      const where = await writeReport(`remote-images-dry-run-${stamp}.json`, { host, academySlug: academySlug ?? null, ...report });
      console.error(JSON.stringify({ host, statements: report.statements, pictures: report.pictures, byHost: report.byHost, broken: report.broken.length }, null, 2));
      console.error(`Full report: ${where}`);
      return;
    }
    const assets = new ManualAssetsService(new ConfigService(process.env) as never, db as unknown as PrismaService);
    const log = await apply(db, assets, statements);
    const where = await writeReport(`remote-images-apply-${stamp}.json`, { host, academySlug: academySlug ?? null, log });
    const failed = log.reduce((total, row) => total + (row.failed as string[]).length, 0);
    console.error(`Rewrote ${log.filter((row) => row.updated).length} of ${log.length} statements (${found.length - statements.length} left for a later run); ${failed} pictures could not be copied. Log: ${where}`);
  } finally {
    await db.$disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
