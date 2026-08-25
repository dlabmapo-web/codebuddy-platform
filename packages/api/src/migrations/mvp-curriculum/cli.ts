import "dotenv/config";

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { buildMigrationPlan, checksum, migrationCounts } from "./core.js";
import { extractSourceSnapshot } from "./source.js";
import { TargetDatabase } from "./target.js";
import {
  MIGRATION_VERSION,
  SOURCE_PROJECT_REF,
  TARGET_ACADEMY_SLUG,
  TARGET_PROJECT_REF,
  type ApplyCourseResult,
  type ApplyReport,
  type DryRunReport,
  type MigrationPlan,
} from "./types.js";

type Mode = "inspect" | "dry-run" | "apply" | "verify" | "rollback";

const environmentSchema = z.object({
  MVP_MIGRATION_SOURCE_URL: z.string().url().optional(),
  MVP_MIGRATION_SOURCE_KEY: z.string().min(1).optional(),
  MVP_MIGRATION_TARGET_DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
  MVP_MIGRATION_ACTOR_USER_ID: z.string().uuid().optional(),
  MVP_MIGRATION_ARTIFACT_DIR: z.string().min(1).default(".migration-artifacts/mvp-curriculum"),
});

interface Arguments {
  mode: Mode;
  plan?: string;
  report?: string;
  fingerprint?: string;
  backupConfirmedAt?: string;
  backupReference?: string;
  confirmProject?: string;
  confirmAcademy?: string;
  confirmRollback?: boolean;
}

export function parseArguments(argv: string[]): Arguments {
  const allowedValues = new Set(["mode", "plan", "report", "fingerprint", "backup-confirmed-at", "backup-reference", "confirm-project", "confirm-academy"]);
  const allowedFlags = new Set(["confirm-rollback"]);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let separatorSeen = false;
  for (const argument of argv) {
    if (argument === "--") {
      if (separatorSeen) throw new Error("The command-line separator may appear only once.");
      separatorSeen = true;
      continue;
    }
    if (!argument.startsWith("--")) throw new Error(`Unknown positional argument: ${argument}`);
    const [key, ...rest] = argument.slice(2).split("=");
    if (rest.length) {
      if (!allowedValues.has(key!)) throw new Error(`Unknown argument: --${key}`);
      values.set(key!, rest.join("="));
    } else {
      if (!allowedFlags.has(key!)) throw new Error(`Unknown flag: --${key}`);
      flags.add(key!);
    }
  }
  const mode = values.get("mode") as Mode | undefined;
  if (!mode || !["inspect", "dry-run", "apply", "verify", "rollback"].includes(mode)) {
    throw new Error("An explicit --mode=inspect|dry-run|apply|verify|rollback is required. No default mode exists.");
  }
  return {
    mode, plan: values.get("plan"), report: values.get("report"), fingerprint: values.get("fingerprint"),
    backupConfirmedAt: values.get("backup-confirmed-at"), backupReference: values.get("backup-reference"),
    confirmProject: values.get("confirm-project"), confirmAcademy: values.get("confirm-academy"),
    confirmRollback: flags.has("confirm-rollback"),
  };
}

function sourceEnvironment(environment: z.infer<typeof environmentSchema>): { sourceUrl: string; sourceKey: string } {
  if (!environment.MVP_MIGRATION_SOURCE_URL || !environment.MVP_MIGRATION_SOURCE_KEY) {
    throw new Error("Inspect and dry-run require MVP_MIGRATION_SOURCE_URL and MVP_MIGRATION_SOURCE_KEY.");
  }
  return { sourceUrl: environment.MVP_MIGRATION_SOURCE_URL, sourceKey: environment.MVP_MIGRATION_SOURCE_KEY };
}

