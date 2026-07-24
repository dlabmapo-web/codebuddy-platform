import type { CourseSummary } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { DataTable } from '@/components/studio/data-table';
import { useLayoutTranslation } from '@/i18n';

import type { CoursesManagerState } from '../_hooks/use-courses-manager';
import {
  VersionSpine,
  useContentDate,
} from '../../_components/version-marks';

export function CoursesTable({
  academyId,
  canEdit,
  manager,
}: {
  academyId: string;
  canEdit: boolean;
  manager: CoursesManagerState;
}) {
  const { t } = useLayoutTranslation('courses');
  const contentDate = useContentDate();
  const columns = useMemo<ColumnDef<CourseSummary>[]>(
    () => [
      {
        id: 'course',
        accessorFn: (course) => `${course.title} ${course.description}`,
        header: t('column.course'),
        cell: ({ row }) => {
          const course = row.original;
          return (
            <div className="min-w-0 max-w-md">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{course.title}</span>
                {course.status === 'ARCHIVED' ? (
                  <span className="rounded-full bg-retired-soft px-2 py-0.5 text-[11px] font-bold text-retired">
                    {t('archived')}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[13px] text-sub">
                {course.description || t('no_description')}
              </p>
            </div>
          );
        },
      },
      {
        id: 'versions',
        header: t('column.versions'),
        enableSorting: false,
        cell: ({ row }) => <VersionSpine course={row.original} />,
      },
      {
        id: 'updated',
        accessorFn: (course) => course.updatedAt,
        header: t('column.updated'),
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-[13px] text-sub">
            <p className="font-semibold text-ink">
              {contentDate(row.original.updatedAt)}
            </p>
            <p className="mt-0.5 text-[12px]">
              {row.original.publishedVersion
                ? t('live_since', {
                    date: contentDate(
                      row.original.publishedVersion.publishedAt ??
                        row.original.publishedVersion.updatedAt,
                    ),
                  })
                : t('never_published')}
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const course = row.original;
          if (course.draftVersion) {
            return (
              <CourseLink
                href={`/studio/academies/${academyId}/content/courses/${course.id}/versions/${course.draftVersion.id}`}
                label={t('continue_draft')}
              />
            );
          }
          if (course.status === 'ARCHIVED' || !canEdit) {
            if (!course.publishedVersion) return null;
            return (
              <CourseLink
                href={`/studio/academies/${academyId}/content/courses/${course.id}/versions/${course.publishedVersion.id}`}
                label={t('review_published')}
              />
            );
          }
          const pending = manager.startingCourseId === course.id;
          return (
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-brand transition-colors hover:text-brand-deep disabled:opacity-40"
              disabled={pending}
              onClick={() => manager.startDraft(course.id)}
              type="button"
            >
              {pending ? t('starting') : t('start_next_draft')}
              <ArrowRight className="size-3.5" />
            </button>
          );
        },
      },
    ],
    [academyId, canEdit, contentDate, manager, t],
  );

  return (
    <DataTable
      columns={columns}
      data={manager.courses}
      emptyMessage={t('empty')}
      pageSize={12}
      searchPlaceholder={
        manager.courses.length > 5 ? t('search_placeholder') : undefined
      }
    />
  );
}

function CourseLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-brand transition-colors hover:text-brand-deep"
      href={href}
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}
