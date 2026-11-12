import type { Prisma } from '../generated/prisma/client.js';

type AdmissionMaterial = Prisma.MaterialGetPayload<{include: {
  programmingExercise: {include: {testCases: true}},
  lecture: {include: {courseModule: {include: {course: true}}}}
}}>;
function columns<T>(value: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(value).map(([key, value]) => {
    const name = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    return [name, /At$/.test(name) && typeof value === 'string' ? new Date(value) : value];
  })) as T;
}
/** Admission metadata and automatic-only cases in one statement, without a deep include. */
export async function readSubmissionAdmission(db: Prisma.TransactionClient, materialId: string, academyId: string, options: {workspace?: boolean; preview?: boolean} = {}): Promise<AdmissionMaterial | null> {
  const [row] = await db.$queryRaw<Array<{ material: Record<string, unknown>; exercise: Record<string, unknown> | null;
    tests: Record<string, unknown>[]; hints: Record<string, unknown>[]; reference: Record<string, unknown> | null; lecture: Record<string, unknown>; module: Record<string, unknown>; course: Record<string, unknown> }>>`
    SELECT to_jsonb(m) AS material, CASE WHEN pe.material_id IS NULL THEN NULL WHEN ${Boolean(options.workspace)}::boolean THEN to_jsonb(pe) - 'solution_code' ELSE jsonb_build_object(
        'materialId',pe.material_id,'quiz',pe.quiz,'language',pe.language,
        'gradingRevision',pe.grading_revision,'submissionPolicy',pe.submission_policy,
        'timeLimitMs',pe.time_limit_ms,'memoryLimitMb',pe.memory_limit_mb,
        'inputPromptPolicy',pe.input_prompt_policy,'gradingMode',pe.grading_mode,
        'gradingSemanticVersion',pe.grading_semantic_version,'totalTimeLimitMs',pe.total_time_limit_ms,
        'comparatorTimeLimitMs',pe.comparator_time_limit_ms,'continuationPolicy',pe.continuation_policy,
        'exitStatusPolicy',pe.exit_status_policy,'materialMaximumHundredths',pe.material_maximum_hundredths,
        'materialScorePolicy',pe.material_score_policy,'feedbackPolicy',pe.feedback_policy,
        'manualMaximumHundredths',pe.manual_maximum_hundredths,'manualIncludeInScore',pe.manual_include_in_score
      ) END AS exercise,
      CASE WHEN pe.submission_policy = 'AUTOMATIC' THEN COALESCE((
        SELECT jsonb_agg(to_jsonb(tc) ORDER BY tc.position, tc.id)
        FROM exercise_test_cases tc WHERE tc.exercise_material_id = m.id
      ), '[]'::jsonb) ELSE '[]'::jsonb END AS tests,
      CASE WHEN ${Boolean(options.workspace)}::boolean THEN COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.position,h.id)
        FROM exercise_hints h WHERE h.exercise_material_id=m.id), '[]'::jsonb) ELSE '[]'::jsonb END AS hints,
      CASE WHEN ${Boolean(options.workspace)}::boolean THEN (SELECT to_jsonb(pd) || jsonb_build_object('asset',to_jsonb(pa),
        'material',jsonb_build_object('id',pm.id,'isVisible',pm.is_visible,'lecture',jsonb_build_object('isVisible',pl.is_visible,
          'courseModule',jsonb_build_object('isVisible',pcm.is_visible,'courseId',pcm.course_id))))
        FROM pdf_documents pd JOIN pdf_assets pa ON pa.id=pd.asset_id JOIN materials pm ON pm.id=pd.material_id
        JOIN lectures pl ON pl.id=pm.lecture_id JOIN course_modules pcm ON pcm.id=pl.course_module_id
        WHERE pd.material_id=pe.reference_pdf_material_id) ELSE NULL END AS reference,
      jsonb_build_object('id',l.id,'title',l.title,'position',l.position,'course_module_id',l.course_module_id) AS lecture,
      jsonb_build_object('id',cm.id,'title',cm.title,'position',cm.position,'course_id',cm.course_id) AS module,
      jsonb_build_object('id',c.id,'title',c.title,'academy_id',c.academy_id,'language',c.language,'description',CASE WHEN ${Boolean(options.workspace)}::boolean THEN c.description ELSE '' END) AS course
    FROM materials m JOIN lectures l ON l.id=m.lecture_id
    JOIN course_modules cm ON cm.id=l.course_module_id JOIN courses c ON c.id=cm.course_id
    LEFT JOIN programming_exercises pe ON pe.material_id=m.id
    WHERE m.id=${materialId}::uuid AND c.academy_id=${academyId}::uuid
      AND (${Boolean(options.preview)}::boolean OR (m.is_visible AND l.is_visible AND cm.is_visible AND c.is_visible))
  `;
  if (!row) return null;
  return { ...columns<AdmissionMaterial>(row.material),
    programmingExercise: row.exercise ? { ...columns<NonNullable<AdmissionMaterial['programmingExercise']>>(row.exercise),
      ...(options.workspace ? {hints: row.hints.map(h => columns(h)), referencePdf: row.reference ? {
        ...columns<Record<string,unknown>>(row.reference), asset: columns<Record<string,unknown>>(row.reference.asset as Record<string,unknown>), material: row.reference.material,
      } : null} : {}),
      testCases: row.tests.map(test => columns<NonNullable<AdmissionMaterial['programmingExercise']>['testCases'][number]>(test)) } : null,
    lecture: { ...columns<AdmissionMaterial['lecture']>(row.lecture), courseModule: {
      ...columns<AdmissionMaterial['lecture']['courseModule']>(row.module),
      course: columns<AdmissionMaterial['lecture']['courseModule']['course']>(row.course),
    } },
  };
}