function selectActor(eligible: Array<{ userId: string; email: string }>, selected?: string): string {
  if (selected) {
    if (!eligible.some((actor) => actor.userId === selected)) throw new Error("Configured actor is not an eligible active TEAM_LEAD.");
    return selected;
  }
  if (eligible.length !== 1) {
    const choices = eligible.map(({ userId, email }) => `${userId} (${email})`).join(", ") || "none";
    throw new Error(`Expected one active TEAM_LEAD or MVP_MIGRATION_ACTOR_USER_ID. Eligible actors: ${choices}`);
  }
  return eligible[0]!.userId;
}

async function secureWrite(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

async function prepareArtifactDirectory(path: string): Promise<string> {
  const absolute = resolve(path);
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  await chmod(absolute, 0o700);
  return absolute;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

function assertPlan(plan: MigrationPlan, expectedFingerprint?: string): void {
  if (plan.format !== "cove-mvp-curriculum-plan" || plan.version !== MIGRATION_VERSION) throw new Error("Unsupported migration plan format.");
  if (plan.sourceProjectRef !== SOURCE_PROJECT_REF || plan.targetProjectRef !== TARGET_PROJECT_REF || plan.targetAcademySlug !== TARGET_ACADEMY_SLUG) throw new Error("Migration plan points at an unapproved project or academy.");
  const { fingerprint, ...unsigned } = plan;
  if (checksum(unsigned) !== fingerprint) throw new Error("Migration plan fingerprint is invalid; the plan may have been edited.");
  if (expectedFingerprint && fingerprint !== expectedFingerprint) throw new Error("Provided fingerprint does not match the approved dry-run plan.");
  if (plan.issues.some((issue) => issue.severity === "error")) throw new Error("Migration plan contains validation errors.");
}

function requireWriteConfirmation(args: Arguments): void {
  if (args.confirmProject !== TARGET_PROJECT_REF || args.confirmAcademy !== TARGET_ACADEMY_SLUG) {
    throw new Error(`Write mode requires --confirm-project=${TARGET_PROJECT_REF} and --confirm-academy=${TARGET_ACADEMY_SLUG}.`);
  }
}

function timestampName(date = new Date()): string { return date.toISOString().replaceAll(":", "-").replaceAll(".", "-"); }

async function inspect(target: TargetDatabase, environment: z.infer<typeof environmentSchema>): Promise<void> {
  const source = sourceEnvironment(environment);
  const [context, snapshot] = await Promise.all([
    target.inspect(environment.MVP_MIGRATION_ACTOR_USER_ID),
    extractSourceSnapshot(source),
  ]);
  console.log(JSON.stringify({
    mode: "inspect", sourceProjectRef: SOURCE_PROJECT_REF, targetProjectRef: TARGET_PROJECT_REF,
    targetAcademy: { id: context.academyId, slug: TARGET_ACADEMY_SLUG, name: context.academyName },
    eligibleActors: context.eligibleActors,
    sourceCounts: {
      subjects: snapshot.subjects.length, stages: snapshot.stages.length, chapters: snapshot.chapters.length,
      problems: snapshot.problems.length, testCases: snapshot.testCases.length, hints: snapshot.hints.length,
    },
  }, null, 2));
}

async function dryRun(target: TargetDatabase, environment: z.infer<typeof environmentSchema>, artifactDirectory: string): Promise<void> {
  const source = sourceEnvironment(environment);
  const context = await target.inspect(environment.MVP_MIGRATION_ACTOR_USER_ID);
  const actorUserId = selectActor(context.eligibleActors, environment.MVP_MIGRATION_ACTOR_USER_ID);
  const snapshot = await extractSourceSnapshot(source);
  const plan = buildMigrationPlan({ snapshot, targetAcademyId: context.academyId, actorUserId });
  if (!plan.issues.some((issue) => issue.severity === "error")) {
    try { await target.assertNoCollisions(plan); }
    catch (caught) { plan.issues.push({ severity: "error", code: "TARGET_COLLISION", message: caught instanceof Error ? caught.message : "Target collision validation failed." }); }
  }
  // Collision validation can change the issue list, so sign only the final plan.
  const { fingerprint: _oldFingerprint, ...unsigned } = plan;
  plan.fingerprint = checksum(unsigned);
  const stamp = timestampName();
  const snapshotPath = resolve(artifactDirectory, `${stamp}-source-snapshot.json`);
  const planPath = resolve(artifactDirectory, `${stamp}-plan.json`);
  const reportPath = resolve(artifactDirectory, `${stamp}-dry-run-report.json`);
  await secureWrite(snapshotPath, snapshot);
  await secureWrite(planPath, plan);
  const report: DryRunReport = {
    format: "cove-mvp-curriculum-dry-run", version: MIGRATION_VERSION, generatedAt: new Date().toISOString(),
    fingerprint: plan.fingerprint, sourceProjectRef: SOURCE_PROJECT_REF, targetProjectRef: TARGET_PROJECT_REF,
    targetAcademySlug: TARGET_ACADEMY_SLUG, targetAcademyId: plan.targetAcademyId,
    actorUserId, sourceSnapshotChecksum: plan.sourceSnapshotChecksum,
    counts: migrationCounts(plan.courses), issues: plan.issues,
    successful: !plan.issues.some((issue) => issue.severity === "error"), sensitivePlanPath: planPath,
  };
  await secureWrite(reportPath, report);
  console.log(JSON.stringify({ ...report, sensitivePlanPath: planPath, sensitiveSnapshotPath: snapshotPath, reportPath }, null, 2));
  if (!report.successful) process.exitCode = 1;
}

async function apply(target: TargetDatabase, args: Arguments, artifactDirectory: string): Promise<void> {
  requireWriteConfirmation(args);
  if (!args.plan || !args.report || !args.fingerprint) throw new Error("Apply requires --plan, its successful dry-run --report, and the exact --fingerprint from dry-run.");
  if (!args.backupConfirmedAt || !args.backupReference) throw new Error("Apply requires --backup-confirmed-at and --backup-reference.");
  if (Number.isNaN(Date.parse(args.backupConfirmedAt))) throw new Error("--backup-confirmed-at must be an ISO timestamp.");
  const [plan, dryRunReport] = await Promise.all([
    readJson<MigrationPlan>(args.plan),
    readJson<DryRunReport>(args.report),
  ]);
  assertPlan(plan, args.fingerprint);
  if (
    dryRunReport.format !== "cove-mvp-curriculum-dry-run" ||
    dryRunReport.version !== MIGRATION_VERSION ||
    !dryRunReport.successful ||
    dryRunReport.fingerprint !== plan.fingerprint ||
    dryRunReport.targetAcademyId !== plan.targetAcademyId ||
    dryRunReport.actorUserId !== plan.actorUserId
  ) {
    throw new Error("The supplied dry-run report is not successful or does not authorize this exact plan.");
  }
  await target.assertNoCollisions(plan);
  const courseResults: ApplyCourseResult[] = [];
  for (const course of plan.courses) {
    try { courseResults.push(await target.applyCourse(course, plan)); }
    catch (caught) {
      courseResults.push({
        courseId: course.id, sourceId: course.sourceId, status: "failed", fingerprint: course.fingerprint,
        insertedIds: { subjects: [], stages: [], chapters: [], problems: [], test_cases: [], problem_hints: [], materials: [] },
        error: caught instanceof Error ? caught.message : "Unknown course transaction failure",
      });
    }
  }
  const unsigned = {
    format: "cove-mvp-curriculum-apply" as const, version: MIGRATION_VERSION, generatedAt: new Date().toISOString(),
    planFingerprint: plan.fingerprint, sourceSnapshotChecksum: plan.sourceSnapshotChecksum,
    targetProjectRef: TARGET_PROJECT_REF, targetAcademySlug: TARGET_ACADEMY_SLUG,
    targetAcademyId: plan.targetAcademyId, actorUserId: plan.actorUserId,
    backup: { confirmedAt: args.backupConfirmedAt, reference: args.backupReference },
    courses: courseResults, successful: courseResults.every((course) => course.status !== "failed"),
  };
  const report: ApplyReport = { ...unsigned, fingerprint: checksum(unsigned) };
  const path = resolve(artifactDirectory, `${timestampName()}-apply-report.json`);
  await secureWrite(path, report);
  console.log(JSON.stringify({ ...report, reportPath: path }, null, 2));
  if (!report.successful) process.exitCode = 1;
}

async function verify(target: TargetDatabase, args: Arguments, artifactDirectory: string): Promise<void> {
  if (!args.plan) throw new Error("Verify requires --plan.");
  const plan = await readJson<MigrationPlan>(args.plan);
  assertPlan(plan, args.fingerprint);
  await target.revalidatePlanContext(plan);
  const courses = await target.verify(plan);
  const report = {
    format: "cove-mvp-curriculum-verify", version: MIGRATION_VERSION, generatedAt: new Date().toISOString(),
    planFingerprint: plan.fingerprint, counts: migrationCounts(plan.courses), courses,
    successful: courses.every((course) => course.mismatches.length === 0),
  };
  const path = resolve(artifactDirectory, `${timestampName()}-verify-report.json`);
  await secureWrite(path, { ...report, fingerprint: checksum(report) });
  console.log(JSON.stringify({ ...report, reportPath: path }, null, 2));
  if (!report.successful) process.exitCode = 1;
}

async function rollback(target: TargetDatabase, args: Arguments, artifactDirectory: string): Promise<void> {
  requireWriteConfirmation(args);
  if (!args.confirmRollback || !args.plan || !args.report || !args.fingerprint) throw new Error("Rollback requires --confirm-rollback, --plan, --report, and the apply report --fingerprint.");
  const [plan, report] = await Promise.all([readJson<MigrationPlan>(args.plan), readJson<ApplyReport>(args.report)]);
  assertPlan(plan);
  const { fingerprint, ...unsignedReport } = report;
  if (report.format !== "cove-mvp-curriculum-apply" || checksum(unsignedReport) !== fingerprint || fingerprint !== args.fingerprint) throw new Error("Apply report fingerprint is invalid or does not match.");
  if (!report.successful || report.planFingerprint !== plan.fingerprint) throw new Error("Rollback requires a successful apply report for this exact plan.");
  const inserted = new Set(report.courses.filter((course) => course.status === "inserted").map((course) => course.courseId));
  const rolledBack: string[] = [];
  for (const course of [...plan.courses].reverse()) if (inserted.has(course.id)) {
    await target.rollbackCourse(course, plan.targetAcademyId, plan.actorUserId);
    rolledBack.push(course.id);
  }
  const rollbackReport = { format: "cove-mvp-curriculum-rollback", version: MIGRATION_VERSION, generatedAt: new Date().toISOString(), applyReportFingerprint: report.fingerprint, rolledBack, successful: true };
  const path = resolve(artifactDirectory, `${timestampName()}-rollback-report.json`);
  await secureWrite(path, { ...rollbackReport, fingerprint: checksum(rollbackReport) });
  console.log(JSON.stringify({ ...rollbackReport, reportPath: path }, null, 2));
}

export async function run(argv = process.argv.slice(2), rawEnvironment = process.env): Promise<void> {
  const args = parseArguments(argv);
  const environment = environmentSchema.parse(rawEnvironment);
  const artifactDirectory = await prepareArtifactDirectory(environment.MVP_MIGRATION_ARTIFACT_DIR);
  const target = new TargetDatabase(environment.MVP_MIGRATION_TARGET_DATABASE_URL);
  try {
    if (args.mode === "inspect") await inspect(target, environment);
    else if (args.mode === "dry-run") await dryRun(target, environment, artifactDirectory);
    else if (args.mode === "apply") await apply(target, args, artifactDirectory);
    else if (args.mode === "verify") await verify(target, args, artifactDirectory);
    else await rollback(target, args, artifactDirectory);
  } finally { await target.close(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((caught) => {
    console.error(caught instanceof Error ? caught.message : "Migration command failed.");
    process.exitCode = 1;
  });
}
