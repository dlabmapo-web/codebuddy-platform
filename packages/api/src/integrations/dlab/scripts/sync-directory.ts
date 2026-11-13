import { readFile, writeFile } from "node:fs/promises";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";
import { z } from "zod";
import type { ApiEnvironment } from "../../../config/env.schema.js";
import { PrismaService } from "../../../database/prisma.service.js";
import { SupabaseAuthService } from "../../../auth/supabase-auth.service.js";
import {
  DlabDirectoryCatchup,
  type DirectoryPlan,
} from "../dlab-directory-catchup.js";
import { DlabDirectoryService } from "../dlab-directory.service.js";
import { DlabStateService } from "../dlab-state.service.js";
import { DlabSourceService } from "../dlab-source.service.js";
import { DlabReconcilerService } from "../dlab-reconciler.service.js";
import { DlabCampusProvisioner } from "../dlab-campus-provisioner.js";
import { DlabError } from "../dlab-error.js";

// No dotenv auto-loading. Target selection must be explicit for both modes.
const [mode, actorId, file, ...options] = process.argv.slice(2);
if (
  !["plan", "apply"].includes(mode ?? "") ||
  !z.uuid().safeParse(actorId).success ||
  !file ||
  options.some((x) => !/^--(campus|user|batch-size)=/.test(x))
)
  throw new Error(
    "Usage: sync-directory plan|apply <platform-admin-uuid> <private-plan.json> [--campus=id] [--user=id] [--batch-size=100]",
  );
for (const env of [
  "DATABASE_URL",
  "SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "DLAB_DIRECTORY_TARGET",
])
  if (!process.env[env])
    throw new Error(`Export ${env} explicitly; no target is inferred`);
if (mode === "apply" && options.length)
  throw new Error("Apply uses the reviewed plan filters");
const database = new URL(process.env.DATABASE_URL!),
  provider = new URL(process.env.SUPABASE_URL!);
const target = JSON.stringify({
  label: process.env.DLAB_DIRECTORY_TARGET,
  databaseHost: database.host,
  databaseName: database.pathname,
  providerOrigin: provider.origin,
});
const redisUrl = process.env.MONITORING_REDIS_URL ?? process.env.REDIS_URL;
if (mode === "apply" && !redisUrl)
  throw new Error("Apply requires explicit Redis");
const config = new ConfigService({
  ...process.env,
  DLAB_SSO_ENABLED: process.env.DLAB_SSO_ENABLED === "true",
  DLAB_DIRECTORY_SYNC_ENABLED:
    process.env.DLAB_DIRECTORY_SYNC_ENABLED === "true",
  DLAB_AUTO_PROVISION_CAMPUSES:
    process.env.DLAB_AUTO_PROVISION_CAMPUSES === "true",
  DLAB_SSO_ROLLOUT_MODE: process.env.DLAB_SSO_ROLLOUT_MODE ?? "allowlist",
}) as unknown as ConfigService<ApiEnvironment, true>;
const db = new PrismaService(config),
  redis =
    mode === "apply" ? new Redis(redisUrl!, { maxRetriesPerRequest: 2 }) : null;
const state = new DlabStateService(redis),
  reconciler = new DlabReconcilerService(config);
const source = new DlabSourceService(
  db,
  state,
  reconciler,
  undefined,
  new DlabCampusProvisioner(config),
);
const directory = new DlabDirectoryService(
  config,
  db,
  state,
  source,
  new SupabaseAuthService(config),
  reconciler,
);
const operator = new DlabDirectoryCatchup(
  db,
  config,
  directory,
  state,
  source,
  reconciler,
);
try {
  if (mode === "plan") {
    const option = (key: string) =>
      options
        .find((x) => x.startsWith(`--${key}=`))
        ?.split("=")
        .slice(1)
        .join("=");
    const batchSize = Number(option("batch-size") ?? 100);
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
      throw new Error("Batch size must be 1..100");
    const plan = await operator.preview(actorId!, target, {
      campus: option("campus"),
      user: option("user"),
      batchSize,
    });
    await writeFile(file!, JSON.stringify(plan, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        mode: "plan",
        digest: plan.digest,
        total: plan.entries.length,
        counts: plan.entries.reduce<Record<string, number>>((a, e) => {
          a[e.action] = (a[e.action] ?? 0) + 1;
          return a;
        }, {}),
      }),
    );
  } else {
    const plan = JSON.parse(await readFile(file!, "utf8")) as DirectoryPlan;
    if (plan.actorId !== actorId) throw new DlabError("plan_changed", 409);
    const result = await operator.apply(plan, target);
    console.log(JSON.stringify(result));
    if (result.failed) process.exitCode = 1;
  }
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      reason: error instanceof DlabError ? error.reason : "operator_failed",
    }),
  );
  process.exitCode = 1;
} finally {
  await redis?.quit();
  await db.$disconnect();
}
