import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { VisibleCourse } from "./curriculum-outline.service.js";

export type CurriculumModules = VisibleCourse["modules"];
type Module = CurriculumModules[number];
type Lecture = Module["lectures"][number];
type Material = Lecture["materials"][number];
type Timestamps<T> = Omit<T, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };
type MaterialJson = Timestamps<Omit<Material, "videoLesson">> & {
  videoLesson: (Omit<NonNullable<Material["videoLesson"]>, "asset"> & {
    asset: Omit<NonNullable<Material["videoLesson"]>["asset"], "byteSize"> & { byteSize: string };
  }) | null;
};
type ModuleJson = Timestamps<Omit<Module, "lectures">> & {
  lectures: Array<Timestamps<Omit<Lecture, "materials">> & { materials: MaterialJson[] }>;
};

/**
 * The curriculum hierarchy of each course, in one statement.
 *
 * Prisma loads `visibleCurriculumInclude` one relation level per statement —
 * about nine round trips per course, including empty optional relations. This
 * reads the same rows with the same filters (every visibility flag, or none
 * for an authorized `preview`), the same `position, id` order and the same
 * narrowed fields, and rebuilds the same objects in the same key order. No
 * access is decided here; callers pass ids their own gate already resolved.
 * The parity integration test compares it with the Prisma include.
 */
export async function readCurricula(
  db: Pick<PrismaService, "$queryRaw">,
  courseIds: readonly string[],
  preview = false,
): Promise<Map<string, CurriculumModules>> {
  const ids = [...new Set(courseIds)];
  if (!ids.length) return new Map();
  // `json`, not `jsonb`: jsonb reorders keys, and the rebuilt objects below
  // must keep the order Prisma produces.
  const rows = await db.$queryRaw<Array<{ courseId: string; modules: ModuleJson[] }>>(Prisma.sql`
    SELECT c.id AS "courseId", coalesce((SELECT json_agg(json_build_object(
        'id', cm.id, 'courseId', cm.course_id, 'externalKey', cm.external_key, 'title', cm.title,
        'description', cm.description, 'position', cm.position, 'isVisible', cm.is_visible,
        'createdAt', cm.created_at, 'updatedAt', cm.updated_at,
        'lectures', coalesce((SELECT json_agg(json_build_object(
            'id', l.id, 'courseModuleId', l.course_module_id, 'externalKey', l.external_key, 'title', l.title,
            'description', l.description, 'position', l.position, 'isVisible', l.is_visible,
            'createdAt', l.created_at, 'updatedAt', l.updated_at,
            'materials', coalesce((SELECT json_agg(json_build_object(
                'id', mt.id, 'lectureId', mt.lecture_id, 'type', mt.type, 'title', mt.title, 'position', mt.position,
                'isRequired', mt.is_required, 'isVisible', mt.is_visible, 'createdAt', mt.created_at, 'updatedAt', mt.updated_at,
                'programmingExercise', (SELECT json_build_object('difficulty', pe.difficulty,
                    'submissionPolicy', pe.submission_policy, 'referencePdfMaterialId', pe.reference_pdf_material_id,
                    'manualMaximumHundredths', pe.manual_maximum_hundredths, 'manualIncludeInScore', pe.manual_include_in_score)
                  FROM programming_exercises pe WHERE pe.material_id = mt.id),
                'manualMaterial', (SELECT json_build_object('includeInScore', mm.include_in_score,
                    'maximumHundredths', mm.maximum_hundredths)
                  FROM manual_materials mm WHERE mm.material_id = mt.id),
                -- byte_size is a BIGINT; text keeps values past 2^53 exact.
                'videoLesson', (SELECT json_build_object('assetId', vl.asset_id, 'revision', vl.revision,
                    'placement', vl.placement, 'includeInScore', vl.include_in_score, 'maximumHundredths', vl.maximum_hundredths,
                    'asset', json_build_object('state', va.state, 'durationMs', va.duration_ms,
                      'filename', va.filename, 'byteSize', va.byte_size::text))
                  FROM video_lessons vl JOIN video_assets va ON va.id = vl.asset_id WHERE vl.material_id = mt.id),
                'pdfDocument', (SELECT json_build_object('placement', pd.placement, 'revision', pd.revision,
                    'asset', json_build_object('state', pa.state, 'originalFilename', pa.original_filename,
                      'byteSize', pa.byte_size, 'pageCount', pa.page_count))
                  FROM pdf_documents pd JOIN pdf_assets pa ON pa.id = pd.asset_id WHERE pd.material_id = mt.id)
              ) ORDER BY mt.position, mt.id)
              FROM materials mt WHERE mt.lecture_id = l.id AND (${preview}::boolean OR mt.is_visible)), '[]'::json)
          ) ORDER BY l.position, l.id)
          FROM lectures l WHERE l.course_module_id = cm.id AND (${preview}::boolean OR l.is_visible)), '[]'::json)
      ) ORDER BY cm.position, cm.id)
      FROM course_modules cm WHERE cm.course_id = c.id AND (${preview}::boolean OR cm.is_visible)), '[]'::json) AS modules
    FROM courses c WHERE c.id = ANY(${ids}::uuid[])
  `);
  return new Map(rows.map((row) => [row.courseId, row.modules.map(toModule)]));
}

