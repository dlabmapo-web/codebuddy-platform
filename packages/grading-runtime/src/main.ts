import { readFile } from "node:fs/promises";
import { z } from "zod";
import { nativeReleaseManifestSchema } from "@cove/shared";
import { NsJailBackend } from "./launcher.js";
import { NativeExecutionService } from "./service.js";
// One immutable startup file, never environment supplied by the learner.
const schema = z
  .object({
    socketPath: z.string(),
    manifest: nativeReleaseManifestSchema,
    nsjailPath: z.string(),
    rootfsPath: z.string(),
    policyPath: z.string(),
    cgroupRoot: z.string(),
    workRoot: z.string(),
    standbyPerSlot: z.number().int().min(0).max(16).optional(),
    gcc: z
      .object({
        rootPath: z.string(),
        runRootPath: z.string(),
        compilePolicyPath: z.string(),
        runPolicyPath: z.string(),
        artifactPath: z.string(),
        stagingPath: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
const path = process.argv[2];
if (!path)
  throw new Error("Usage: node dist/main.js /absolute/path/to/config.json");
const config = schema.parse(JSON.parse(await readFile(path, "utf8")));
const backend = new NsJailBackend(config);
const service = new NativeExecutionService({ ...config, backend });
await service.listen();
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await service.close();
};
process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());
