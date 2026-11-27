import { readFile, writeFile } from "node:fs/promises";
import { ConfigService } from "@nestjs/config";
import type { ApiEnvironment } from "../../../config/env.schema.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { DlabError } from "../dlab-error.js";
import {
  applyStudentRecovery,
  previewStudentRecovery,
  studentRecoveryInput,
  studentRecoveryPlan,
} from "../dlab-student-recovery.js";
import { z } from "zod";

const [mode, file, actorOrDigest, inputFile] = process.argv.slice(2);
const databaseUrl = process.env.DATABASE_URL;
const label = process.env.DLAB_RECOVERY_TARGET;
if (!databaseUrl || !label) throw new Error("Export DATABASE_URL and DLAB_RECOVERY_TARGET explicitly");
if (!file || !actorOrDigest || (mode !== "plan" && mode !== "apply") || (mode === "plan" && !inputFile))
  throw new Error("Usage: recover-student plan <private-plan.json> <active-admin-uuid> <input.json> or apply <private-plan.json> <reviewed-digest>");
const dbUrl = new URL(databaseUrl);
const target = JSON.stringify({ label, databaseHost: dbUrl.host, databaseName: dbUrl.pathname });
const config = new ConfigService({ DATABASE_URL: databaseUrl }) as ConfigService<ApiEnvironment, true>;
const db = new PrismaService(config);
try {
  if (mode === "plan") {
    const input = studentRecoveryInput.parse(JSON.parse(await readFile(inputFile!, "utf8")));
    const plan = await previewStudentRecovery(db, z.uuid().parse(actorOrDigest), target, input);
    await writeFile(file, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ mode, digest: plan.digest, classes: plan.input.classIds.length }));
  } else {
    const plan = studentRecoveryPlan.parse(JSON.parse(await readFile(file, "utf8")));
    const result = await applyStudentRecovery(db, target, plan, actorOrDigest);
    console.log(JSON.stringify({ mode, ...result, enrollmentMetadata: "unknown" }));
  }
} catch (error) {
  console.error(error instanceof DlabError ? error.getResponse() : "Student recovery failed");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
