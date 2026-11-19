import { Prisma } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { Big } from "./canonical.js";

/**
 * One course, read in one statement (design §7.2).
 *
 * `digest` mode returns large text as `{ $h: sha256 }` computed in SQL, which
 * is what a sync run needs to compare a copy against a release without
 * pulling test data across the wire. `full` mode returns `{ $t: text }`, and
 * can be narrowed to some materials, for the units a run actually writes and
 * for capturing a release.
 *
 * No access is decided here. Callers pass a course id their own gate, or a
 * job's lease, already resolved.
 */

export type ProjectionMode = "full" | "digest";

type Db = Pick<PrismaService, "$queryRaw">;

export type ProjectedTestCase = {
  syncKey: string;
  position: number;
  input: Big;
  expectedOutput: Big;
  visibility: "SAMPLE" | "HIDDEN";
  comparator: string;
  weight: number;
  timeLimitMsOverride: number | null;
  softTimeLimitMs: number | null;
  softPenalty: number | null;
  label: string | null;
};
export type ProjectedHint = {
  syncKey: string;
  position: number;
  content: string;
  triggerExpression: string | null;
};
export type ProjectedSolution = {
  syncKey: string;
  position: number;
  title: string | null;
  code: Big;
};

export type ProjectedExercise = {
  externalKey: string;
  difficulty: string;
  description: Big;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  starterCode: Big;
  language: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  totalTimeLimitMs: number | null;
  comparatorTimeLimitMs: number | null;
  gradingMode: string;
  inputPromptPolicy: string;
  continuationPolicy: string;
  exitStatusPolicy: string;
  materialMaximumHundredths: number | null;
  materialScorePolicy: string | null;
  gradingSemanticVersion: string;
  submissionPolicy: string;
  manualMaximumHundredths: number;
  manualIncludeInScore: boolean;
  feedbackPolicy: unknown;
  sourceProject: unknown;
  aiFeedbackEnabled: boolean;
  quiz: unknown;
  referencePdfMaterialId: string | null;
  gradingRevision: number;
  testCases: ProjectedTestCase[];
  hints: ProjectedHint[];
  solutions: ProjectedSolution[];
};

export type ProjectedManual = {
  description: Big;
  files: Record<string, Big>;
  entryPoint: string;
  assets: Array<{ assetId: string; name: string; byteSize: number }>;
  modelAnswer: string;
  solutionAssets: Array<{ assetId: string; name: string; byteSize: number }>;
  solutionFiles: Record<string, Big> | null;
  hint: string;
  width: number;
  height: number;
  timeLimitSeconds: number;
  memoryLimitMb: number;
  runtimeVersion: string;
  submitEnabled: boolean;
  includeInScore: boolean;
  maximumHundredths: number;
  multipleChoice: unknown;
  shortAnswer: unknown;
  revision: number;
};

export type ProjectedVideo = {
  assetId: string;
  description: Big;
  placement: string;
  includeInScore: boolean;
  maximumHundredths: number;
  thresholdBasisPoints: number;
  captions: unknown[];
  assets: Array<{ assetId: string; name: string; byteSize: number }>;
  revision: number;
};

export type ProjectedMaterial = {
  id: string;
  type: string;
  title: string;
  position: number;
  isRequired: boolean;
  isVisible: boolean;
  explanation: { body: Big; sideBody: Big | null; revision: number } | null;
  video: ProjectedVideo | null;
  pdf: { assetId: string; placement: string; revision: number } | null;
  exercise: ProjectedExercise | null;
  manual: ProjectedManual | null;
};

export type ProjectedLecture = {
  id: string;
  externalKey: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  materials: ProjectedMaterial[];
};

export type ProjectedModule = {
  id: string;
  externalKey: string;
  title: string;
  description: string;
  position: number;
  isVisible: boolean;
  lectures: ProjectedLecture[];
};

export type ProjectedLink = {
  nodeKey: string;
  kind: "COURSE" | "MODULE" | "LECTURE" | "MATERIAL";
  localId: string | null;
  state: "LINKED" | "LOCAL_DELETED" | "ARCHIVED" | "DETACHED" | "CLOSED";
  meta: {
    optionMap?: Record<string, string>;
    legacyUnmatched?: boolean;
    legacyDeletedBase?: {
      nodeKey: string;
      kind: string;
      materialType: string | null;
      parentKey: string | null;
      ordinal: number;
      unitHashes: Record<string, string>;
    };
  } | null;
  archivedVisibility: boolean | null;
};

