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

/** Latest manual results for an outline, without relation-level round trips. */
export function readManualOutlineResults(db: Prisma.TransactionClient, materialIds: string[], userId: string, classId?: string) {
  if (!materialIds.length) return Promise.resolve([]);
  return db.$queryRaw<Array<{ materialId: string; includeInScore: boolean; maximumHundredths: number;
    completed: boolean | null; scoreHundredths: number | null }>>`
    SELECT DISTINCT ON (s.material_id) s.material_id AS "materialId", s.include_in_score AS "includeInScore", s.maximum_hundredths AS "maximumHundredths",
      COALESCE(r.completed, CASE WHEN a.status = 'GRADED' THEN a.completed END, CASE WHEN q.status = 'GRADED' THEN q.completed END) AS completed,
      COALESCE(r.score_hundredths, CASE WHEN a.status = 'GRADED' THEN a.score_hundredths END, CASE WHEN q.status = 'GRADED' THEN q.score_hundredths END) AS "scoreHundredths"
    FROM manual_submissions s
    LEFT JOIN LATERAL (SELECT completed, score_hundredths FROM manual_reviews r WHERE r.submission_id = s.id ORDER BY version DESC LIMIT 1) r ON true
    LEFT JOIN multiple_choice_assessments a ON a.submission_id = s.id
    LEFT JOIN short_answer_assessments q ON q.submission_id = s.id
    WHERE s.user_id = ${userId}::uuid AND s.material_id = ANY(${materialIds}::uuid[])
      AND (${classId ?? null}::uuid IS NULL OR s.class_id = ${classId ?? null}::uuid)
    ORDER BY s.material_id, s.created_at DESC, s.id DESC`;
}
/** Main video completions at the current asset, in one statement. */
export function readVideoOutlineResults(db: Prisma.TransactionClient, materialIds: string[], userId: string, classId?: string) {
  if (!materialIds.length) return Promise.resolve([]);
  return db.$queryRaw<Array<{ materialId: string; completed: boolean; maximumHundredths: number; includeInScore: boolean }>>`
    SELECT DISTINCT ON (p.material_id) p.material_id AS "materialId", p.completed, p.maximum_hundredths AS "maximumHundredths", v.include_in_score AS "includeInScore"
    FROM video_watch_progress p JOIN video_lessons v ON v.material_id = p.material_id AND v.asset_id = p.asset_id
    WHERE p.user_id = ${userId}::uuid AND p.material_id = ANY(${materialIds}::uuid[]) AND v.placement <> 'SUPPLEMENTARY'
      AND (${classId ?? null}::uuid IS NULL OR p.class_id = ${classId ?? null}::uuid)
    ORDER BY p.material_id, p.updated_at DESC, p.id DESC`;
}
