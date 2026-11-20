'use client';

import type { DeleteImpactInput } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';

/**
 * Students' work a delete takes with it (QA-004). Managers and Team Leads may
 * delete content students have submitted to; the dialog says how much is lost
 * before they confirm. Read only while the dialog is open: one request, one
 * statement on the server.
 */
export function DeleteImpactNotice({ input, open }: { input: DeleteImpactInput; open: boolean }) {
  const { t } = useTranslation('destructive');
  const impact = useQuery({
    queryKey: ['delete-impact', input.academyId, input.courseId, input.target],
    queryFn: ({ signal }) => orpc.academyCourses.deleteImpact(input, { signal }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  if (!open) return null;
  if (impact.isPending)
    return <p className="mt-3 text-[13.5px] text-sub">{t('student_work.checking')}</p>;
  if (impact.isError)
    return <p className="mt-3 text-[13.5px] text-danger">{t('student_work.check_failed')}</p>;

  const count = impact.data.submissions + impact.data.manualSubmissions;
  if (count === 0) return null;
  return (
    <div
      className="mt-4 flex items-start gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-4 py-3"
      role="alert"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="text-[14px] leading-6 text-danger">
        <p className="font-bold">{t('student_work.heading')}</p>
        <p>{t('student_work.count', { count, from: t('student_work.students', { count: impact.data.students }) })}</p>
      </div>
    </div>
  );
}
