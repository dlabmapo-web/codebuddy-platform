import type { Prisma } from '../generated/prisma/client.js';

/** Current revisions and newest manual assessment joined in the existing revision statement. */
export function readAssessmentRevisions(db: Prisma.TransactionClient, materialIds: string[], userId: string, classId?: string) {
  return db.$queryRaw<Array<{materialId: string; gradingRevision: number; submissionPolicy: string;
    manualIncludeInScore: boolean; manualMaximumHundredths: number; manualAssessmentSnapshot: unknown;
    manualReviewResult: unknown}>>`
    SELECT pe.material_id AS "materialId", pe.grading_revision AS "gradingRevision", pe.submission_policy::text AS "submissionPolicy",
      pe.manual_include_in_score AS "manualIncludeInScore", pe.manual_maximum_hundredths AS "manualMaximumHundredths",
      s.manual_assessment_snapshot AS "manualAssessmentSnapshot", (s.manual_review_result - 'feedback') || '{"feedback":""}'::jsonb AS "manualReviewResult"
    FROM programming_exercises pe LEFT JOIN LATERAL (
      SELECT manual_assessment_snapshot,manual_review_result FROM submissions s
      WHERE s.material_id=pe.material_id AND s.source_material_id=pe.material_id AND s.user_id=${userId}::uuid
        AND s.class_id=${classId ?? null}::uuid AND s.submission_policy='MANUAL_REVIEW'
        AND s.grading_revision=pe.grading_revision AND s.regrade_run_id IS NULL
      ORDER BY s.created_at DESC,s.id DESC LIMIT 1
    ) s ON pe.submission_policy='MANUAL_REVIEW'
    WHERE pe.material_id=ANY(${materialIds}::uuid[])
  `;
}
/** A bounded batch for teacher mixed-material history; no query per student or attempt. */
export function readManualProgrammingHistory(db: Prisma.TransactionClient, materialIds: string[], userIds: string[], classId: string) {
  if (!materialIds.length || !userIds.length) return Promise.resolve([]);
  return db.$queryRaw<Array<{materialId: string; userId: string; gradingRevision: number; createdAt: Date;
    submissions: number; manualAssessmentSnapshot: unknown; manualReviewResult: unknown}>>`
    SELECT DISTINCT ON (s.material_id,s.user_id) s.material_id AS "materialId",s.user_id AS "userId",
      s.grading_revision AS "gradingRevision",s.created_at AS "createdAt",s.manual_assessment_snapshot AS "manualAssessmentSnapshot",
      (s.manual_review_result - 'feedback') || '{"feedback":""}'::jsonb AS "manualReviewResult", (count(*) OVER (PARTITION BY s.material_id,s.user_id))::int AS submissions
    FROM submissions s WHERE s.material_id=ANY(${materialIds}::uuid[]) AND s.user_id=ANY(${userIds}::uuid[])
      AND s.class_id=${classId}::uuid AND s.source_material_id=s.material_id
      AND s.submission_policy='MANUAL_REVIEW' AND s.regrade_run_id IS NULL
    ORDER BY s.material_id,s.user_id,s.created_at DESC,s.id DESC
  `;
}
