'use client';

import type {
  PlatformAcademyDetail,
  PlatformClass,
  PlatformCourse,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { formatShortDate } from '@cove/i18n/format';
import {
  Archive,
  ArrowRight,
  BookOpen,
  Eye,
  EyeOff,
  LayoutGrid,
  Plus,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { ArchiveClassDialog } from '@/app/(studio)/academy/[academySlug]/(framed)/classes/_components/archive-class-dialog';
import { VisibilityConfirmModal } from '@/app/(studio)/academy/[academySlug]/(framed)/content/_components/visibility-confirm-modal';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import {
  ContentDeleteDialog,
  ContentRowActions,
} from '../../../_components/content-row-actions';
import {
  countColumn,
  CoursesCell,
  StateBadge,
  TeacherCell,
} from '../../../_lib/content-columns';

/**
 * What this academy teaches, on the page that describes it.
 *
 * Two `DataTable`s rather than two bespoke lists, so sorting, the column menu
 * and the empty state behave the way they do everywhere else in the product —
 * and so a fix to that table reaches here too.
 *
 * Every action stays in the console while mounting the same course and class
 * managers the academy studio uses. The console owns routes and chrome, not a
 * second implementation of either editor.
 *
 * Delete is the exception that proves it: it calls the same endpoint the
 * academy's own screens call, gated by the same `curriculum.manage` and
 * `classes.manage` a Team Lead and a Manager hold — so this button and theirs
 * are one operation, not two.
 */
export function AcademyContent({
  academy,
  classes,
  courses,
}: {
  academy: PlatformAcademyDetail;
  classes: PlatformClass[];
  courses: PlatformCourse[];
}) {
  const { t } = useTranslation('platform');
  const { t: content } = useTranslation('platform-content');
  const { t: coursesT } = useLayoutTranslation('courses');
  const { t: classesT } = useLayoutTranslation('classes');
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();
  const coursesPath = routes.adminAcademyCourses(academy.slug);
  const classesPath = routes.adminAcademyClasses(academy.slug);

  const [pending, setPending] = React.useState<
    | { kind: 'course'; id: string; label: string }
    | { kind: 'class'; id: string; label: string }
    | null
  >(null);
  const [courseToHide, setCourseToHide] =
    React.useState<PlatformCourse | null>(null);
  const [classToArchive, setClassToArchive] =
    React.useState<PlatformClass | null>(null);
  const [statusPending, setStatusPending] = React.useState<string | null>(null);
  const [statusError, setStatusError] = React.useState<{
    kind: 'course' | 'class';
    error: unknown;
  } | null>(null);

  const setCourseVisibility = React.useCallback(
    async (course: PlatformCourse, isVisible: boolean) => {
      setStatusPending(`course:${course.id}`);
      setStatusError(null);
      try {
        await orpc.academyCourses.setVisibility({
          academyId: academy.id,
          courseId: course.id,
          isVisible,
        });
        setCourseToHide(null);
        router.refresh();
      } catch (error) {
        setStatusError({ kind: 'course', error });
      } finally {
        setStatusPending(null);
      }
    },
    [academy.id, router],
  );

  const setClassStatus = React.useCallback(
    async (record: PlatformClass, status: 'ACTIVE' | 'ARCHIVED') => {
      setStatusPending(`class:${record.id}`);
      setStatusError(null);
      try {
        await orpc.academyClasses.setStatus({
          academyId: academy.id,
          classId: record.id,
          status,
        });
        setClassToArchive(null);
        router.refresh();
      } catch (error) {
        setStatusError({ kind: 'class', error });
      } finally {
        setStatusPending(null);
      }
    },
    [academy.id, router],
  );

  const courseColumns = React.useMemo<ColumnDef<PlatformCourse>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (row) => `${row.title} ${row.description}`,
        header: content('table.course'),
        cell: ({ row }) => (
          <div className="min-w-0 max-w-md">
            <span className="text-[15px] font-bold text-ink">
              {row.original.title}
            </span>
            <p className="mt-0.5 line-clamp-1 text-[13.5px] text-sub">
              {row.original.description || content('table.no_description')}
            </p>
          </div>
        ),
      },
      {
        id: 'visibility',
        accessorFn: (row) => String(row.isVisible),
        header: content('table.visibility'),
        size: 120,
        cell: ({ row }) => (
          <StateBadge
            label={
              row.original.isVisible
                ? content('table.visible')
                : content('table.hidden')
            }
            on={row.original.isVisible}
          />
        ),
      },
      countColumn('modules', content('table.modules'), (row) => row.moduleCount),
      countColumn('lectures', content('table.lectures'), (row) => row.lectureCount),
      countColumn('problems', content('table.problems'), (row) => row.exerciseCount),
      {
        id: 'updated',
        accessorFn: (row) => row.updatedAt,
        header: content('table.last_change'),
        size: 120,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.updatedAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: content('table.actions'),
        enableSorting: false,
        size: 140,
        cell: ({ row }) => (
          <ContentRowActions
            deleteLabel={t('content_panel.delete_course')}
            label={row.original.title}
            onDelete={() =>
              setPending({
                kind: 'course',
                id: row.original.id,
                label: row.original.title,
              })
            }
            statusAction={{
              disabled: Boolean(statusPending),
              icon: row.original.isVisible ? EyeOff : Eye,
              label: row.original.isVisible ? coursesT('hide') : coursesT('show'),
              onSelect: () => {
                if (row.original.isVisible) {
                  setStatusError(null);
                  setCourseToHide(row.original);
                  return;
                }
                void setCourseVisibility(row.original, true);
              },
            }}
            href={routes.adminAcademyCourse(academy.slug, row.original.id)}
          />
        ),
      },
    ],
    [academy.slug, content, coursesT, locale, setCourseVisibility, statusPending, t],
  );

  const classColumns = React.useMemo<ColumnDef<PlatformClass>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => `${row.name} ${row.description}`,
        header: content('table.class'),
        cell: ({ row }) => (
          <div className="min-w-0 max-w-md">
            <span className="text-[15px] font-bold text-ink">
              {row.original.name}
            </span>
            <p className="mt-0.5 line-clamp-1 text-[13.5px] text-sub">
              {row.original.description || content('table.no_description')}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: content('table.status'),
        size: 120,
        cell: ({ row }) => (
          <StateBadge
            label={content(`table.class_status.${row.original.status}`)}
            on={row.original.status === 'ACTIVE'}
          />
        ),
      },
      {
        id: 'courses',
        accessorFn: (row) => row.courses.map((course) => course.title).join(' '),
        header: content('table.assigned_courses'),
        enableSorting: false,
        cell: ({ row }) => <CoursesCell courses={row.original.courses} />,
      },
      countColumn('students', content('table.students'), (row) => row.studentCount),
      {
        id: 'teacher',
        accessorFn: (row) => row.teacherName ?? '',
        header: content('table.assigned_teacher'),
        size: 200,
        cell: ({ row }) => (
          <TeacherCell
            avatarUrl={row.original.teacherAvatarUrl}
            name={row.original.teacherName}
          />
        ),
      },
      {
        id: 'updated',
        accessorFn: (row) => row.updatedAt,
        header: content('table.last_change'),
        size: 120,
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.updatedAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: content('table.actions'),
        enableSorting: false,
        size: 140,
        cell: ({ row }) => (
          <ContentRowActions
            deleteLabel={t('content_panel.delete_class')}
            label={row.original.name}
            onDelete={() =>
              setPending({
                kind: 'class',
                id: row.original.id,
                label: row.original.name,
              })
            }
            statusAction={{
              disabled: Boolean(statusPending),
              icon: row.original.status === 'ARCHIVED' ? RotateCcw : Archive,
              label:
                row.original.status === 'ARCHIVED'
                  ? classesT('restore')
                  : classesT('archive'),
              onSelect: () => {
                if (row.original.status === 'ARCHIVED') {
                  void setClassStatus(row.original, 'ACTIVE');
                  return;
                }
                setStatusError(null);
                setClassToArchive(row.original);
              },
            }}
            href={routes.adminAcademyClass(academy.slug, row.original.id)}
          />
        ),
      },
    ],
    [academy.slug, classesT, content, locale, setClassStatus, statusPending, t],
  );

  return (
    <div className="grid gap-5">
      <Section
        action={
          <Button asChild size="sm">
            <Link href={coursesPath}>
              <Plus className="size-3.5" />
              {t('content_panel.add_course')}
            </Link>
          </Button>
        }
        icon={BookOpen}
        more={
          academy.content.courses > courses.length
            ? coursesPath
            : null
        }
        title={t('content_panel.courses')}
        total={academy.content.courses}
      >
        <DataTable
          columns={courseColumns}
          data={courses}
          emptyMessage={t('content_panel.courses_empty')}
          showColumnVisibility={false}
        />
      </Section>

      <Section
        action={
          <Button asChild size="sm">
            <Link href={classesPath}>
              <Plus className="size-3.5" />
              {t('content_panel.add_class')}
            </Link>
          </Button>
        }
        icon={LayoutGrid}
        more={
          academy.classes.total > classes.length
            ? classesPath
            : null
        }
        title={t('content_panel.classes')}
        total={academy.classes.total}
      >
        <DataTable
          columns={classColumns}
          data={classes}
          emptyMessage={t('content_panel.classes_empty')}
          showColumnVisibility={false}
        />
      </Section>

      <ContentDeleteDialog
        academyId={academy.id}
        onClose={() => setPending(null)}
        onDone={() => {
          setPending(null);
          router.refresh();
        }}
        target={pending}
      />

      <VisibilityConfirmModal
        affected={
          courseToHide
            ? [
                {
                  label: coursesT('column.modules'),
                  value: courseToHide.moduleCount,
                },
                {
                  label: coursesT('column.lectures'),
                  value: courseToHide.lectureCount,
                },
                {
                  label: coursesT('column.exercises'),
                  value: courseToHide.exerciseCount,
                },
              ]
            : []
        }
        error={
          statusError?.kind === 'course'
            ? errorText(statusError.error, coursesT('visibility_change_failed'))
            : null
        }
        itemTitle={courseToHide?.title ?? ''}
        kindLabel={coursesT('kind_course')}
        onCancel={() => {
          if (!statusPending) setCourseToHide(null);
        }}
        onConfirm={() => {
          if (courseToHide) void setCourseVisibility(courseToHide, false);
        }}
        open={Boolean(courseToHide)}
        pending={Boolean(
          courseToHide && statusPending === `course:${courseToHide.id}`,
        )}
      />

      {classToArchive ? (
        <ArchiveClassDialog
          courseCount={classToArchive.courseCount}
          error={
            statusError?.kind === 'class'
              ? errorText(statusError.error, classesT('archive_dialog.failed'))
              : null
          }
          name={classToArchive.name}
          onCancel={() => {
            if (!statusPending) setClassToArchive(null);
          }}
          onConfirm={() => void setClassStatus(classToArchive, 'ARCHIVED')}
          pending={statusPending === `class:${classToArchive.id}`}
          studentCount={classToArchive.studentCount}
        />
      ) : null}

      {statusError && !courseToHide && !classToArchive ? (
        <p className="text-[13px] text-danger" role="alert">
          {errorText(
            statusError.error,
            statusError.kind === 'course'
              ? coursesT('visibility_change_failed')
              : classesT('archive_dialog.failed'),
          )}
        </p>
      ) : null}
    </div>
  );
}

function Section({
  action,
  children,
  icon: Icon,
  more,
  title,
  total,
}: {
  action: React.ReactNode;
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  more: string | null;
  title: string;
  total: number;
}) {
  const { t } = useTranslation('platform');
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-ink">
          <Icon className="size-4 text-sub" />
          {title}
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] tabular-nums text-sub">
            {total}
          </span>
        </h2>
        {more ? (
          <Link
            className="inline-flex items-center gap-1 text-[13px] font-bold text-brand hover:underline"
            href={more}
          >
            {t('content_panel.view_all', { count: total })}
            <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}
