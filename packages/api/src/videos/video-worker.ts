import "dotenv/config";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { VideoStorage } from "./video-storage.js";
import { encodeVideo, InvalidVideo } from "./video-encoder.js";
import { mkdtemp, rm, statfs, readdir, stat } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHash, randomUUID } from "node:crypto";
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const storage = new VideoStorage(new ConfigService(process.env));
let draining = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    draining = true;
  });
async function processOne() {
  const now = new Date(),
    lease = randomUUID();
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      Array<{ asset_id: string }>
    >`SELECT asset_id FROM video_processing_jobs WHERE (status='PENDING' AND next_attempt_at<=now() OR status='RUNNING' AND lease_until<now()) ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows[0]) return null;
    return tx.videoProcessingJob.update({
      where: { assetId: rows[0].asset_id },
      data: {
        status: "RUNNING",
        leaseId: lease,
        leaseUntil: new Date(Date.now() + 120000),
        attempts: { increment: 1 },
      },
      include: { asset: true },
    });
  });
  if (!job) return false;
  let lost = false;
  const controller = new AbortController();
  const heartbeat = setInterval(() => {
    void db.videoProcessingJob
      .updateMany({
        where: { assetId: job.assetId, leaseId: lease, status: "RUNNING" },
        data: { leaseUntil: new Date(Date.now() + 120000) },
      })
      .then((r) => {
        if (!r.count) {
          lost = true;
          controller.abort();
        }
      })
      .catch(() => {
        lost = true;
        controller.abort();
      });
  }, 30000);
  heartbeat.unref();
  const dir = await mkdtemp(
    join(process.env.VIDEO_SCRATCH_DIR ?? tmpdir(), "cove-video-"),
  );
  const output = join(dir, "output");
  const source = join(dir, "source");
  const prefix = `encoded/${lease}/`;
  let uploaded: string[] = [];
  let capacityExceeded = false;
  let checkingCapacity = false;
  async function scratchBytes(path: string): Promise<number> {
    let bytes = 0;
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      bytes += entry.isDirectory()
        ? await scratchBytes(child)
        : (await stat(child)).size;
    }
    return bytes;
  }
  const capacityTimer = setInterval(() => {
    if (checkingCapacity) return;
    checkingCapacity = true;
    void scratchBytes(dir)
      .then((bytes) => {
        if (bytes > 40 * 1024 ** 3) {
          capacityExceeded = true;
          controller.abort();
        }
      })
      .catch(() => controller.abort())
      .finally(() => {
        checkingCapacity = false;
      });
  }, 2000);
  capacityTimer.unref();
  try {
    const disk = await statfs(dir);
    if (Number(disk.bavail) * Number(disk.bsize) < 40 * 1024 ** 3)
      throw new Error("TRANSIENT_SCRATCH_CAPACITY");
    const deadline = setTimeout(() => controller.abort(), 300000);
    try {
      const response = await storage.get(
        job.asset.objectKey,
        undefined,
        controller.signal,
      );
      if (!response.ok || !response.body)
        throw new Error("TRANSIENT_SOURCE_READ");
      let bytes = 0;
      const hash = createHash("sha256");
      await pipeline(
        Readable.fromWeb(response.body as never),
        new Transform({
          transform(chunk, _enc, cb) {
            bytes += chunk.length;
            if (BigInt(bytes) > job.asset.byteSize)
              return cb(new InvalidVideo("VIDEO_BYTE_LIMIT"));
            hash.update(chunk);
            cb(null, chunk);
          },
        }),
        createWriteStream(source),
      );
      if (BigInt(bytes) !== job.asset.byteSize)
        throw new InvalidVideo("VIDEO_BYTE_MISMATCH");
      await db.videoAsset.updateMany({
        where: { id: job.assetId, state: { in: ["VERIFYING", "PROCESSING"] } },
        data: { state: "PROCESSING", checksum: hash.digest("hex") },
      });
    } finally {
      clearTimeout(deadline);
    }
    const encoded = await encodeVideo(source, output, controller.signal);
    for (const file of encoded.files) {
      if (lost || (draining && Date.now() - now.getTime() > 86400000))
        throw new Error("TRANSIENT_LEASE_LOST");
      const relative = prefix + file.path,
        key = `${job.asset.academyId}/${job.assetId}/${relative}`;
      const mime = file.path.endsWith(".m3u8")
        ? "application/vnd.apple.mpegurl"
        : file.path.endsWith(".ts")
          ? "video/mp2t"
          : file.path.endsWith(".mp4")
            ? "video/mp4"
            : "image/jpeg";
      await storage.put(
        key,
        { path: join(output, file.path), size: file.size },
        mime,
      );
      uploaded.push(key);
    }
    await db.$transaction(async (tx) => {
      const owned = await tx.videoProcessingJob.updateMany({
        where: { assetId: job.assetId, leaseId: lease, status: "RUNNING" },
        data: { status: "DONE", leaseId: null, leaseUntil: null },
      });
      if (!owned.count) throw new Error("TRANSIENT_LEASE_LOST");
      const updated = await tx.videoAsset.updateMany({
        where: { id: job.assetId, state: "PROCESSING" },
        data: {
          state: "READY",
          durationMs: encoded.durationMs,
          processingVersion: "ffmpeg-h264-v1",
          processingMetadata: encoded.metadata,
          outputs: encoded.files.map((f) => prefix + f.path),
          renditions: encoded.renditions.map((r) => ({
            ...r,
            path: prefix + r.path,
          })) as Prisma.InputJsonValue,
          failureCode: null,
        },
      });
      if (!updated.count) throw new Error("TRANSIENT_LEASE_LOST");
    });
    uploaded = [];
  } catch (error) {
    const code = capacityExceeded
      ? "MEDIA_OUTPUT_LIMIT"
      : error instanceof InvalidVideo
        ? error.message
        : "TRANSIENT_PROCESSING_FAILED";
    await db.$transaction(async (tx) => {
      const owned = await tx.videoProcessingJob.updateMany({
        where: { assetId: job.assetId, leaseId: lease, status: "RUNNING" },
        data: {
          status:
            !(error instanceof InvalidVideo) && job.attempts < 3
              ? "PENDING"
              : "FAILED",
          leaseId: null,
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + job.attempts * 30000),
        },
      });
      if (owned.count)
        await tx.videoAsset.updateMany({
          where: {
            id: job.assetId,
            state: { in: ["VERIFYING", "PROCESSING"] },
          },
          data: {
            state:
              !(error instanceof InvalidVideo) && job.attempts < 3
                ? "VERIFYING"
                : "FAILED",
            failureCode: code,
          },
        });
    });
    console.warn(`Video processing ${job.assetId}: ${code}`);
  } finally {
    clearInterval(heartbeat);
    clearInterval(capacityTimer);
    if (uploaded.length) await storage.remove(uploaded).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
  return true;
}
async function cleanup() {
  const assets = await db.videoAsset.findMany({
    where: {
      state: { in: ["UPLOADING", "CANCELLED", "FAILED", "READY", "DELETING"] },
      createdAt: { lt: new Date(Date.now() - 86400000) },
      lessons: { none: {} },
      progress: { none: {} },
    },
    take: 20,
  });
  for (const a of assets) {
    const claim = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM video_assets WHERE id=${a.id}::uuid FOR UPDATE`;
      if (
        (await tx.videoLesson.count({ where: { assetId: a.id } })) ||
        (await tx.videoWatchProgress.count({ where: { assetId: a.id } }))
      )
        return false;
      await tx.videoAsset.update({
        where: { id: a.id },
        data: { state: "DELETING" },
      });
      await tx.videoProcessingJob.updateMany({
        where: { assetId: a.id },
        data: { status: "CANCELLED", leaseId: null },
      });
      return true;
    });
    if (claim) {
      await storage.removeAssetPrefix(a.academyId, a.id);
      await db.videoAsset.update({
        where: { id: a.id },
        data: { state: "DELETED" },
      });
    }
  }
}
async function main() {
  console.log("Video worker started; admission is separate from processing.");
  let lastCleanup = 0;
  try {
    while (!draining) {
      if (Date.now() - lastCleanup > 3600000) {
        await cleanup().catch(() => undefined);
        lastCleanup = Date.now();
      }
      if (
        process.env.VIDEO_PROCESSING_ENABLED === "true" &&
        (await processOne().catch(() => false))
      )
        continue;
      await new Promise((r) => setTimeout(r, 2000));
    }
  } finally {
    await db.$disconnect();
  }
}
void main();
