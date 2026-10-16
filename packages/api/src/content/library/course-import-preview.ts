import type { Prisma } from "../../generated/prisma/client.js";
import { courseImportPreviewInclude } from "./course-tree-copy.js";

/** Load only subtype tables present in the course, within the caller's snapshot. */
export async function readCourseImportPreview(
  tx: Prisma.TransactionClient,
  where: Prisma.CourseWhereInput,
) {
  const structure = courseImportPreviewInclude.modules;
  const definitions = structure.include.lectures.include.materials.include;
  const source = await tx.course.findFirst({
    where,
    include: {
      academy: { select: { name: true } },
      modules: {
        orderBy: structure.orderBy,
        include: {
          lectures: {
            orderBy: structure.include.lectures.orderBy,
            include: { materials: { orderBy: structure.include.lectures.include.materials.orderBy } },
          },
        },
      },
    },
  });
  if (!source) return null;
  const materials = source.modules.flatMap((module) => module.lectures.flatMap((lecture) => lecture.materials));
  const ids = (types: string[]) => materials.filter((material) => types.includes(material.type)).map((material) => material.id);
  const programmingIds = ids(["PROGRAMMING_EXERCISE"]);
  const manualIds = ids(["TURTLE_EXERCISE", "WRITTEN_RESPONSE", "MULTIPLE_CHOICE"]);
  const pdfIds = ids(["PDF_DOCUMENT"]);
  const videoIds = ids(["VIDEO_LESSON"]);
  const [programming, manuals, pdfs, videos] = await Promise.all([
    programmingIds.length ? tx.programmingExercise.findMany({
      where: { materialId: { in: programmingIds } }, select: { materialId: true, quiz: true },
    }) : [],
    manualIds.length ? tx.manualMaterial.findMany({ where: { materialId: { in: manualIds } } }) : [],
    pdfIds.length ? tx.pdfDocument.findMany({
      where: { materialId: { in: pdfIds } }, ...definitions.pdfDocument,
    }) : [],
    videoIds.length ? tx.videoLesson.findMany({
      where: { materialId: { in: videoIds } }, ...definitions.videoLesson,
    }) : [],
  ]);
  const programmingById = new Map(programming.map((row) => [row.materialId, row]));
  const manualById = new Map(manuals.map((row) => [row.materialId, row]));
  const pdfById = new Map(pdfs.map((row) => [row.materialId, row]));
  const videoById = new Map(videos.map((row) => [row.materialId, row]));
  return {
    ...source,
    modules: source.modules.map((module) => ({
      ...module,
      lectures: module.lectures.map((lecture) => ({
        ...lecture,
        materials: lecture.materials.map((material) => ({
          ...material,
          programmingExercise: programmingById.get(material.id) ?? null,
          manualMaterial: manualById.get(material.id) ?? null,
          pdfDocument: pdfById.get(material.id) ?? null,
          videoLesson: videoById.get(material.id) ?? null,
        })),
      })),
    })),
  };
}
