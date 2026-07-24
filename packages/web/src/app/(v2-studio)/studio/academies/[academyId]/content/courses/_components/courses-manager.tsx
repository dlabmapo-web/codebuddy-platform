'use client';

import type { CourseSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { Input } from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { useLayoutTranslation, LayoutTrans } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import {
  VersionChip,
  VersionSpine,
  useContentDate,
} from '../../_components/version-marks';

export function CoursesManager({
  academyId,
  initialCourses,
}: {
  academyId: string;
  initialCourses: CourseSummary[];
}) {
  const { t } = useLayoutTranslation(['courses', 'common']);
  const errorText = useErrorText();
  const contentDate = useContentDate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [showCreate, setShowCreate] = React.useState(initialCourses.length === 0);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const queryKey = ['academy', academyId, 'courses'];

  const courses = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.list({ academyId }),
    initialData: { courses: initialCourses },
    retry: false,
  });

  const openDraft = React.useCallback(
    (course: CourseSummary) => {
      if (!course.draftVersion) return;
      router.push(
        `/studio/academies/${academyId}/content/courses/${course.id}/versions/${course.draftVersion.id}`,
      );
    },
    [academyId, router],
  );

  const createCourse = useMutation({
    mutationFn: () => orpc.academyCourses.create({ academyId, title, description }),
    onSuccess: async (course) => {
      setTitle('');
      setDescription('');
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey });
      openDraft(course);
    },
  });

  const startDraft = useMutation({
    mutationFn: (courseId: string) =>
      orpc.academyCourses.createDraft({ academyId, courseId }),
    onSuccess: async (course) => {
      await queryClient.invalidateQueries({ queryKey });
      openDraft(course);
    },
  });

  const list = courses.data.courses;

  const columns = React.useMemo<ColumnDef<CourseSummary>[]>(
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
              <Link
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-brand transition-colors hover:text-brand-deep"
                href={`/studio/academies/${academyId}/content/courses/${course.id}/versions/${course.draftVersion.id}`}
              >
                {t('continue_draft')}
                <ArrowRight className="size-3.5" />
              </Link>
            );
          }
          if (course.status === 'ARCHIVED') return null;
          const pending =
            startDraft.isPending && startDraft.variables === course.id;
          return (
            <button
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold text-brand transition-colors hover:text-brand-deep disabled:opacity-40"
              disabled={pending}
              onClick={() => startDraft.mutate(course.id)}
              type="button"
            >
              {pending ? t('starting') : t('start_next_draft')}
              <ArrowRight className="size-3.5" />
            </button>
          );
        },
      },
    ],
    [academyId, contentDate, startDraft, t],
  );

  return (
    <div className="space-y-6">
      <LifecycleGuide />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-sub">
          <LayoutTrans
            components={[<span className="font-mono text-ink" key="count" />]}
            count={list.length}
            i18nKey="courses:course_count"
            values={{ count: list.length }}
          />
        </p>
        <Button onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? <X /> : <Plus />}
          {showCreate ? t('common:action.cancel') : t('new_course')}
        </Button>
      </div>

      {showCreate ? (
        <form
          className="rounded-card border border-brand/25 bg-brand-soft/40 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            createCourse.mutate();
          }}
        >
          <h2 className="text-[15px] font-bold">{t('create.heading')}</h2>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-sub">
            {t('create.body')}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">
                {t('create.title_label')}
              </span>
              <Input
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('create.title_placeholder')}
                required
                value={title}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">
                {t('create.description_label')}{' '}
                <span className="font-normal text-sub">
                  {t('create.description_optional')}
                </span>
              </span>
              <Input
                maxLength={10000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('create.description_placeholder')}
                value={description}
              />
            </label>
            <Button
              className="self-end"
              disabled={createCourse.isPending || title.trim().length === 0}
              type="submit"
              variant="ink"
            >
              {createCourse.isPending
                ? t('create.submitting')
                : t('create.submit')}
            </Button>
          </div>
          {createCourse.isError ? (
            <p className="mt-3 text-[13px] font-semibold text-danger">
              {errorText(createCourse.error, t('create.title_conflict'))}
            </p>
          ) : null}
        </form>
      ) : null}

      <DataTable
        columns={columns}
        data={list}
        emptyMessage={t('empty')}
        pageSize={12}
        searchPlaceholder={list.length > 5 ? t('search_placeholder') : undefined}
      />

      {startDraft.isError ? (
        <p className="text-[13px] font-semibold text-danger">
          {errorText(startDraft.error, t('draft_start_failed'))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Versioning is the concept people trip on, so the library states it plainly
 * before the list rather than hiding it in a tooltip.
 */
function LifecycleGuide() {
  const { t } = useLayoutTranslation('courses');
  const steps = [
    {
      id: 'draft',
      title: t('lifecycle.draft_title'),
      body: t('lifecycle.draft_body'),
      chip: <VersionChip state="draft" versionNumber={2} />,
    },
    {
      id: 'check',
      title: t('lifecycle.check_title'),
      body: t('lifecycle.check_body'),
      chip: null,
    },
    {
      id: 'publish',
      title: t('lifecycle.publish_title'),
      body: t('lifecycle.publish_body'),
      chip: <VersionChip state="published" versionNumber={2} />,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-white p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-sub">
        {t('lifecycle.heading')}
      </h2>
      <ol className="mt-4 grid gap-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li className="relative sm:pr-4" key={step.id}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[12px] font-bold text-brand">
                {index + 1}
              </span>
              <h3 className="text-[14.5px] font-bold">{step.title}</h3>
            </div>
            <p className="mt-2 text-[13.5px] leading-[1.55] text-sub">{step.body}</p>
            {step.chip ? <div className="mt-2.5">{step.chip}</div> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
