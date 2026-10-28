import type { Prisma } from "../generated/prisma/client.js";
import { AppException } from "../common/app-exception.js";

/** Caller holds the course lock; links never grant access to their target. */
export async function validatePdfReference(
  tx: Prisma.TransactionClient,
  input: { academyId: string; courseId: string; lectureId: string; quiz?: unknown },
  referenceId: string | null | undefined,
  publishing = false,
) {
  if (!referenceId) return;
  if (input.quiz) throw new AppException("PDF_REFERENCE_INVALID", 400);
  const pdf = await tx.pdfDocument.findFirst({
    where: {
      materialId: referenceId,
      placement: { in: ["BOTH", "SUPPLEMENTARY"] },
      asset: { state: "READY" },
      material: { lecture: { courseModule: {
        courseId: input.courseId, course: { academyId: input.academyId },
      } } },
    },
    include: { material: { include: { lecture: { include: { courseModule: true } } } } },
  });
  if (!pdf) throw new AppException("PDF_REFERENCE_INVALID", 400);
  if (publishing && (!pdf.material.isVisible || !pdf.material.lecture.isVisible || !pdf.material.lecture.courseModule.isVisible))
    throw new AppException("PDF_REFERENCE_NOT_READY", 409);
}

/** Safe student metadata. The delivery endpoint reauthorizes before signing. */
export function referencePdfMetadata(pdf: {
  materialId: string; revision: number; placement: string;
  material: { title: string; isVisible: boolean; lecture: {
    isVisible: boolean; courseModule: { courseId: string; isVisible: boolean };
  } };
  asset: { state: string; originalFilename: string; byteSize: number; pageCount: number };
} | null | undefined, courseId: string) {
  if (!pdf || !pdf.material.isVisible || !pdf.material.lecture.isVisible ||
      !pdf.material.lecture.courseModule.isVisible || pdf.material.lecture.courseModule.courseId !== courseId ||
      pdf.placement === "MAIN" || pdf.asset.state !== "READY") return null;
  return { materialId: pdf.materialId, title: pdf.material.title, revision: pdf.revision,
    originalFilename: pdf.asset.originalFilename, byteSize: pdf.asset.byteSize, pageCount: pdf.asset.pageCount };
}

/** Detach deleted exercises, but never lose a surviving exercise's instructions. */
export async function detachSubtreePdfReferences(tx: Prisma.TransactionClient, where: Prisma.MaterialWhereInput) {
  const external = await tx.programmingExercise.count({ where: {
    referencePdf: { material: where }, NOT: { material: where },
  } });
  if (external) throw new AppException("PDF_REFERENCE_IN_USE", 409);
  await tx.programmingExercise.updateMany({ where: { material: where, referencePdfMaterialId: { not: null } }, data: { referencePdfMaterialId: null } });
}

/** Check after an ancestor publication, inside the same transaction (rollback on failure). */
export async function assertPublishedPdfReferences(tx: Prisma.TransactionClient, courseId: string) {
  const exercises = await tx.programmingExercise.findMany({
    where: { referencePdfMaterialId: { not: null }, material: { isVisible: true,
      lecture: { isVisible: true, courseModule: { courseId, isVisible: true } } } },
    select: { referencePdf: { select: { placement: true, asset: { select: { state: true } }, material: { select: {
      isVisible: true, lecture: { select: { isVisible: true, courseModule: { select: { courseId: true, isVisible: true } } } },
    } } } } },
  });
  if (exercises.some(({ referencePdf: pdf }) => !pdf || !pdf.material.isVisible || !pdf.material.lecture.isVisible ||
      !pdf.material.lecture.courseModule.isVisible || pdf.material.lecture.courseModule.courseId !== courseId ||
      pdf.placement === "MAIN" || pdf.asset.state !== "READY"))
    throw new AppException("PDF_REFERENCE_NOT_READY", 409);
}
