import {
  courseTreeSchema,
  pdfMetadataSchema,
  videoMetadataSchema,
  type AvailableLibraryCourse,
  type CourseTree,
} from "@cove/shared";
import { Prisma } from "../generated/prisma/client.js";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;
type OutlineValues = {
  "module.title"?: string;
  "module.description"?: string;
  "lecture.title"?: string;
  "lecture.description"?: string;
  "material.title"?: string;
  "material.required"?: boolean;
  "manual.scoring"?: {
    isRequired: boolean;
    includeInScore: boolean;
    maximumHundredths: number;
    submitEnabled: boolean;
  };
};
type PublishedCourse = {
  id: string;
  academyId: string;
  releaseId: string | null;
  language: AvailableLibraryCourse["language"];
  contentRevision: number;
  updatedAt: Date;
  title: string;
  description: string;
};
type Node = {
  id: string;
  kind: "MODULE" | "LECTURE" | "MATERIAL";
  type: string | null;
  parent: string;
  ordinal: number;
  values: OutlineValues;
  shortAnswer: boolean;
  pdf: unknown;
  video: unknown;
};

function publishedLibrary(libraryId: string, courseId?: string) {
  const filter = courseId ? Prisma.sql`AND c.id = ${courseId}::uuid` : Prisma.empty;
  return Prisma.sql`
    SELECT c.id, c.academy_id AS "academyId", r.id AS "releaseId",
      COALESCE(r.language, c.language)::text AS language,
      COALESCE(r.library_content_revision, c.content_revision) AS "contentRevision",
      COALESCE(r.published_at, c.updated_at) AS "updatedAt",
      CASE WHEN r.id IS NULL THEN c.title ELSE COALESCE((
        SELECT v.value #>> '{}' FROM library_release_nodes n
        JOIN library_sync_values v ON v.hash = n.unit_hashes->>'course.title'
        WHERE n.release_id = r.id AND n.kind = 'COURSE'
      ), '') END AS title,
      CASE WHEN r.id IS NULL THEN c.description ELSE COALESCE((
        SELECT v.value #>> '{}' FROM library_release_nodes n
        JOIN library_sync_values v ON v.hash = n.unit_hashes->>'course.description'
        WHERE n.release_id = r.id AND n.kind = 'COURSE'
      ), '') END AS description
    FROM courses c
    LEFT JOIN LATERAL (
      SELECT id, language, library_content_revision, published_at
      FROM library_releases WHERE library_course_id = c.id
      ORDER BY number DESC LIMIT 1
    ) r ON true
    WHERE c.academy_id = ${libraryId}::uuid AND c.is_visible AND c.retired_at IS NULL ${filter}`;
}

/** Summaries only. Existing copies decorate cards and never filter the catalog. */
export async function readAvailableLibraryCourses(
  db: Db,
  libraryId: string,
  academyId: string,
): Promise<AvailableLibraryCourse[]> {
  const rows = await db.$queryRaw<Array<Omit<AvailableLibraryCourse, "updatedAt"> & { updatedAt: Date }>>(Prisma.sql`
    SELECT c.id, c.title, c.description, c.language, c."contentRevision", c."updatedAt",
      COALESCE(released.modules, legacy.modules) AS "moduleCount",
      COALESCE(released.lectures, legacy.lectures) AS "lectureCount",
      COALESCE(released.exercises, legacy.exercises) AS "exerciseCount",
      COALESCE((SELECT json_agg(json_build_object('courseId', cp.id, 'title', cp.title) ORDER BY cp.id)
        FROM courses cp WHERE cp.source_course_id = c.id AND cp.academy_id = ${academyId}::uuid), '[]'::json) AS "existingCopies"
    FROM (${publishedLibrary(libraryId)}) c
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE n.kind = 'MODULE')::int AS modules,
        count(*) FILTER (WHERE n.kind = 'LECTURE')::int AS lectures,
        count(*) FILTER (WHERE n.kind = 'MATERIAL' AND n.material_type = 'PROGRAMMING_EXERCISE')::int AS exercises
      FROM library_release_nodes n WHERE n.release_id = c."releaseId"
    ) released ON c."releaseId" IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT count(DISTINCT m.id)::int AS modules, count(DISTINCT l.id)::int AS lectures,
        count(*) FILTER (WHERE mt.type = 'PROGRAMMING_EXERCISE')::int AS exercises
      FROM course_modules m LEFT JOIN lectures l ON l.course_module_id = m.id
      LEFT JOIN materials mt ON mt.lecture_id = l.id
      WHERE c."releaseId" IS NULL AND m.course_id = c.id
    ) legacy ON c."releaseId" IS NULL
    ORDER BY c.title, c.id`);
  return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
}

