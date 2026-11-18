import {
  courseTreeSchema,
  type AvailableLibraryCourse,
  type CourseTree,
} from "@cove/shared";
import { Prisma } from "../generated/prisma/client.js";

type Db = Pick<Prisma.TransactionClient, "$queryRaw">;
type PreviewMaterial =
  CourseTree["modules"][number]["lectures"][number]["materials"][number];
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
type Row = {
  id: string;
  academyId: string;
  releaseId: string;
  language: string;
  revision: number;
  at: string;
  title: string;
  description: string;
  copies: Array<{ courseId: string; title: string }>;
  nodes: Array<{
    id: string;
    kind: string;
    type: string | null;
    parent: string | null;
    ordinal: number;
    values: OutlineValues;
    shortAnswer: boolean;
    pdf: PreviewMaterial["pdfDocument"];
    video: PreviewMaterial["videoLesson"];
  }>;
};

/** Release outline only. No descriptions of problems, answer keys, cases, code or manual bodies cross the wire. */
export async function releasedLibrary(
  db: Db,
  libraryId: string,
  academyId: string,
  courseId?: string,
): Promise<Row[]> {
  const filter = courseId
    ? Prisma.sql`AND c.id = ${courseId}::uuid`
    : Prisma.empty;
  return db.$queryRaw<Row[]>(Prisma.sql`
    SELECT c.id, c.academy_id AS "academyId", r.id AS "releaseId", r.language::text AS language,
      r.library_content_revision AS revision, r.published_at::text AS at,
      coalesce((SELECT v.value #>> '{}' FROM library_release_nodes n JOIN library_sync_values v ON v.hash = n.unit_hashes->>'course.title' WHERE n.release_id=r.id AND n.kind='COURSE'), '') AS title,
      coalesce((SELECT v.value #>> '{}' FROM library_release_nodes n JOIN library_sync_values v ON v.hash = n.unit_hashes->>'course.description' WHERE n.release_id=r.id AND n.kind='COURSE'), '') AS description,
      coalesce((SELECT json_agg(json_build_object('courseId', cp.id, 'title', cp.title) ORDER BY cp.id) FROM courses cp WHERE cp.source_course_id=c.id AND cp.academy_id=${academyId}::uuid), '[]'::json) AS copies,
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
        ) ORDER BY n.ordinal,n.node_key) FROM library_release_nodes n WHERE n.release_id=r.id AND n.kind <> 'COURSE'), '[]'::json) AS nodes
    FROM courses c JOIN LATERAL (SELECT * FROM library_releases r WHERE r.library_course_id=c.id ORDER BY r.number DESC LIMIT 1) r ON true
    WHERE c.academy_id=${libraryId}::uuid AND c.is_visible AND c.retired_at IS NULL ${filter}
    ORDER BY title,c.id`);
}

export function availableRelease(row: Row): AvailableLibraryCourse {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    language: row.language as AvailableLibraryCourse["language"],
    contentRevision: row.revision,
    moduleCount: row.nodes.filter((n) => n.kind === "MODULE").length,
    lectureCount: row.nodes.filter((n) => n.kind === "LECTURE").length,
    exerciseCount: row.nodes.filter((n) => n.type === "PROGRAMMING_EXERCISE")
      .length,
    existingCopies: row.copies,
    updatedAt: new Date(row.at).toISOString(),
  };
}

export function previewRelease(row: Row): CourseTree {
  const children = (id: string) => row.nodes.filter((n) => n.parent === id);
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
      materials: children(l.id).map((n) => ({
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
        pdfDocument: n.pdf,
        videoLesson: n.video,
        manualMaterial: n.values["manual.scoring"]
          ? { revision: 1, ...n.values["manual.scoring"] }
          : null,
      })),
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
      createdAt: new Date(row.at).toISOString(),
      updatedAt: new Date(row.at).toISOString(),
    },
    modules,
  });
}
