import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import {
  importAcademyCourseSchema,
  libraryImportMaterialTypes,
  type AcademyCourseImportPreview,
  type ImportAcademyCourseInput,
  type PreviewAcademyCourseInput,
} from "@cove/shared";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import {
  copyCourseTree,
  courseCopyInclude,
} from "../content/library/course-tree-copy.js";
import { libraryImportBlockers } from "../content/library/library-import-validation.js";
import {
  assertLibraryTitleAvailable,
  lockLibraryTitles,
} from "../content/library/library-title-lock.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  Prisma,
  type LibraryCourseImport,
} from "../generated/prisma/client.js";
import { resolveContentLibrary } from "./library-academy.js";
import { librarySelect, toLibraryCourse } from "./library-course-summary.js";

type Reader = Pick<Prisma.TransactionClient, "course" | "libraryCourseImport">;

/** Prisma's pg adapter wraps raw-query serialization failures in P2010. */
function isRetryableImportError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (["P2034", "P2002"].includes(error.code)) return true;
  if (error.code !== "P2010") return false;
  const adapter = error.meta?.driverAdapterError as
    | { cause?: { originalCode?: string; code?: string; kind?: string } }
    | undefined;
  return (
    adapter?.cause?.kind === "TransactionWriteConflict" ||
    ["40001", "40P01"].includes(
      String(
        adapter?.cause?.originalCode ??
          adapter?.cause?.code ??
          error.meta?.code,
      ),
    )
  );
}

