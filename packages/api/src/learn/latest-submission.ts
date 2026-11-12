import { manualProgrammingLatest } from "./programming-assessment.js";
import type { LatestSubmission } from '@cove/shared';

export function automaticLatestSubmission(row: {
  id: string; createdAt: Date; status: string; score: number | null;
  sourceMaterialId?: string; submissionPolicy?: string; manualAssessmentSnapshot?: unknown; manualReviewResult?: unknown;
  appliedScoreHundredths?: number | null; materialMaximumHundredths?: number | null; gradingAborted?: boolean;
} | null): LatestSubmission | null {
  if (!row) return null;
  if (row.submissionPolicy === "MANUAL_REVIEW") return manualProgrammingLatest({...row, sourceMaterialId: row.sourceMaterialId ?? row.id, manualAssessmentSnapshot: row.manualAssessmentSnapshot});
  const graded = ['PASSED', 'FAILED'].includes(row.status) && !row.gradingAborted;
  return { submissionId: row.id, createdAt: row.createdAt.toISOString(),
    maximumHundredths: row.materialMaximumHundredths ?? 10000,
    scoreHundredths: graded ? row.appliedScoreHundredths ?? (row.score ?? 0) * 100 : null,
    status: graded ? 'GRADED' : row.status === 'CANCELLED' ? 'CANCELLED'
      : row.status === 'ERRORED' || row.gradingAborted ? 'ERROR' : 'PENDING' };
}