export type ProjectedCourse = {
  id: string;
  academyId: string;
  title: string;
  description: string;
  language: string;
  contentRevision: number;
  isVisible: boolean;
  modules: ProjectedModule[];
  links: ProjectedLink[];
};

function bigColumn(
  mode: ProjectionMode,
  column: Prisma.Sql,
  nullable = false,
): Prisma.Sql {
  const value =
    mode === "full"
      ? Prisma.sql`json_build_object('$t', ${column})`
      : Prisma.sql`json_build_object('$h', encode(sha256(convert_to(${column}, 'UTF8')), 'hex'))`;
  return nullable
    ? Prisma.sql`CASE WHEN ${column} IS NULL THEN NULL ELSE ${value} END`
    : value;
}

/** A `{ path: text }` JSON map with each text tagged as a big value. */
function bigMap(
  mode: ProjectionMode,
  column: Prisma.Sql,
  nullable = false,
): Prisma.Sql {
  const each =
    mode === "full"
      ? Prisma.sql`json_build_object('$t', f.value)`
      : Prisma.sql`json_build_object('$h', encode(sha256(convert_to(f.value, 'UTF8')), 'hex'))`;
  const map = Prisma.sql`coalesce((SELECT json_object_agg(f.key, ${each} ORDER BY f.key) FROM jsonb_each_text(${column}) f), '{}'::json)`;
  return nullable
    ? Prisma.sql`CASE WHEN ${column} IS NULL OR jsonb_typeof(${column}) <> 'object' THEN NULL ELSE ${map} END`
    : map;
}

