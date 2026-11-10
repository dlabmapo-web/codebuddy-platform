import { createHash, randomUUID } from "node:crypto";
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NativeInfrastructureError } from "./contract.js";

/** The largest binary one compile may produce, matching the jail's file-size limit. */
export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
/** Diagnostics are files too, so the tmpfs size bounds everything cached. */
export const MAX_DIAGNOSTIC_BYTES = 16 * 1024;
/** Index entries: keys, sizes and leases only, about 1 MiB at this bound. */
export const MAX_INDEX_ENTRIES = 4096;

/** No space can be freed without evicting a leased artifact: the caller retries. */
export class ArtifactStoreBusyError extends NativeInfrastructureError {}
/** A run whose lease is unknown or expired: refused without starting a jail. */
export class ArtifactLeaseError extends NativeInfrastructureError {}

type Entry = {
  key: string;
  /** Content digest of the binary, or null for a compile error. */
  artifact: string | null;
  diagnosticsFile: string;
  diagnosticsBytes: number;
  leases: Set<string>;
};
type Lease = { entry: Entry; expiresAt: number };

/**
 * The native-gcc cache of compiled programs and compile errors, on its own
 * executable tmpfs. Keyed by `sha256(GCC identity, language, source)`, so the
 * same source compiles once however many attempts and cases use it.
 *
 * Binaries are named by their content digest and shared between entries that
 * produced the same bytes; a file is removed with the last entry that uses it.
 * An attempt's lease keeps its entry, and so its binary, from eviction until
 * the attempt releases it or the lease expires. Eviction is least-recently
 * used, by bytes, and only ever among entries no live lease holds. Space for a
 * new compile is reserved before the compiler runs, so a finished compile
 * always fits.
 */