/** The course with its hierarchy attached, as `include` would have returned it. */
export async function withCurriculum<T extends { id: string }>(
  db: Pick<PrismaService, "$queryRaw">,
  course: T,
  preview = false,
): Promise<T & { modules: CurriculumModules }> {
  const [attached] = await withCurricula(db, [course], preview);
  return attached!;
}

export async function withCurricula<T extends { id: string }>(
  db: Pick<PrismaService, "$queryRaw">,
  courses: readonly T[],
  preview = false,
): Promise<Array<T & { modules: CurriculumModules }>> {
  const trees = await readCurricula(db, courses.map((course) => course.id), preview);
  return courses.map((course) => ({ ...course, modules: trees.get(course.id) ?? [] }));
}

function toModule(row: ModuleJson): Module {
  return {
    id: row.id, courseId: row.courseId, externalKey: row.externalKey, title: row.title,
    description: row.description, position: row.position, isVisible: row.isVisible,
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
    lectures: row.lectures.map((lecture) => ({
      id: lecture.id, courseModuleId: lecture.courseModuleId, externalKey: lecture.externalKey, title: lecture.title,
      description: lecture.description, position: lecture.position, isVisible: lecture.isVisible,
      createdAt: new Date(lecture.createdAt), updatedAt: new Date(lecture.updatedAt),
      materials: lecture.materials.map(toMaterial),
    })),
  };
}

function toMaterial(row: MaterialJson): Material {
  const video = row.videoLesson;
  return {
    id: row.id, lectureId: row.lectureId, type: row.type, title: row.title, position: row.position,
    isRequired: row.isRequired, isVisible: row.isVisible,
    createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt),
    programmingExercise: row.programmingExercise,
    manualMaterial: row.manualMaterial,
    videoLesson: video && { ...video, asset: { ...video.asset, byteSize: BigInt(video.asset.byteSize) } },
    pdfDocument: row.pdfDocument,
  };
}

/** Metadata for the mixed student-history table, scoped to one authorized class. */
export function readClassHistoryMaterials(db: Pick<PrismaService, "$queryRaw">, academyId: string, classId: string) {
  type Row = {id: string; title: string; type: import('../generated/prisma/client.js').MaterialType; position: number; isRequired: boolean;
    programmingExercise: {gradingRevision: number; submissionPolicy: import('../generated/prisma/client.js').SubmissionPolicy; manualMaximumHundredths: number; manualIncludeInScore: boolean} | null;
    manualMaterial: {revision: number; includeInScore: boolean; submitEnabled: boolean} | null;
    lecture: {id: string; title: string; position: number; courseModule: {id: string; title: string; position: number; course: {id: string; title: string}}}};
  return db.$queryRaw<Row[]>`
    SELECT m.id,m.title,m.type,m.position,m.is_required AS "isRequired",
      CASE WHEN pe.material_id IS NOT NULL THEN jsonb_build_object('gradingRevision',pe.grading_revision,
        'submissionPolicy',pe.submission_policy,'manualMaximumHundredths',pe.manual_maximum_hundredths,
        'manualIncludeInScore',pe.manual_include_in_score) END AS "programmingExercise",
      CASE WHEN mm.material_id IS NOT NULL THEN jsonb_build_object('revision',mm.revision,
        'includeInScore',mm.include_in_score,'submitEnabled',mm.submit_enabled) END AS "manualMaterial",
      jsonb_build_object('id',l.id,'title',l.title,'position',l.position,'courseModule',jsonb_build_object(
        'id',cm.id,'title',cm.title,'position',cm.position,'course',jsonb_build_object('id',c.id,'title',c.title))) AS lecture
    FROM materials m JOIN lectures l ON l.id=m.lecture_id JOIN course_modules cm ON cm.id=l.course_module_id
    JOIN courses c ON c.id=cm.course_id JOIN class_courses cc ON cc.course_id=c.id AND cc.class_id=${classId}::uuid
    LEFT JOIN programming_exercises pe ON pe.material_id=m.id LEFT JOIN manual_materials mm ON mm.material_id=m.id
    WHERE c.academy_id=${academyId}::uuid AND c.is_visible AND cm.is_visible AND l.is_visible AND m.is_visible
      AND (pe.material_id IS NOT NULL OR mm.material_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM explanation_materials e WHERE e.material_id=m.id)
        OR EXISTS (SELECT 1 FROM pdf_documents p WHERE p.material_id=m.id)
        OR EXISTS (SELECT 1 FROM video_lessons v WHERE v.material_id=m.id))
    ORDER BY cm.course_id,cm.position,l.position,m.position,m.id
  `;
}
