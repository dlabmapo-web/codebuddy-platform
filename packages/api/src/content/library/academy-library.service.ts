import { readAvailableLibraryCourses, readLibraryCoursePreview } from "../../library-sync/release-preview.js";
import { latestOrInitialRelease, releaseCourseDescription } from "../../library-sync/release-access.js";
import { runCopySync } from "../../library-sync/sync-run.js";
import { SyncWriteError } from "../../library-sync/writer.js";
import { HttpStatus, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AvailableLibraryCourse } from "@cove/shared";

import { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { AppException } from "../../common/app-exception.js";
import { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { toCourseSummary } from "../course.service.js";

/**
 * The content library, as an academy uses it.
 *
 * Adoption materializes an immutable release into an academy-owned tree.
 * Published updates are merged into linked copies; academy edits are preserved
 * and overlapping edits become review decisions.
 *
 * Which library an academy sees is never a parameter. It follows from the
 * academy's own `organizationId`, so a customer outside the franchise sees an
 * empty list rather than somebody else's curriculum.
 */
@Injectable()
export class AcademyLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  async available(
    identity: SupabaseIdentity,
    input: { academyId: string },
  ): Promise<{ courses: AvailableLibraryCourse[] }> {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );

    const library = await this.libraryFor(input.academyId);
    if (!library) return { courses: [] };

    return { courses: await readAvailableLibraryCourses(this.prisma, library, input.academyId) };
  }

  /**
   * The master's outline, read-only.
   *
   * The same shape the builder renders, so the preview shows exactly what will
   * arrive rather than a summary of it. Authorized against the *branch*, and
   * then narrowed to a master the branch is allowed to see — a team lead never
   * gains access to the library academy itself.
   */
  async preview(
    identity: SupabaseIdentity,
    input: { academyId: string; libraryCourseId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );

    const library = await this.libraryFor(input.academyId);
    const preview = library
      ? await readLibraryCoursePreview(this.prisma, library, input.libraryCourseId)
      : null;
    if (!preview)
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return preview;
  }

  /**
   * A complete copy of one master into one academy, in one transaction.
   *
   * Six bulk inserts rather than a nested create: a large course is several
   * thousand rows, and per-row round trips inside one transaction is how a
   * copy times out. Ids are generated here so each level knows its parents
   * before any of them is written.
   */
  async adopt(
    identity: SupabaseIdentity,
    input: { academyId: string; libraryCourseId: string; title: string },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );

    const master = await this.requireAdoptableMaster(
      input.academyId,
      input.libraryCourseId,
    );

    const title = input.title.trim();
    const clash = await this.prisma.course.findFirst({
      where: {
        academyId: input.academyId,
        title: { equals: title, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (clash) {
      throw new AppException("LIBRARY_ADOPTION_CONFLICT", HttpStatus.CONFLICT);
    }

    const courseId = randomUUID();
    // Adoption copies the latest *published release*, never the working tree
    // (library sync design D4, §6.3): head office's unfinished edits do not
    // reach a new copy. The master's row lock is the publish lock, held until
    // the copy's link and sync state exist, so a concurrent publish either
    // fans out to this copy or completes before it picks its release.
    const created = await this.prisma.$transaction(async (tx) => {
      const [eligible] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM courses
        WHERE id = ${master.id}::uuid AND is_visible AND retired_at IS NULL
        FOR UPDATE`;
      if (!eligible)
        throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
      const release = await latestOrInitialRelease(tx, master.id, this.audit);
      const description = await releaseCourseDescription(tx, release.id, master.id);

      const course = await tx.course.create({
        data: {
          id: courseId,
          academyId: input.academyId,
          title,
          description,
          // The copy is written in the release's language, and so are its
          // exercises (each keeps its own).
          language: release.language,
          // Visible on arrival, with its whole tree: students see it once it is
          // assigned to their class. Hiding it stays one switch away.
          isVisible: true,
          contentRevision: 1,
          baselineRevision: 1,
          sourceCourseId: master.id,
          sourceContentRevision: release.libraryContentRevision,
          createdByUserId: actor.userId,
        },
      });
      await tx.courseSyncState.create({
        data: {
          courseId,
          libraryCourseId: master.id,
          linkMethod: "ADOPTED",
          baseReleaseId: release.id,
          appliedReleaseNumber: release.number,
          targetReleaseId: release.id,
          targetReleaseNumber: release.number,
          status: "IDLE",
        },
      });

      // The same writer a sync uses, from an empty copy, with base = the
      // release: every node arrives linked and the academy's chosen title is
      // its own customization from the start.
      try {
        await runCopySync(tx, this.audit, { copyCourseId: courseId, fence: null, adoption: true });
      } catch (error) {
        // An asset the release names is no longer ready: nothing is copied.
        if (error instanceof SyncWriteError) throw new AppException("LIBRARY_IMPORT_CONTENT_INVALID", HttpStatus.CONFLICT, error.code);
        throw error;
      }

      await this.audit.write(tx, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "content.course.adopted_from_library",
        targetType: "Course",
        targetId: course.id,
        after: {
          sourceCourseId: master.id,
          sourceContentRevision: release.libraryContentRevision,
          releaseNumber: release.number,
          title,
        },
      });

      return course;
    }, { maxWait: 5_000, timeout: 60_000 });

    const summary = await this.prisma.course.findUniqueOrThrow({
      where: { id: created.id },
      include: summaryInclude,
    });
    return toCourseSummary(summary);
  }

  /**
   * The academy's library, or null when its organization has none.
   *
   * Resolved from the academy's own `organizationId` rather than taken as an
   * argument, so no caller can name a library belonging to somebody else.
   */
  private async libraryFor(academyId: string): Promise<string | null> {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { organizationId: true, kind: true },
    });
    // A library adopting from a library is not a thing.
    if (!academy || academy.kind !== "ACADEMY") return null;

    const library = await this.prisma.academy.findFirst({
      where: { organizationId: academy.organizationId, kind: "LIBRARY" },
      select: { id: true },
    });
    return library?.id ?? null;
  }

  /**
   * A master this academy is actually allowed to take.
   *
   * One refusal for every reason it might not be — wrong organization,
   * unpublished, retired, or not a library course at all. They are not
   * distinguished on purpose: a branch guessing course ids learns nothing from
   * the answer.
   */
  private async requireAdoptableMaster(academyId: string, courseId: string) {
    const library = await this.libraryFor(academyId);
    if (!library) {
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const course = await this.prisma.course.findFirst({
      where: {
        id: courseId,
        academyId: library,
        isVisible: true,
        retiredAt: null,
      },
      select: { id: true },
    });
    if (!course) {
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }
}

const summaryInclude = {
  modules: {
    select: {
      id: true,
      isVisible: true,
      lectures: {
        select: {
          id: true,
          isVisible: true,
          materials: { select: { isVisible: true, type: true } },
        },
      },
    },
  },
  sourceCourse: {
    select: { id: true, title: true, contentRevision: true, retiredAt: true },
  },
} as const satisfies Prisma.CourseInclude;