/**
 * One authorized outline snapshot. A published master without a release uses
 * the same legacy tree that adoption will capture as its initial release.
 */
export async function readLibraryCoursePreview(
  db: Db,
  libraryId: string,
  courseId: string,
): Promise<CourseTree | null> {
  const [row] = await db.$queryRaw<Array<PublishedCourse & { nodes: Node[] }>>(Prisma.sql`
    SELECT c.*, CASE WHEN c."releaseId" IS NOT NULL THEN
      coalesce((SELECT json_agg(json_build_object(
        'id', n.node_key, 'kind', n.kind, 'type', n.material_type, 'parent', n.parent_key, 'ordinal', n.ordinal,
        'values', coalesce((SELECT json_object_agg(h.key, v.value) FROM jsonb_each_text(n.unit_hashes) h JOIN library_sync_values v ON v.hash=h.value
          WHERE h.key IN ('module.title','module.description','lecture.title','lecture.description','material.title','material.required','manual.scoring','video.placement','video.scoring')), '{}'::json),
        'shortAnswer', coalesce((SELECT (v.value->>'present')::boolean FROM library_sync_values v WHERE v.hash=n.unit_hashes->>'sa.rule'),false),
        'pdf', (SELECT json_build_object('placement', p.value #>> '{}', 'revision',1,'originalFilename',a.original_filename,'byteSize',a.byte_size,'pageCount',a.page_count)
          FROM library_sync_values f JOIN pdf_assets a ON a.id=(f.value->>'assetId')::uuid JOIN library_sync_values p ON p.hash=n.unit_hashes->>'pdf.placement' WHERE f.hash=n.unit_hashes->>'pdf.file'),
        'video', (SELECT json_build_object('assetId',a.id,'revision',1,'placement',p.value #>> '{}','includeInScore',(s.value->>'includeInScore')::boolean,'maximumHundredths',(s.value->>'maximumHundredths')::int,
          'state',a.state,'durationMs',a.duration_ms,'filename',a.filename,'byteSize',a.byte_size::text)
          FROM library_sync_values f JOIN video_assets a ON a.id=(f.value->>'assetId')::uuid JOIN library_sync_values p ON p.hash=n.unit_hashes->>'video.placement'
          JOIN library_sync_values s ON s.hash=n.unit_hashes->>'video.scoring' WHERE f.hash=n.unit_hashes->>'video.media')
        ) ORDER BY n.ordinal,n.node_key) FROM library_release_nodes n WHERE n.release_id=c."releaseId" AND n.kind <> 'COURSE'), '[]'::json)
    ELSE COALESCE((SELECT json_agg(node.payload ORDER BY node.position, node.id) FROM (
      SELECT m.id, m.position, json_build_object(
        'id', m.id, 'kind', 'MODULE', 'parent', c.id, 'ordinal', m.position - 1,
        'values', json_build_object('module.title', m.title, 'module.description', m.description)
      ) AS payload
      FROM course_modules m WHERE m.course_id = c.id
      UNION ALL
      SELECT l.id, l.position, json_build_object(
        'id', l.id, 'kind', 'LECTURE', 'parent', l.course_module_id, 'ordinal', l.position - 1,
        'values', json_build_object('lecture.title', l.title, 'lecture.description', l.description)
      )
      FROM lectures l JOIN course_modules m ON m.id = l.course_module_id WHERE m.course_id = c.id
      UNION ALL
      SELECT mt.id, mt.position, json_build_object(
        'id', mt.id, 'kind', 'MATERIAL', 'type', mt.type, 'parent', mt.lecture_id, 'ordinal', mt.position - 1,
        'values', json_build_object(
          'material.title', mt.title, 'material.required', mt.is_required,
          'manual.scoring', CASE WHEN mm.material_id IS NOT NULL THEN json_build_object(
            'isRequired', mt.is_required, 'includeInScore', mm.include_in_score,
            'maximumHundredths', mm.maximum_hundredths, 'submitEnabled', mm.submit_enabled
          ) END
        ),
        'shortAnswer', mm.short_answer IS NOT NULL AND mm.short_answer <> 'null'::jsonb,
        'pdf', CASE WHEN pa.id IS NOT NULL THEN json_build_object(
          'placement', pd.placement, 'revision', 1, 'originalFilename', pa.original_filename,
          'byteSize', pa.byte_size, 'pageCount', pa.page_count
        ) END,
        'video', CASE WHEN va.id IS NOT NULL THEN json_build_object(
          'assetId', va.id, 'revision', 1, 'placement', vl.placement, 'includeInScore', vl.include_in_score,
          'maximumHundredths', vl.maximum_hundredths, 'state', va.state, 'durationMs', va.duration_ms,
          'filename', va.filename, 'byteSize', va.byte_size::text
        ) END
      )
      FROM materials mt JOIN lectures l ON l.id = mt.lecture_id
      JOIN course_modules m ON m.id = l.course_module_id
      LEFT JOIN manual_materials mm ON mm.material_id = mt.id
      LEFT JOIN pdf_documents pd ON pd.material_id = mt.id LEFT JOIN pdf_assets pa ON pa.id = pd.asset_id
      LEFT JOIN video_lessons vl ON vl.material_id = mt.id LEFT JOIN video_assets va ON va.id = vl.asset_id
      WHERE m.course_id = c.id
    ) node), '[]'::json) END AS nodes
    FROM (${publishedLibrary(libraryId, courseId)}) c`);
  return row ? toLibraryCoursePreview(row) : null;
}

