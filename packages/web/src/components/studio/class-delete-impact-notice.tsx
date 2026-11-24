'use client';

import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';

/**
 * Students' work a class delete affects, said before anyone confirms.
 *
 * A Manager or Team Lead may delete a class students worked in. Code
 * submissions stay on the students' records without the class; answers and
 * test attempts cannot exist outside a class and go with it. Read only while
 * the dialog is open: one request, one statement after the access check.
 */
export function ClassDeleteImpactNotice({
  academyId,
  classId,
  open,
}: {
  academyId: string;
  classId: string;
  open: boolean;
}) {
  const { t } = useTranslation('destructive');
  const impact = useQuery({
    queryKey: ['class-delete-impact', academyId, classId],
    queryFn: ({ signal }) => orpc.academyClasses.deleteImpact({ academyId, classId }, { signal }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  if (!open) return null;
  if (impact.isPending)
    return <p className="mt-3 text-[13.5px] text-sub">{t('student_work.checking')}</p>;
  if (impact.isError)
    return <p className="mt-3 text-[13.5px] text-danger">{t('class.impact.check_failed')}</p>;

  const { keptSubmissions, deletedAnswers, deletedTestAttempts, students } = impact.data;
  if (keptSubmissions + deletedAnswers + deletedTestAttempts === 0) return null;
  const deletes = deletedAnswers + deletedTestAttempts > 0;
  return (
    <div
      className={`mt-4 flex items-start gap-2.5 rounded-lg border px-4 py-3 ${deletes ? 'border-danger/25 bg-danger/5' : 'border-warning/30 bg-warning/10'}`}
      role="alert"
    >
      <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${deletes ? 'text-danger' : 'text-warning'}`} />
      <div className={`text-[14px] leading-6 ${deletes ? 'text-danger' : 'text-ink'}`}>
        <p className="font-bold">{t('class.impact.heading', { count: students })}</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {deletedTestAttempts > 0 ? <li>{t('class.impact.test_attempts', { count: deletedTestAttempts })}</li> : null}
          {deletedAnswers > 0 ? <li>{t('class.impact.answers', { count: deletedAnswers })}</li> : null}
          {keptSubmissions > 0 ? <li className="text-sub">{t('class.impact.kept', { count: keptSubmissions })}</li> : null}
        </ul>
      </div>
    </div>
  );
}
