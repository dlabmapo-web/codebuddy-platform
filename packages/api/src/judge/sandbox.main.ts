import {
  readSandboxConfig,
  SandboxNotIsolatedError,
  startSandbox,
} from "./sandbox-server.js";

/**
 * The sandbox container's entry point. See `sandbox-server.ts` for what it is
 * and why it is a process of its own.
 *
 * Deliberately loads no `.env` and no configuration schema shared with the
 * judge: nothing the judge knows belongs in this process.
 */
async function bootstrap(): Promise<void> {
  const config = readSandboxConfig(process.env);
  const sandbox = await startSandbox(config);
  process.stdout.write(
    `sandbox ready on ${config.socketPath} (${sandbox.version}, isolated: ${sandbox.isolated})\n`,
  );

  let stopping = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await sandbox.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop());
  process.on("SIGINT", () => void stop());
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  // 78 (EX_CONFIG) for a sandbox that is not one; anything else is a crash.
  process.exit(error instanceof SandboxNotIsolatedError ? 78 : 70);
});