export class ArtifactStore {
  private readonly entries = new Map<string, Entry>();
  private readonly leases = new Map<string, Lease>();
  /** Bytes per binary file and how many entries share it. */
  private readonly binaries = new Map<string, { bytes: number; users: number }>();
  private usedBytes = 0;
  private reservedBytes = 0;
  constructor(
    private readonly options: {
      root: string;
      capacityBytes: number;
      maxEntries?: number;
      now?: () => number;
    },
  ) {}
  private now() {
    return this.options.now?.() ?? performance.now();
  }
  /** Bytes held by files plus space promised to compiles in progress. */
  get committedBytes() {
    return this.usedBytes + this.reservedBytes;
  }
  get size() {
    return this.entries.size;
  }
  private expire() {
    const now = this.now();
    for (const [id, lease] of this.leases)
      if (lease.expiresAt <= now) {
        this.leases.delete(id);
        lease.entry.leases.delete(id);
      }
  }
  /** A cached result for this key, refreshed as most recently used. */
  lookup(key: string): { artifact: string | null; diagnostics: string } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return {
      artifact: entry.artifact,
      diagnostics: readFileSync(entry.diagnosticsFile, "utf8"),
    };
  }
  /** Leases a compiled entry for one attempt. */
  lease(key: string, durationMs: number): string {
    this.expire();
    const entry = this.entries.get(key);
    if (!entry?.artifact) throw new NativeInfrastructureError("No compiled artifact to lease");
    const id = randomUUID();
    entry.leases.add(id);
    this.leases.set(id, { entry, expiresAt: this.now() + durationMs });
    return id;
  }
  /** The binary a live lease holds, or undefined for an unknown or expired one. */
  resolve(artifact: string, lease: string): string | undefined {
    this.expire();
    const held = this.leases.get(lease);
    if (!held || held.entry.artifact !== artifact) return undefined;
    return this.binaryPath(artifact);
  }
  release(lease: string) {
    const held = this.leases.get(lease);
    if (!held) return;
    this.leases.delete(lease);
    held.entry.leases.delete(lease);
  }
  /**
   * Reserves room for one compile's binary and diagnostics, evicting unleased
   * entries as needed. Busy when only leased entries remain to evict.
   */
  reserve(): { release(): void } {
    const bytes = MAX_ARTIFACT_BYTES + MAX_DIAGNOSTIC_BYTES;
    this.expire();
    this.makeRoom(bytes, 1);
    this.reservedBytes += bytes;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.reservedBytes -= bytes;
      },
    };
  }
  private makeRoom(bytes: number, entries: number) {
    const maxEntries = this.options.maxEntries ?? MAX_INDEX_ENTRIES;
    for (const [key, entry] of this.entries) {
      if (
        this.committedBytes + bytes <= this.options.capacityBytes &&
        this.entries.size + entries <= maxEntries
      )
        return;
      if (entry.leases.size === 0) this.evict(key, entry);
    }
    if (
      this.committedBytes + bytes > this.options.capacityBytes ||
      this.entries.size + entries > maxEntries
    )
      throw new ArtifactStoreBusyError("Artifact store is full of leased artifacts");
  }
  private evict(key: string, entry: Entry) {
    this.entries.delete(key);
    rmSync(entry.diagnosticsFile, { force: true });
    this.usedBytes -= entry.diagnosticsBytes;
    if (entry.artifact) {
      const binary = this.binaries.get(entry.artifact)!;
      if (--binary.users === 0) {
        this.binaries.delete(entry.artifact);
        rmSync(this.binaryPath(entry.artifact), { force: true });
        this.usedBytes -= binary.bytes;
      }
    }
  }
  private binaryPath(artifact: string) {
    return join(this.options.root, `bin-${artifact.slice("sha256:".length)}`);
  }
  /**
   * Records a finished compile under the reservation taken for it. A binary is
   * copied from staging (root-owned, 0555) and named by its content digest.
   */
  insert(
    key: string,
    reservation: { release(): void },
    result: { binary?: { path: string; bytes: Buffer }; diagnostics: string },
  ): string | null {
    try {
      const diagnostics = Buffer.from(result.diagnostics, "utf8");
      if (diagnostics.length > MAX_DIAGNOSTIC_BYTES)
        throw new NativeInfrastructureError("Diagnostics exceed their bound");
      // Two attempts compiled the same source at once: the first entry, which
      // may already be leased, stands. The second compile's bytes are the same.
      const existing = this.entries.get(key);
      if (existing) return existing.artifact;
      let artifact: string | null = null;
      if (result.binary) {
        if (result.binary.bytes.length > MAX_ARTIFACT_BYTES)
          throw new NativeInfrastructureError("Artifact exceeds its bound");
        artifact = `sha256:${createHash("sha256").update(result.binary.bytes).digest("hex")}`;
        const shared = this.binaries.get(artifact);
        if (shared) shared.users++;
        else {
          const destination = this.binaryPath(artifact);
          const partial = `${destination}.${randomUUID()}.partial`;
          writeFileSync(partial, result.binary.bytes, { mode: 0o555, flag: "wx" });
          chmodSync(partial, 0o555);
          renameSync(partial, destination);
          this.binaries.set(artifact, { bytes: result.binary.bytes.length, users: 1 });
          this.usedBytes += result.binary.bytes.length;
        }
      }
      const diagnosticsFile = join(this.options.root, `diag-${createHash("sha256").update(key).digest("hex")}`);
      writeFileSync(diagnosticsFile, diagnostics, { mode: 0o400 });
      this.usedBytes += diagnostics.length;
      this.entries.set(key, {
        key,
        artifact,
        diagnosticsFile,
        diagnosticsBytes: diagnostics.length,
        leases: new Set(),
      });
      return artifact;
    } finally {
      reservation.release();
    }
  }
  /** Removes every cached file; for service shutdown and test cleanup. */
  clear() {
    for (const [key, entry] of this.entries) this.evict(key, entry);
    this.leases.clear();
  }
}