@Injectable()
export class PlatformLibraryImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformAccessService,
    private readonly academyAccess: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<ApiEnvironment, true>,
  ) {}

  private organizationSlug() {
    return this.config.get("PLATFORM_ORGANIZATION_SLUG", { infer: true });
  }

  private async authorize(identity: SupabaseIdentity) {
    const actor = await this.platform.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    await this.platform.requirePermission(
      identity.authUserId,
      "platform.content.read",
    );
    await this.platform.requirePermission(
      identity.authUserId,
      "platform.academies.inspect",
    );
    return actor;
  }

  private sourceWhere(input: PreviewAcademyCourseInput) {
    return {
      id: input.sourceCourseId,
      academyId: input.sourceAcademyId,
      academy: {
        kind: "ACADEMY" as const,
        organization: { slug: this.organizationSlug() },
      },
    };
  }

  async preview(
    identity: SupabaseIdentity,
    input: PreviewAcademyCourseInput,
  ): Promise<AcademyCourseImportPreview> {
    await this.authorize(identity);
    await this.academyAccess.requirePermission(
      identity.authUserId,
      input.sourceAcademyId,
      "curriculum.review",
    );
    return this.prisma.$transaction(
      async (tx) => {
        const source = await tx.course.findFirst({
          where: this.sourceWhere(input),
          include: {
            ...courseCopyInclude,
            academy: { select: { name: true } },
          },
        });
        if (!source)
          throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
        const materialCounts = Object.fromEntries(
          libraryImportMaterialTypes.map((type) => [type, 0]),
        ) as AcademyCourseImportPreview["materialCounts"];
        const modules = source.modules.map((module) => ({
          id: module.id,
          title: module.title,
          position: module.position,
          isVisible: module.isVisible,
          lectures: module.lectures.map((lecture) => ({
            id: lecture.id,
            title: lecture.title,
            position: lecture.position,
            isVisible: lecture.isVisible,
            materials: lecture.materials.map((material) => {
              materialCounts[material.type] += 1;
              return {
                id: material.id,
                title: material.title,
                type: material.type,
                isVisible: material.isVisible,
                isRequired: material.isRequired,
                position: material.position,
              };
            }),
          })),
        }));
        return {
          sourceAcademyId: source.academyId,
          sourceAcademyName: source.academy.name,
          sourceCourseId: source.id,
          sourceCourseTitle: source.title,
          sourceContentRevision: source.contentRevision,
          materialCounts,
          modules,
          blockers: await libraryImportBlockers(tx, source),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30_000,
      },
    );
  }

  private async replay(
    db: Reader,
    receipt: LibraryCourseImport,
    input: ImportAcademyCourseInput,
    actorUserId: string,
  ) {
    if (
      receipt.actorUserId !== actorUserId ||
      receipt.sourceAcademyId !== input.sourceAcademyId ||
      receipt.sourceCourseId !== input.sourceCourseId ||
      receipt.sourceContentRevision !== input.expectedSourceContentRevision ||
      receipt.destinationTitle !== input.title
    )
      throw new AppException(
        "LIBRARY_IMPORT_REQUEST_CONFLICT",
        HttpStatus.CONFLICT,
      );
    const course = await db.course.findFirst({
      where: {
        id: receipt.libraryCourseId,
        academy: {
          kind: "LIBRARY",
          organization: { slug: this.organizationSlug() },
        },
      },
      select: librarySelect,
    });
    if (!course)
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return {
      academyId: (
        await db.course.findUniqueOrThrow({
          where: { id: course.id },
          select: { academyId: true },
        })
      ).academyId,
      course: toLibraryCourse(course),
    };
  }

  async importCourse(
    identity: SupabaseIdentity,
    rawInput: ImportAcademyCourseInput,
  ) {
    const actor = await this.authorize(identity);
    const input = importAcademyCourseSchema.parse(rawInput);
    const receipt = await this.prisma.libraryCourseImport.findUnique({
      where: { requestKey: input.requestKey },
    });
    if (receipt) return this.replay(this.prisma, receipt, input, actor.userId);
    await this.academyAccess.requirePermission(
      identity.authUserId,
      input.sourceAcademyId,
      "curriculum.review",
    );
    const deadline = Date.now() + 40_000;
    for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
      try {
        const remaining = deadline - Date.now();
        const maxWait = Math.min(5_000, Math.max(1, Math.floor(remaining / 4)));
        const timeout = Math.min(30_000, Math.max(1, remaining - maxWait));
        return await this.prisma.$transaction(
          async (tx) => {
            const library = await resolveContentLibrary(
              tx,
              this.organizationSlug(),
            );
            await lockLibraryTitles(tx, library.id);
            const completed = await tx.libraryCourseImport.findUnique({
              where: { requestKey: input.requestKey },
            });
            if (completed)
              return this.replay(tx, completed, input, actor.userId);
            await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.sourceCourseId}::uuid FOR UPDATE`;
            const source = await tx.course.findFirst({
              where: this.sourceWhere(input),
              include: {
                ...courseCopyInclude,
                academy: { select: { name: true } },
              },
            });
            if (!source)
              throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
            if (source.contentRevision !== input.expectedSourceContentRevision)
              throw new AppException(
                "LIBRARY_IMPORT_SOURCE_CHANGED",
                HttpStatus.CONFLICT,
              );
            await assertLibraryTitleAvailable(tx, library.id, input.title);
            const blockers = await libraryImportBlockers(tx, source);
            if (blockers.length)
              throw new AppException(
                "LIBRARY_IMPORT_CONTENT_INVALID",
                HttpStatus.CONFLICT,
                `${blockers[0]!.materialTitle}: ${blockers[0]!.reason}`,
              );
            const courseId = randomUUID();
            await tx.course.create({
              data: {
                id: courseId,
                academyId: library.id,
                title: input.title,
                description: source.description,
                isVisible: false,
                contentRevision: 1,
                createdByUserId: actor.userId,
              },
            });
            await copyCourseTree(tx, source, courseId, "PRESERVE_VISIBILITY");
            await tx.libraryCourseImport.create({
              data: {
                libraryCourseId: courseId,
                requestKey: input.requestKey,
                actorUserId: actor.userId,
                sourceAcademyId: source.academyId,
                sourceCourseId: source.id,
                sourceAcademyName: source.academy.name,
                sourceCourseTitle: source.title,
                sourceContentRevision: source.contentRevision,
                destinationTitle: input.title,
              },
            });
            if (library.created)
              await this.audit.write(tx, {
                actorUserId: actor.userId,
                academyId: null,
                action: "platform.library.created",
                targetType: "Academy",
                targetId: library.id,
              });
            const materialCounts = Object.fromEntries(
              libraryImportMaterialTypes.map((type) => [
                type,
                source.modules.reduce(
                  (total, module) =>
                    total +
                    module.lectures.reduce(
                      (sum, lecture) =>
                        sum +
                        lecture.materials.filter(
                          (material) => material.type === type,
                        ).length,
                      0,
                    ),
                  0,
                ),
              ]),
            );
            await this.audit.write(tx, {
              actorUserId: actor.userId,
              academyId: null,
              action: "platform.library.course.imported_from_academy",
              targetType: "Course",
              targetId: courseId,
              after: {
                sourceAcademyId: source.academyId,
                sourceCourseId: source.id,
                sourceContentRevision: source.contentRevision,
                title: input.title,
                requestKey: input.requestKey,
                materialCounts,
              },
            });
            const course = await tx.course.findUniqueOrThrow({
              where: { id: courseId },
              select: librarySelect,
            });
            return { academyId: library.id, course: toLibraryCourse(course) };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait,
            timeout,
          },
        );
      } catch (error) {
        if (
          error instanceof AppException &&
          error.code === "PDF_UPLOAD_EXPIRED"
        )
          throw new AppException(
            "LIBRARY_IMPORT_CONTENT_INVALID",
            HttpStatus.CONFLICT,
          );
        if (!isRetryableImportError(error)) throw error;
        // Unique-index races include first-library creation and a concurrent request receipt.
        const completed = await this.prisma.libraryCourseImport.findUnique({
          where: { requestKey: input.requestKey },
        });
        if (completed)
          return this.replay(this.prisma, completed, input, actor.userId);
      }
    }
    throw new AppException("LIBRARY_IMPORT_BUSY", HttpStatus.CONFLICT);
  }
}
