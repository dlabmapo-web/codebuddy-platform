import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeDescriptorSchema } from "@cove/shared";
import { Broker, type WarmProfile } from "./broker.js";
import { Journal } from "./journal.js";
import { RootlessDriver } from "./rootless-driver.js";
import { loadManifest } from "./manifest.js";
import { writeObservations } from "./observations.js";
import { serve } from "./server.js";
import { invariant } from "./errors.js";
function required(name: string) {
  const value = process.env[name];
  invariant(value && value.length <= 4096, `Missing ${name}`);
  return value;
}
export async function main() {
  const observationPath = required("GRADING_OBSERVATIONS_PATH");
  const manifest = await loadManifest(
    required("GRADING_RUNTIME_MANIFEST_PATH"),
  );
  const raw = await readFile(required("GRADING_WARM_PROFILES_PATH"), "utf8");
  invariant(Buffer.byteLength(raw) <= 65536, "Warm profiles too large");
  const profiles = JSON.parse(raw);
  invariant(
    Array.isArray(profiles) && profiles.length <= 2,
    "Invalid warm profiles",
  );
  const warmProfiles: WarmProfile[] = profiles.map((p) => ({
    runtime: runtimeDescriptorSchema.parse(p.runtime),
    memoryLimitMb: p.memoryLimitMb,
    targetReady: p.targetReady,
  }));
  const driver = new RootlessDriver({
    socket: required("GRADING_DAEMON_SOCKET"),
    parent: required("GRADING_CGROUP_PARENT"),
    systemdParent: required("GRADING_SYSTEMD_PARENT"),
    daemonPidFile: required("GRADING_DAEMON_PID_FILE"),
    daemonId: required("GRADING_DAEMON_ID"),
    daemonDataRoot: required("GRADING_DAEMON_DATA_ROOT"),
    owner: required("GRADING_BROKER_OWNER"),
    seccompPath: resolve(
      fileURLToPath(new URL("../guest/seccomp.json", import.meta.url)),
    ),
    runtimes: manifest.capabilities.runtimes,
  });
  const broker = new Broker(
    manifest,
    driver,
    new Journal(required("GRADING_JOURNAL_DIRECTORY")),
    required("GRADING_WORKER_GENERATION"),
    warmProfiles,
  );
  // Claim the sole control socket before any discovery/removal on the daemon.
  const server = await serve(required("JUDGE_SANDBOX_SOCKET"), (request) =>
    broker.handle(request),
  );
  try {
    await broker.start();
  } catch (e) {
    server.close();
    await broker.stop().catch(() => {});
    throw e;
  }
  let observing = false;
  const observe = async () => {
    if (observing) return;
    observing = true;
    try { await writeObservations(broker, required("GRADING_CGROUP_PARENT"), observationPath); }
    catch { console.error("Grading observations unavailable"); }
    finally { observing = false; }
  };
  await observe();
  const observationTimer = setInterval(() => void observe(), 1000);
  observationTimer.unref();
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(observationTimer);
    server.close();
    try {
      await broker.stop();
      process.exitCode = 0;
    } catch {
      process.exitCode = 1;
    }
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  void main().catch(() => {
    console.error("Grading broker startup failed closed");
    process.exitCode = 1;
  });
