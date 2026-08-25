'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { MonitoringClassSummary } from '@cove/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { orpc } from '@/lib/orpc';
import { useAssignedClassPresence } from '@/lib/monitoring/use-assigned-class-presence';

import { ConnectionBadge } from '../../_components/live-badges';

/**
 * The teacher's own classes.
 *
 * Durable facts come from the query and stay on screen whatever the socket is
 * doing; the live counts come from the presence rooms and are simply absent
 * when realtime is unavailable. A degraded service must never make a class
 * look empty.
 */
export function TeachingClasses({
  academyId,
  initialClasses,
}: {
  academyId: string;
  initialClasses: MonitoringClassSummary[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('monitoring');
  const classesQuery = useQuery({
    queryKey: ['academy', academyId, 'teaching-classes'],
    queryFn: () => orpc.monitoring.listAssignedClasses({ academyId }),
    initialData: { featureEnabled: true, classes: initialClasses },
    retry: false,
  });
  const classes = classesQuery.data.classes;
  const classIds = React.useMemo(
    () => classes.map((item) => item.classId),
    [classes],
  );
  const { counts, state } = useAssignedClassPresence({ academyId, classIds });

  if (classes.length === 0) {
    return (
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="text-[15px] font-bold">{t('classes.empty_title')}</h2>
        <p className="mt-1.5 text-[14px] leading-6 text-sub">
          {t('classes.empty_body')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-sub">
          {t('classes.student_count', {
            count: classes.reduce((total, item) => total + item.studentCount, 0),
          })}
        </p>
        <ConnectionBadge state={state} />
      </div>

      {state === 'degraded' ? (
        <p className="rounded-card border border-danger/25 bg-danger/5 px-4 py-3 text-[13.5px] text-danger">
          {t('connection.degraded_body')}
        </p>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {classes.map((item) => (
          <li key={item.classId}>
            <Link
              className="flex h-full flex-col gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:border-brand/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              href={`${routes.academy(academySlug)}/teach/classes/${item.classId}`}
            >
              <div className="min-w-0">
                <h2 className="truncate text-[15.5px] font-bold">{item.name}</h2>
                {item.description ? (
                  <p className="mt-1 line-clamp-2 text-[13.5px] leading-6 text-sub">
                    {item.description}
                  </p>
                ) : null}
              </div>

              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-sub">
                <div className="flex gap-1.5">
                  <dt className="sr-only">{t('classes.course_count', { count: item.courseCount })}</dt>
                  <dd>{t('classes.course_count', { count: item.courseCount })}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="sr-only">{t('classes.student_count', { count: item.studentCount })}</dt>
                  <dd>{t('classes.student_count', { count: item.studentCount })}</dd>
                </div>
                {counts[item.classId] ? (
                  <>
                    <div className="flex gap-1.5 font-semibold text-ink">
                      <dt className="sr-only">{t('roster.summary_online')}</dt>
                      <dd>
                        {t('classes.online_count', {
                          count: counts[item.classId]!.online,
                        })}
                      </dd>
                    </div>
                    <div className="flex gap-1.5 font-semibold text-brand">
                      <dt className="sr-only">{t('roster.summary_solving')}</dt>
                      <dd>
                        {t('classes.solving_count', {
                          count: counts[item.classId]!.solving,
                        })}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>

              <span className="mt-auto inline-flex items-center gap-1.5 text-[13.5px] font-bold text-brand">
                {t('classes.open')}
                <ArrowRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