export async function readCourseProjection(
  db: Db,
  courseId: string,
  options: { mode: ProjectionMode; materialIds?: readonly string[] },
): Promise<ProjectedCourse | null> {
  const mode = options.mode;
  const filtered = options.materialIds !== undefined;
  const ids = [...new Set(options.materialIds ?? [])];
  const materialFilter = filtered
    ? Prisma.sql`AND mt.id = ANY(${ids}::uuid[])`
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ doc: ProjectedCourse }>>(Prisma.sql`
    SELECT json_build_object(
      'id', c.id, 'academyId', c.academy_id, 'title', c.title, 'description', c.description,
      'language', c.language, 'contentRevision', c.content_revision, 'isVisible', c.is_visible,
      'modules', coalesce((SELECT json_agg(json_build_object(
        'id', cm.id, 'externalKey', cm.external_key, 'title', cm.title, 'description', cm.description,
        'position', cm.position, 'isVisible', cm.is_visible,
        'lectures', coalesce((SELECT json_agg(json_build_object(
          'id', l.id, 'externalKey', l.external_key, 'title', l.title, 'description', l.description,
          'position', l.position, 'isVisible', l.is_visible,
          'materials', coalesce((SELECT json_agg(json_build_object(
            'id', mt.id, 'type', mt.type, 'title', mt.title, 'position', mt.position,
            'isRequired', mt.is_required, 'isVisible', mt.is_visible,
            'explanation', (SELECT json_build_object(
                'body', ${bigColumn(mode, Prisma.sql`e.body`)},
                'sideBody', ${bigColumn(mode, Prisma.sql`e.side_body`, true)},
                'revision', e.revision)
              FROM explanation_materials e WHERE e.material_id = mt.id),
            'video', (SELECT json_build_object(
                'assetId', v.asset_id, 'description', ${bigColumn(mode, Prisma.sql`v.description`)},
                'placement', v.placement, 'includeInScore', v.include_in_score,
                'maximumHundredths', v.maximum_hundredths, 'thresholdBasisPoints', v.threshold_basis_points,
                'captions', v.captions, 'assets', v.assets, 'revision', v.revision)
              FROM video_lessons v WHERE v.material_id = mt.id),
            'pdf', (SELECT json_build_object('assetId', d.asset_id, 'placement', d.placement, 'revision', d.revision)
              FROM pdf_documents d WHERE d.material_id = mt.id),
            'exercise', (SELECT json_build_object(
                'externalKey', pe.external_key, 'difficulty', pe.difficulty,
                'description', ${bigColumn(mode, Prisma.sql`pe.description`)},
                'inputFormat', pe.input_format, 'outputFormat', pe.output_format, 'constraints', pe.constraints,
                'starterCode', ${bigColumn(mode, Prisma.sql`pe.starter_code`)},
                'language', pe.language, 'timeLimitMs', pe.time_limit_ms, 'memoryLimitMb', pe.memory_limit_mb,
                'totalTimeLimitMs', pe.total_time_limit_ms, 'comparatorTimeLimitMs', pe.comparator_time_limit_ms,
                'gradingMode', pe.grading_mode, 'inputPromptPolicy', pe.input_prompt_policy,
                'continuationPolicy', pe.continuation_policy, 'exitStatusPolicy', pe.exit_status_policy,
                'materialMaximumHundredths', pe.material_maximum_hundredths,
                'materialScorePolicy', pe.material_score_policy,
                'gradingSemanticVersion', pe.grading_semantic_version,
                'submissionPolicy', pe.submission_policy,
                'manualMaximumHundredths', pe.manual_maximum_hundredths,
                'manualIncludeInScore', pe.manual_include_in_score,
                'feedbackPolicy', pe.feedback_policy, 'aiFeedbackEnabled', pe.ai_feedback_enabled,
                'sourceProject', pe.source_project,
                'quiz', pe.quiz, 'referencePdfMaterialId', pe.reference_pdf_material_id,
                'gradingRevision', pe.grading_revision,
                'testCases', coalesce((SELECT json_agg(json_build_object(
                    'syncKey', tc.sync_key, 'position', tc.position,
                    'input', ${bigColumn(mode, Prisma.sql`tc.input`)},
                    'expectedOutput', ${bigColumn(mode, Prisma.sql`tc.expected_output`)},
                    'visibility', tc.visibility, 'comparator', tc.comparator, 'weight', tc.weight,
                    'timeLimitMsOverride', tc.time_limit_ms_override, 'softTimeLimitMs', tc.soft_time_limit_ms,
                    'softPenalty', tc.soft_penalty, 'label', tc.label) ORDER BY tc.position, tc.id)
                  FROM exercise_test_cases tc WHERE tc.exercise_material_id = pe.material_id), '[]'::json),
                'hints', coalesce((SELECT json_agg(json_build_object(
                    'syncKey', h.sync_key, 'position', h.position, 'content', h.content,
                    'triggerExpression', h.trigger_expression) ORDER BY h.position, h.id)
                  FROM exercise_hints h WHERE h.exercise_material_id = pe.material_id), '[]'::json),
                'solutions', coalesce((SELECT json_agg(json_build_object(
                    'syncKey', s.sync_key, 'position', s.position, 'title', s.title,
                    'code', ${bigColumn(mode, Prisma.sql`s.code`)}) ORDER BY s.position, s.id)
                  FROM programming_exercise_solutions s WHERE s.material_id = pe.material_id), '[]'::json))
              FROM programming_exercises pe WHERE pe.material_id = mt.id),
            'manual', (SELECT json_build_object(
                'description', ${bigColumn(mode, Prisma.sql`mm.description`)},
                'files', ${bigMap(mode, Prisma.sql`mm.files`)},
                'entryPoint', mm.entry_point, 'assets', mm.assets, 'modelAnswer', mm.model_answer,
                'solutionAssets', mm.solution_assets,
                'solutionFiles', ${bigMap(mode, Prisma.sql`mm.solution_files`, true)},
                'hint', mm.hint, 'width', mm.width, 'height', mm.height,
                'timeLimitSeconds', mm.time_limit_seconds, 'memoryLimitMb', mm.memory_limit_mb,
                'runtimeVersion', mm.runtime_version, 'submitEnabled', mm.submit_enabled,
                'includeInScore', mm.include_in_score, 'maximumHundredths', mm.maximum_hundredths,
                'multipleChoice', mm.multiple_choice, 'shortAnswer', mm.short_answer, 'revision', mm.revision)
              FROM manual_materials mm WHERE mm.material_id = mt.id)
          ) ORDER BY mt.position, mt.id)
          FROM materials mt WHERE mt.lecture_id = l.id ${materialFilter}), '[]'::json)
        ) ORDER BY l.position, l.id)
        FROM lectures l WHERE l.course_module_id = cm.id), '[]'::json)
      ) ORDER BY cm.position, cm.id)
      FROM course_modules cm WHERE cm.course_id = c.id), '[]'::json),
      'links', coalesce((SELECT json_agg(json_build_object(
          'nodeKey', k.node_key, 'kind', k.kind, 'localId', k.local_id, 'state', k.state,
          'meta', k.meta, 'archivedVisibility', k.archived_visibility) ORDER BY k.node_key)
        FROM library_sync_links k WHERE k.copy_course_id = c.id), '[]'::json)
    ) AS doc
    FROM courses c
    WHERE c.id = ${courseId}::uuid
  `);
  return rows[0]?.doc ?? null;
}
