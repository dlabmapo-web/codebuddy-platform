'use client';
import type { LatestSubmission } from "@cove/shared";

import { useSubmissionStatus } from './use-submission-status';
import { orpc } from '@/lib/orpc';

export function useLatestSubmission(input: {
  academyId: string; materialId: string; classId?: string; mode: 'student' | 'staff-practice'; preview?: boolean; gradingRevision?: number;
}, userId: string, enabled = true, seed?: LatestSubmission | null) {
  return useSubmissionStatus({
    queryKey: ['latest-submission', userId, input.academyId, input.materialId, input.mode, input.classId, input.preview ?? false, input.gradingRevision],
    read: signal => orpc.learn.getLatestSubmission(input, { signal }), enabled, seed,
  });
}
