import { createHash } from "node:crypto";
import type { MaterialType, Prisma } from "../../generated/prisma/client.js";

type PreviewMaterial = {
  id: string;
  lectureId: string;
  type: MaterialType;
  title: string;
  position: number;
  isRequired: boolean;
  isVisible: boolean;
};

type PreviewModule = {
  id: string;
  title: string;
  position: number;
  isVisible: boolean;
  lectures: Array<{
    id: string;
    title: string;
    position: number;
    isVisible: boolean;
    materials: PreviewMaterial[];
  }>;
};

export type ProgrammingCopyFacts = {
  materialId: string;
  hasTests: boolean;
  hasSolutions: boolean;
  invalidSolutions: boolean;
  hasLegacySolution: boolean;
  starterDigest: string | null;
};

export function starterDigest(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

// Use the same trim characters in JavaScript and PostgreSQL's projected checks.
const solutionWhitespace = "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";

export async function readCourseImportPreview(
  tx: Prisma.TransactionClient,
  where: Prisma.CourseWhereInput,
) {
  const source = await tx.course.findFirst({
    where,
    select: {
      id: true, academyId: true, title: true, isVisible: true, contentRevision: true, language: true,
      academy: { select: { name: true } },
    },
  });
  if (!source) return null;

  // Unlike a learner outline, this needs hidden nodes and no authored text.
  const modules = await tx.$queryRaw<PreviewModule[]>`
    SELECT m.id, m.title, m.position, m.is_visible AS "isVisible",
      COALESCE((SELECT json_agg(json_build_object(
        'id', l.id, 'title', l.title, 'position', l.position, 'isVisible', l.is_visible,
        'materials', COALESCE((SELECT json_agg(json_build_object(
          'id', mt.id, 'lectureId', mt.lecture_id, 'title', mt.title, 'type', mt.type,
          'position', mt.position, 'isRequired', mt.is_required, 'isVisible', mt.is_visible
        ) ORDER BY mt.position, mt.id) FROM materials mt WHERE mt.lecture_id = l.id), '[]')
      ) ORDER BY l.position, l.id) FROM lectures l WHERE l.course_module_id = m.id), '[]') AS lectures
    FROM course_modules m WHERE m.course_id = ${source.id}::uuid ORDER BY m.position, m.id`;
  const ids = modules.flatMap((module) =>
    module.lectures.flatMap((lecture) => lecture.materials.map((material) => material.id)),
  );
  const materialWhere = { materialId: { in: ids } };

  // Each supported relation can exist on a legacy material of a different
  // type. Keep that coverage without fetching private solutions/test payloads.
  const [programming, manuals, pdfs, videos, explanations, facts] = ids.length
    ? await Promise.all([
        tx.programmingExercise.findMany({
          where: materialWhere,
          select: {
            materialId: true, quiz: true, description: true, referencePdfMaterialId: true,
            sourceProject: true, language: true, submissionPolicy: true, gradingMode: true,
            gradingSemanticVersion: true,
          },
        }),
        tx.manualMaterial.findMany({
          where: materialWhere,
          select: {
            materialId: true, multipleChoice: true, shortAnswer: true, description: true, files: true,
            entryPoint: true, assets: true, modelAnswer: true, solutionAssets: true, solutionFiles: true,
            hint: true, width: true, height: true, timeLimitSeconds: true, memoryLimitMb: true,
            runtimeVersion: true, submitEnabled: true, includeInScore: true, maximumHundredths: true,
            revision: true,
          },
        }),
        tx.pdfDocument.findMany({
          where: materialWhere,
          include: { asset: { select: { state: true } } },
        }),
        tx.videoLesson.findMany({
          where: materialWhere,
          include: { asset: { select: { id: true, academyId: true, state: true } } },
        }),
        tx.explanationMaterial.findMany({
          where: materialWhere,
          select: { materialId: true, body: true, sideBody: true },
        }),
        tx.$queryRaw<ProgrammingCopyFacts[]>`
          SELECT p.material_id AS "materialId",
            EXISTS (SELECT FROM exercise_test_cases t WHERE t.exercise_material_id = p.material_id) AS "hasTests",
            solution."hasSolutions", solution."invalidSolutions",
            COALESCE(btrim(p.solution_code, ${solutionWhitespace}) <> '', false) AS "hasLegacySolution",
            CASE WHEN p.source_project IS NOT NULL AND p.source_project <> 'null'::jsonb
              THEN encode(sha256(convert_to(p.starter_code, 'UTF8')), 'hex') END AS "starterDigest"
          FROM programming_exercises p
          CROSS JOIN LATERAL (
            SELECT count(*) > 0 AS "hasSolutions",
              COALESCE(bool_or(btrim(s.code, ${solutionWhitespace}) = ''), false) AS "invalidSolutions"
            FROM programming_exercise_solutions s WHERE s.material_id = p.material_id
          ) solution
          WHERE p.material_id = ANY(${ids}::uuid[])`,
      ])
    : [[], [], [], [], [], []] as const;

  const factsById = byMaterial(facts);
  const programmingById = byMaterial(programming);
  const manualById = byMaterial(manuals);
  const pdfById = byMaterial(pdfs);
  const videoById = byMaterial(videos);
  const explanationById = byMaterial(explanations);
  return {
    ...source,
    modules: modules.map((module) => ({
      ...module,
      lectures: module.lectures.map((lecture) => ({
        ...lecture,
        materials: lecture.materials.map((material) => {
          const exercise = programmingById.get(material.id);
          return {
            ...material,
            programmingExercise: exercise
              ? { ...exercise, facts: factsById.get(material.id)! }
              : null,
            manualMaterial: manualById.get(material.id) ?? null,
            pdfDocument: pdfById.get(material.id) ?? null,
            videoLesson: videoById.get(material.id) ?? null,
            explanationMaterial: explanationById.get(material.id) ?? null,
          };
        }),
      })),
    })),
  };
}

function byMaterial<T extends { materialId: string }>(rows: readonly T[]) {
  return new Map(rows.map((row) => [row.materialId, row]));
}

export type CourseImportPreviewSource = NonNullable<Awaited<ReturnType<typeof readCourseImportPreview>>>;
