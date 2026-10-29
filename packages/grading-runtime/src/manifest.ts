import { open } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  runtimeManifestSchema,
  runtimeDescriptorIdentity,
  type RuntimeManifest,
  type RuntimeDescriptor,
} from "@cove/shared";
import { BrokerError, invariant } from "./errors.js";
export async function loadManifest(path: string): Promise<RuntimeManifest> {
  invariant(isAbsolute(path), "Manifest path must be absolute");
  const f = await open(path, "r");
  try {
    const stat = await f.stat();
    invariant(
      stat.isFile() && stat.size <= 16 * 1024 * 1024,
      "Invalid manifest file",
    );
    const bytes = Buffer.alloc(16 * 1024 * 1024 + 1);
    let n = 0;
    while (n < bytes.length) {
      const r = await f.read(bytes, n, bytes.length - n, null);
      if (!r.bytesRead) break;
      n += r.bytesRead;
    }
    invariant(n <= 16 * 1024 * 1024, "Manifest exceeds bound");
    return freeze(
      runtimeManifestSchema.parse(
        JSON.parse(bytes.subarray(0, n).toString("utf8")),
      ),
    );
  } finally {
    await f.close();
  }
}
export function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
export function registered(
  manifest: RuntimeManifest,
  r: RuntimeDescriptor,
): RuntimeDescriptor {
  const identity = runtimeDescriptorIdentity(r);
  const found = manifest.capabilities.runtimes.find(
    (v) => runtimeDescriptorIdentity(v) === identity,
  );
  if (!found)
    throw new BrokerError(
      "IDENTITY_MISMATCH",
      "Unregistered complete runtime identity",
    );
  return found;
}
