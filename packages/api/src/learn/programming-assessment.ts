import { programmingAssessmentSchema, programmingAssessmentSnapshotSchema, type LatestSubmission, type SubmissionResult } from '@cove/shared';

export function programmingAssessment(row: { manualAssessmentSnapshot: unknown; manualReviewResult?: unknown }) {
  const snapshot = programmingAssessmentSnapshotSchema.parse(row.manualAssessmentSnapshot);
  return programmingAssessmentSchema.parse(row.manualReviewResult ?? {
    ...snapshot, state: 'AWAITING_REVIEW', scoreHundredths: null, completed: null,
    feedback: '', reviewerName: null, reviewedAt: null, reviewVersion: 0,
  });
}
export function manualProgrammingResult(row: {
  id: string; sourceMaterialId: string; createdAt: Date; manualAssessmentSnapshot: unknown; manualReviewResult?: unknown;
}): SubmissionResult {
  return {
    submissionId: row.id, materialId: row.sourceMaterialId, status: 'RECORDED',
    submissionPolicy: 'MANUAL_REVIEW', manualAssessment: programmingAssessment(row),
    score: null, passedCount: 0, totalCount: 0, cases: [], runtimeMs: null,
    failureReason: null, elapsedSec: 0, attemptCount: 0, createdAt: row.createdAt.toISOString(),
    gradedAt: null, earnedWeight: null, possibleWeight: null,
  };
}
export function manualProgrammingLatest(row: Parameters<typeof manualProgrammingResult>[0]): LatestSubmission {
  const assessment = programmingAssessment(row);
  return { submissionId: row.id, createdAt: row.createdAt.toISOString(),
    submissionPolicy: 'MANUAL_REVIEW', status: assessment.state, reviewVersion: assessment.reviewVersion,
    scoreHundredths: assessment.scoreHundredths, maximumHundredths: assessment.maximumHundredths };
}