function toLibraryCoursePreview(row: PublishedCourse & { nodes: Node[] }): CourseTree {
  const childrenByParent = new Map<string, Node[]>();
  for (const node of row.nodes) {
    const siblings = childrenByParent.get(node.parent);
    if (siblings) siblings.push(node);
    else childrenByParent.set(node.parent, [node]);
  }
  const children = (id: string) => childrenByParent.get(id) ?? [];
  const modules = children(row.id).map((m) => ({
    id: m.id,
    title: m.values["module.title"],
    description: m.values["module.description"],
    position: m.ordinal + 1,
    isVisible: true,
    lectures: children(m.id).map((l) => ({
      id: l.id,
      title: l.values["lecture.title"],
      description: l.values["lecture.description"],
      position: l.ordinal + 1,
      isVisible: true,
      materials: children(l.id).map((n) => {
        // Asset metadata is optional in an outline. An incomplete older
        // asset record must not stop the rest of the course from loading.
        const pdf = n.pdf == null ? null : pdfMetadataSchema.safeParse(n.pdf);
        const video = n.video == null ? null : videoMetadataSchema.safeParse(n.video);
        return {
          id: n.id,
          type: n.type,
          title: n.values["material.title"],
          position: n.ordinal + 1,
          isRequired:
            n.values["manual.scoring"]?.isRequired ??
            n.values["material.required"] ??
            false,
          isVisible:
            n.type !== "VIDEO_LESSON" &&
            n.type !== "MULTIPLE_CHOICE" &&
            !n.shortAnswer,
          programmingExercise: null,
          pdfDocument: pdf?.success ? pdf.data : null,
          videoLesson: video?.success ? video.data : null,
          manualMaterial: n.values["manual.scoring"]
            ? { revision: 1, ...n.values["manual.scoring"] }
            : null,
        };
      }),
    })),
  }));
  const all = modules.flatMap((m) => m.lectures.flatMap((l) => l.materials));
  const problems = all.filter((n) => n.type === "PROGRAMMING_EXERCISE");
  return courseTreeSchema.parse({
    course: {
      id: row.id,
      academyId: row.academyId,
      title: row.title,
      description: row.description,
      isVisible: true,
      language: row.language,
      content: {
        modules: modules.length,
        lectures: row.nodes.filter((n) => n.kind === "LECTURE").length,
        exercises: problems.length,
        problems: problems.length,
        visibleExercises: problems.filter((n) => n.isVisible).length,
      },
      provenance: null,
      createdAt: row.updatedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    },
    modules,
  });
}
