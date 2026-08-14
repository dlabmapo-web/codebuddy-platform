import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { PrismaService } from "../database/prisma.service.js";
import { ProfileMediaService } from "./profile-media.service.js";

/**
 * The grace period from design §10.4.
 *
 * Long enough that a transient failure — a storage timeout between the upload
 * and the database write, a rolled-back transaction — stays recoverable by
 * hand. Short enough that a replaced photo does not linger for a week.
 */
const gracePeriodMs = 24 * 60 * 60 * 1_000;
const sweepIntervalMs = 60 * 60 * 1_000;
/** Bounded so one sweep cannot hold the storage API for minutes. */
const batchSize = 100;

/**
 * Deletes superseded and orphaned profile images.
 *
 * Two categories, one rule: an object nothing points at, older than the grace
 * period, is deleted. The sweep is idempotent — it only ever removes rows it
 * has just successfully deleted from storage — so a crash mid-batch costs one
 * repeated delete call and nothing else.
 *
 * A plain interval rather than a scheduler dependency: this is one job with no
 * cron expression to express, and the API already owns its own lifecycle.
 */
@Injectable()
export class ProfileImageCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileImageCleanupService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep().catch((error: unknown) => {
        this.logger.warn(`profile image sweep failed: ${String(error)}`);
      });
    }, sweepIntervalMs);
    // Never the reason a process stays alive; a deploy must not wait an hour.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Public so an operator or a test can run one pass directly. */
  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - gracePeriodMs);
    const expired = await this.prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        // Two shapes of garbage: a photo that was replaced, and an upload that
        // never became attached to anything because its transaction failed.
        OR: [
          { supersededAt: { lt: cutoff } },
          {
            supersededAt: null,
            createdAt: { lt: cutoff },
            userAvatars: { none: {} },
            memberAvatars: { none: {} },
          },
        ],
      },
      select: { id: true, objectKey: true },
      orderBy: { createdAt: "asc" },
      take: batchSize,
    });
    if (expired.length === 0) return 0;

    const removed = await this.media.remove(
      expired.map((asset) => asset.objectKey),
    );
    if (!removed) {
      // The rows stay as they are, so the next sweep tries the same objects.
      // Marking them deleted here would strand the bytes permanently.
      return 0;
    }

    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: expired.map((asset) => asset.id) } },
      data: { deletedAt: now },
    });
    this.logger.log(`deleted ${expired.length} profile image object(s)`);
    return expired.length;
  }
}
