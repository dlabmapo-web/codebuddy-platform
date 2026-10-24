'use client';

import { useQuery } from '@tanstack/react-query';
import { shouldPollLatestSubmission } from '@cove/shared';
import { orpc } from '@/lib/orpc';

export function useLatestSubmission(input: {
  academyId: string; materialId: string; classId?: string; mode: 'student' | 'staff-practice'; preview?: boolean; gradingRevision?: number;
}, userId: string, enabled = true) {
  return useQuery({
    queryKey: ['latest-submission', userId, input.academyId, input.materialId, input.mode, input.classId, input.preview ?? false, input.gradingRevision],
    queryFn: () => orpc.learn.getLatestSubmission(input), enabled, staleTime: 0, retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: query => shouldPollLatestSubmission(query.state.data, Date.now()) ? 1000 : false,
  });
}
