import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  LibraryRelease,
  LibraryReleaseDraft,
  LibrarySyncCopy,
  PublishLibraryUpdateInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { masterKeyMap, projectNodes } from "./catalog.js";
import { hashUnits, storedReleaseView } from "./nodes.js";
import { readCourseProjection } from "./projection.js";
import { lockCourseRow, releaseBlockers, summarize } from "./release.js";
import { latestRelease, publishRelease } from "./release-access.js";
import { LibrarySyncJobService } from "./sync-job.service.js";

/**
 * Library course sync, as head office drives it (design §6, §18.1).
 *
 * Authorized on the platform axis, like library authoring. Everything here
 * reads counts and states of copies, never their content (D12).
 */
@Injectable()
export class LibraryReleaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
    private readonly audit: AuditService,
    private readonly jobs: LibrarySyncJobService,
  ) {}

  /** What Publish update would publish: a summary from hashes, and blockers. */
  async draft(
    identity: SupabaseIdentity,
    input: { courseId: string },
  ): Promise<LibraryReleaseDraft> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );
    const master = await this.requireLibraryCourse(input.courseId);
    const [projection, latest, linkedCopies] = await Promise.all([
      readCourseProjection(this.prisma, master.id, { mode: "digest" }),
      latestRelease(this.prisma, master.id),
      this.prisma.courseSyncState.count({
        where: { libraryCourseId: master.id },
      }),
    ]);
    const nodes = projectNodes(projection!, masterKeyMap(master.id));
    const hashes = new Map(
      nodes.map((node) => [node.key, hashUnits(node.units)]),
    );
    const previous = latest
      ? new Map(
          (
            await this.prisma.libraryReleaseNode.findMany({
              where: { releaseId: latest.id },
              select: {
                nodeKey: true,
                kind: true,
                materialType: true,
                parentKey: true,
                ordinal: true,
                unitHashes: true,
              },
            })
          ).map((row) => [row.nodeKey, storedReleaseView(row)]),
        )
      : new Map();
    const tree = {
      nodes,
      hashes,
      language: projection!.language,
      contentRevision: projection!.contentRevision,
    };
    const summary = summarize(previous, tree);
    const blockers = await releaseBlockers(this.prisma as never, tree).then(
      (all) => all.filter((blocker) => blocker !== "size"),
    );
    const published = latest
      ? await this.prisma.libraryRelease.findUniqueOrThrow({
          where: { id: latest.id },
          select: { publishedAt: true },
        })
      : null;
    return {
      contentRevision: projection!.contentRevision,
      latest:
        latest && published
          ? {
              number: latest.number,
              publishedAt: published.publishedAt.toISOString(),
            }
          : null,
      hasUnpublishedChanges:
        !latest || summary.added + summary.removed + summary.changed > 0,
      summary,
      blockers,
      linkedCopies,
    };
  }

  async publish(
    identity: SupabaseIdentity,
    input: PublishLibraryUpdateInput,
  ): Promise<LibraryRelease> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    const master = await this.requireLibraryCourse(input.courseId);
    const release = await this.prisma.$transaction(
      async (tx) => {
        await lockCourseRow(tx, master.id);
        const current = await tx.course.findUniqueOrThrow({
          where: { id: master.id },
          select: { contentRevision: true, isVisible: true, retiredAt: true },
        });
        if (!current.isVisible || current.retiredAt)
          throw new AppException(
            "LIBRARY_COURSE_NOT_FOUND",
            HttpStatus.CONFLICT,
            "Only a published, unretired course can release updates.",
          );
        if (current.contentRevision !== input.expectedContentRevision)
          throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
        return publishRelease(tx, this.audit, {
          libraryCourseId: master.id,
          note: input.note,
          actorUserId: actor.userId,
          requireChanges: true,
        });
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
    this.jobs.requestDrain();
    const [published] = (
      await this.releases(identity, { courseId: master.id })
    ).releases.filter((row) => row.id === release.id);
    return published!;
  }

  async releases(
    identity: SupabaseIdentity,
    input: { courseId: string },
  ): Promise<{ releases: LibraryRelease[] }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );
    const master = await this.requireLibraryCourse(input.courseId);
    const [rows, states] = await Promise.all([
      this.prisma.libraryRelease.findMany({
        where: { libraryCourseId: master.id },
        orderBy: { number: "desc" },
        take: 50,
        select: {
          id: true,
          number: true,
          note: true,
          publishedAt: true,
          nodeCount: true,
          summary: true,
          publishedBy: { select: { displayName: true } },
        },
      }),
      this.prisma.courseSyncState.findMany({
        where: { libraryCourseId: master.id },
        select: {
          appliedReleaseNumber: true,
          targetReleaseNumber: true,
          status: true,
          openConflictCount: true,
        },
      }),
    ]);
    return {
      releases: rows.map((row) => ({
        id: row.id,
        number: row.number,
        note: row.note,
        publishedAt: row.publishedAt.toISOString(),
        publishedByName: row.publishedBy.displayName,
        nodeCount: row.nodeCount,
        summary: {
          added: 0,
          removed: 0,
          changed: 0,
          byType: {},
          ...(row.summary as object),
        },
        rollout: {
          synced: states.filter(
            (state) => state.appliedReleaseNumber >= row.number,
          ).length,
          pending: states.filter(
            (state) =>
              state.appliedReleaseNumber < row.number &&
              state.status !== "FAILED",
          ).length,
          needsReview: states.filter(
            (state) =>
              state.appliedReleaseNumber >= row.number &&
              state.openConflictCount > 0,
          ).length,
          failed: states.filter(
            (state) =>
              state.appliedReleaseNumber < row.number &&
              state.status === "FAILED",
          ).length,
        },
      })),
    };
  }

  async copies(
    identity: SupabaseIdentity,
    input: { courseId: string },
  ): Promise<{ copies: LibrarySyncCopy[] }> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );
    const master = await this.requireLibraryCourse(input.courseId);
    const rows = await this.prisma.courseSyncState.findMany({
      where: { libraryCourseId: master.id },
      select: copySelect,
      orderBy: [{ course: { academy: { name: "asc" } } }, { courseId: "asc" }],
    });
    return { copies: rows.map(toCopy) };
  }

  /** Queue a fresh attempt for a copy whose sync failed, or nudge one that waits. */
  async retry(
    identity: SupabaseIdentity,
    input: { copyCourseId: string },
  ): Promise<LibrarySyncCopy> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    await this.requireCopy(input.copyCourseId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE course_sync_states SET status = CASE WHEN paused_at IS NULL THEN 'PENDING'::"LibrarySyncStatus" ELSE status END,
          last_error_code = NULL, updated_at = now()
        WHERE course_id = ${input.copyCourseId}::uuid AND target_release_number > applied_release_number`;
      await enqueue(tx, input.copyCourseId);
    });
    this.jobs.requestDrain();
    return this.copy(input.copyCourseId);
  }

  /** Stop applying releases to a copy. Jobs and the newest target are kept. */
  async pause(
    identity: SupabaseIdentity,
    input: { copyCourseId: string },
  ): Promise<LibrarySyncCopy> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    const copy = await this.requireCopy(input.copyCourseId);
    await this.prisma.$transaction(async (tx) => {
      await tx.courseSyncState.update({
        where: { courseId: input.copyCourseId },
        data: { pausedAt: new Date(), status: "PAUSED" },
      });
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: copy.academyId,
        action: "content.library_sync.paused",
        targetType: "Course",
        targetId: input.copyCourseId,
      });
    });
    return this.copy(input.copyCourseId);
  }

  /** Resume a paused copy against the latest release. */
  async resume(
    identity: SupabaseIdentity,
    input: { copyCourseId: string },
  ): Promise<LibrarySyncCopy> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    const copy = await this.requireCopy(input.copyCourseId);
    await this.prisma.$transaction(async (tx) => {
      const latest = await latestRelease(tx, copy.libraryCourseId);
      await tx.$executeRaw`
        UPDATE course_sync_states SET paused_at = NULL,
          target_release_id = CASE WHEN ${latest?.number ?? 0} > target_release_number THEN ${latest?.id ?? null}::uuid ELSE target_release_id END,
          target_release_number = GREATEST(target_release_number, ${latest?.number ?? 0}),
          status = CASE WHEN GREATEST(target_release_number, ${latest?.number ?? 0}) > applied_release_number THEN 'PENDING'::"LibrarySyncStatus" ELSE 'IDLE'::"LibrarySyncStatus" END,
          updated_at = now()
        WHERE course_id = ${input.copyCourseId}::uuid`;
      await enqueue(tx, input.copyCourseId);
      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: copy.academyId,
        action: "content.library_sync.resumed",
        targetType: "Course",
        targetId: input.copyCourseId,
      });
    });
    this.jobs.requestDrain();
    return this.copy(input.copyCourseId);
  }

  private async copy(copyCourseId: string) {
    const row = await this.prisma.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyCourseId },
      select: copySelect,
    });
    return toCopy(row);
  }

  private async requireLibraryCourse(courseId: string) {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, academy: { kind: "LIBRARY" } },
      select: { id: true },
    });
    if (!course)
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return course;
  }

  private async requireCopy(copyCourseId: string) {
    const state = await this.prisma.courseSyncState.findUnique({
      where: { courseId: copyCourseId },
      select: {
        libraryCourseId: true,
        course: { select: { academyId: true } },
        libraryCourse: { select: { academy: { select: { kind: true } } } },
      },
    });
    if (!state || state.libraryCourse.academy.kind !== "LIBRARY")
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return {
      libraryCourseId: state.libraryCourseId,
      academyId: state.course.academyId,
    };
  }
}

/** One pending job for a copy that is behind, unless one already waits. */
async function enqueue(
  tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
  copyCourseId: string,
) {
  await tx.$executeRaw`
    INSERT INTO library_sync_jobs (id, copy_course_id, target_release_id, target_release_number, status, next_attempt_at)
    SELECT gen_random_uuid(), s.course_id, s.target_release_id, s.target_release_number, 'PENDING', now()
    FROM course_sync_states s
    WHERE s.course_id = ${copyCourseId}::uuid AND s.paused_at IS NULL AND s.target_release_id IS NOT NULL
      AND s.target_release_number > s.applied_release_number
    ON CONFLICT (copy_course_id) WHERE status = 'PENDING'
    DO UPDATE SET next_attempt_at = now(), target_release_id = EXCLUDED.target_release_id,
      target_release_number = EXCLUDED.target_release_number`;
}

const copySelect = {
  courseId: true,
  appliedReleaseNumber: true,
  targetReleaseNumber: true,
  status: true,
  openConflictCount: true,
  divergentUnitCount: true,
  pausedAt: true,
  lastRunAt: true,
  lastErrorCode: true,
  course: {
    select: { title: true, academy: { select: { name: true, slug: true } } },
  },
} as const;

function toCopy(row: {
  courseId: string;
  appliedReleaseNumber: number;
  targetReleaseNumber: number;
  status: LibrarySyncCopy["status"];
  openConflictCount: number;
  divergentUnitCount: number;
  pausedAt: Date | null;
  lastRunAt: Date | null;
  lastErrorCode: string | null;
  course: { title: string; academy: { name: string; slug: string } };
}): LibrarySyncCopy {
  return {
    academyName: row.course.academy.name,
    academySlug: row.course.academy.slug,
    courseId: row.courseId,
    courseTitle: row.course.title,
    appliedReleaseNumber: row.appliedReleaseNumber,
    targetReleaseNumber: row.targetReleaseNumber,
    status: row.status,
    openConflictCount: row.openConflictCount,
    divergentUnitCount: row.divergentUnitCount,
    paused: row.pausedAt !== null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastErrorCode: row.lastErrorCode,
  };
}
