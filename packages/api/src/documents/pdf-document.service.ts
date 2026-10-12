import { pdfMetadata } from "./pdf-metadata.js";
import { randomUUID } from "node:crypto";
import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Request } from "express";
import {
  pdfIsMain,
  pdfIsResource,
  type SavePdf,
  type PdfReadResult,
} from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { learningScopeFor } from "../classes/assigned-course-access.js";
import { visibleCurriculumInclude } from "../learn/curriculum-outline.service.js";
import {
  bumpContentRevision,
  nextMaterialPosition,
  compactMaterialPositions,
} from "../content/content-positions.js";
import { PdfStorageService } from "./pdf-storage.service.js";
import { receivePdf, safePdfFilename, validatePdf } from "./pdf-files.js";

type Target = { academyId: string; courseId: string; lectureId: string };
export async function lockPdfAsset(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM pdf_assets WHERE id = ${id}::uuid FOR UPDATE`;
  const asset = await tx.pdfAsset.findUnique({ where: { id } });
  if (!asset || asset.state !== "READY")
    throw new AppException("PDF_UPLOAD_EXPIRED", 409);
  return asset;
}

@Injectable()
export class PdfDocumentService implements OnModuleInit, OnModuleDestroy {
  private activeUploads = 0;
  private timer?: ReturnType<typeof setInterval>;
  private sweeping = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly storage: PdfStorageService,
    private readonly audit: AuditService,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.cleanup().catch(() => undefined);
    }, 3_600_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  private async author(
    identity: SupabaseIdentity,
    target: Target,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      target.academyId,
      "curriculum.manage",
    );
    const lecture = await tx.lecture.findFirst({
      where: {
        id: target.lectureId,
        courseModule: {
          courseId: target.courseId,
          course: { academyId: target.academyId },
        },
      },
    });
    if (!lecture) throw new AppException("PDF_NOT_AVAILABLE", 404);
    return actor;
  }
  async upload(
    identity: SupabaseIdentity,
    target: Target,
    filename: string,
    request: Request,
  ) {
    const actor = await this.author(identity, target);
    if (this.activeUploads >= 2) throw new AppException("PDF_BUSY", 429);
    this.activeUploads++;
    let file: Awaited<ReturnType<typeof receivePdf>> | undefined;
    try {
      file = await receivePdf(request);
      const pageCount = await validatePdf(file.path);
      const id = randomUUID();
      const objectKey = `${target.academyId}/${target.courseId}/${id}.pdf`;
      // Persist before storage: failed/disconnected writes remain discoverable by cleanup.
      await this.prisma.pdfAsset.create({
        data: {
          id,
          objectKey,
          originalFilename: safePdfFilename(filename),
          byteSize: file.byteSize,
          checksumSha256: file.checksumSha256,
          pageCount,
          uploaderUserId: actor.userId,
          ...target,
        },
      });
      await this.storage.upload(objectKey, file.path, file.byteSize);
      await this.prisma.pdfAsset.update({
        where: { id },
        data: { state: "READY" },
      });
      return {
        assetId: id,
        originalFilename: safePdfFilename(filename),
        pageCount,
        byteSize: file.byteSize,
      };
    } finally {
      try {
        await file?.dispose();
      } finally {
        this.activeUploads--;
      }
    }
  }
  async save(identity: SupabaseIdentity, input: SavePdf) {
    const actor = await this.author(identity, input);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.courseId}::uuid FOR UPDATE`;
        const lecture = await tx.lecture.findFirst({
          where: {
            id: input.lectureId,
            courseModule: {
              courseId: input.courseId,
              course: { academyId: input.academyId },
            },
          },
        });
        if (!lecture) throw new AppException("PDF_NOT_AVAILABLE", 404);
        let assetId = input.assetId;
        let revision = 1;
        if (input.materialId) {
          const current = await tx.material.findFirst({
            where: {
              id: input.materialId,
              lectureId: input.lectureId,
              type: "PDF_DOCUMENT",
            },
            include: { pdfDocument: true },
          });
          if (!current?.pdfDocument)
            throw new AppException("PDF_NOT_AVAILABLE", 404);
          if (current.pdfDocument.revision !== input.revision)
            throw new AppException("PDF_EDIT_STALE", 409);
          revision = current.pdfDocument.revision + 1;
          assetId ??= current.pdfDocument.assetId;
        }
        if (!assetId) throw new AppException("PDF_INVALID");
        if (input.assetId) {
          const asset = await lockPdfAsset(tx, assetId);
          if (
            asset.uploaderUserId !== actor.userId ||
            asset.academyId !== input.academyId ||
            asset.courseId !== input.courseId ||
            asset.lectureId !== input.lectureId ||
            asset.consumedAt ||
            Date.now() - asset.createdAt.getTime() > 3_600_000
          )
            throw new AppException("PDF_UPLOAD_EXPIRED", 409);
          await tx.pdfAsset.update({
            where: { id: assetId },
            data: { consumedAt: new Date() },
          });
        }
        const materialId = input.materialId ?? randomUUID();
        if (input.materialId) {
          await tx.material.update({
            where: { id: materialId },
            data: { title: input.title },
          });
          await tx.pdfDocument.update({
            where: { materialId },
            data: { assetId, placement: input.placement, revision },
          });
        } else {
          await tx.material.create({
            data: {
              id: materialId,
              lectureId: input.lectureId,
              title: input.title,
              type: "PDF_DOCUMENT",
              isVisible: false,
              isRequired: false,
              position: await nextMaterialPosition(tx, input.lectureId),
              pdfDocument: { create: { assetId, placement: input.placement } },
            },
          });
        }
        await bumpContentRevision(tx, input.courseId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: input.materialId
            ? "content.pdf.updated"
            : "content.pdf.created",
          targetType: "Material",
          targetId: materialId,
          after: {
            title: input.title,
            placement: input.placement,
            assetId,
            revision,
          },
        });
        return { materialId };
      },
      { timeout: 30_000 },
    );
  }
  async mutate(
    identity: SupabaseIdentity,
    target: Target & { materialId: string },
    visible?: boolean,
  ) {
    const actor = await this.author(identity, target);
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${target.courseId}::uuid FOR UPDATE`;
        const material = await tx.material.findFirst({
          where: {
            id: target.materialId,
            lectureId: target.lectureId,
            type: "PDF_DOCUMENT",
          },
        });
        if (!material) throw new AppException("PDF_NOT_AVAILABLE", 404);
        if (visible === undefined) {
          await tx.material.delete({ where: { id: material.id } });
          await compactMaterialPositions(tx, target.lectureId);
        } else
          await tx.material.update({
            where: { id: material.id },
            data: { isVisible: visible },
          });
        await bumpContentRevision(tx, target.courseId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: target.academyId,
          action:
            visible === undefined
              ? "content.pdf.deleted"
              : "content.pdf.visibility",
          targetType: "Material",
          targetId: material.id,
          after: { isVisible: visible ?? false },
        });
      },
      { timeout: 30_000 },
    );
    return { ok: true };
  }
  async read(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      materialId: string;
      preview?: boolean;
      download?: boolean;
    },
  ): Promise<PdfReadResult> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      input.preview ? "curriculum.review" : "curriculum.read",
    );
    const scope = learningScopeFor(input.academyId, actor);
    const where: Prisma.MaterialWhereInput = input.preview
      ? {
          lecture: { courseModule: { course: { academyId: input.academyId } } },
        }
      : {
          AND: [
            scope.material,
            {
              isVisible: true,
              lecture: {
                isVisible: true,
                courseModule: {
                  isVisible: true,
                  course: { academyId: input.academyId, isVisible: true },
                },
              },
            },
          ],
        };
    const material = await this.prisma.material.findFirst({
      where: {
        AND: [
          where,
          {
            id: input.materialId,
            type: "PDF_DOCUMENT",
            pdfDocument: { asset: { state: "READY" } },
          },
        ],
      },
      include: {
        pdfDocument: { include: { asset: true } },
        lecture: { include: { courseModule: { include: { course: true } } } },
      },
    });
    if (!material?.pdfDocument)
      throw new AppException("PDF_NOT_AVAILABLE", 404);
    const course = material.lecture.courseModule.course;
    const outline = await this.prisma.course.findUnique({
      where: { id: course.id },
      include: visibleCurriculumInclude,
    });
    const materials: PdfReadResult["materials"] = [];
    const resources: PdfReadResult["resources"] = [];
    for (const module of outline?.modules ?? [])
      for (const lecture of module.lectures)
        for (const row of lecture.materials) {
          if (
            row.programmingExercise || row.manualMaterial || (row.videoLesson?.asset.state === "READY" && row.videoLesson.placement !== "SUPPLEMENTARY") ||
            (row.pdfDocument?.asset.state === "READY" &&
              pdfIsMain(row.pdfDocument.placement))
          )
            materials.push({
              materialId: row.id,
              title: row.title,
              type: row.type,
              position: row.position,
              lectureId: lecture.id,
            });
          if (
            lecture.id === material.lectureId &&
            row.pdfDocument?.asset.state === "READY" &&
            pdfIsResource(row.pdfDocument.placement)
          )
            resources.push({
              materialId: row.id,
              title: row.title,
              originalFilename: row.pdfDocument.asset.originalFilename,
              byteSize: row.pdfDocument.asset.byteSize,
            });
        }
    return {
      materialId: material.id,
      title: material.title,
      pdf: pdfMetadata(material.pdfDocument),
      url: await this.storage.sign(
        material.pdfDocument.asset.objectKey,
        input.download
          ? material.pdfDocument.asset.originalFilename
          : undefined,
      ),
      course: { id: course.id, title: course.title },
      lecture: { id: material.lectureId, title: material.lecture.title },
      materials,
      resources,
    };
  }
  async cleanup() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const candidates = await this.prisma.pdfAsset.findMany({
        where: {
          OR: [
            { state: "DELETING" },
            {
              state: { in: ["PENDING", "READY"] },
              createdAt: { lt: new Date(Date.now() - 86_400_000) },
              documents: { none: {} },
            },
          ],
        },
        take: 100,
      });
      for (const candidate of candidates) {
        const claimed = await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM pdf_assets WHERE id = ${candidate.id}::uuid FOR UPDATE`;
          const row = await tx.pdfAsset.findUnique({
            where: { id: candidate.id },
            include: { _count: { select: { documents: true } } },
          });
          if (!row || row._count.documents > 0 || row.state === "DELETED")
            return false;
          await tx.pdfAsset.update({
            where: { id: row.id },
            data: { state: "DELETING" },
          });
          return true;
        });
        if (claimed && (await this.storage.remove(candidate.objectKey)))
          await this.prisma.pdfAsset.update({
            where: { id: candidate.id },
            data: { state: "DELETED" },
          });
      }
    } finally {
      this.sweeping = false;
    }
  }
}
