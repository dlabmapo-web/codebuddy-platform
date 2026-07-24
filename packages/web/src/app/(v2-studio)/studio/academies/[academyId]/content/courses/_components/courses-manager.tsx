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
import {
  VersionChip,
  VersionSpine,
  formatContentDate,
} from '../../_components/version-marks';

export function CoursesManager({
  academyId,
  initialCourses,
}: {
  academyId: string;
  initialCourses: CourseSummary[];
}) {
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
        header: 'Course',
        cell: ({ row }) => {
          const course = row.original;
          return (
            <div className="min-w-0 max-w-md">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{course.title}</span>
                {course.status === 'ARCHIVED' ? (
                  <span className="rounded-full bg-retired-soft px-2 py-0.5 text-[11px] font-bold text-retired">
                    Archived
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-1 text-[13px] text-sub">
                {course.description || 'No description yet.'}
              </p>
            </div>
          );
        },
      },
      {
        id: 'versions',
        header: 'Versions',
        enableSorting: false,
        cell: ({ row }) => <VersionSpine course={row.original} />,
      },
      {
        id: 'updated',
        accessorFn: (course) => course.updatedAt,
        header: 'Last change',
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-[13px] text-sub">
            <p className="font-semibold text-ink">
              {formatContentDate(row.original.updatedAt)}
            </p>
            <p className="mt-0.5 text-[12px]">
              {row.original.publishedVersion
                ? `Live since ${formatContentDate(row.original.publishedVersion.publishedAt ?? row.original.publishedVersion.updatedAt)}`
                : 'Never published'}
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
                Continue draft
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
              {pending ? 'Starting…' : 'Start next draft'}
              <ArrowRight className="size-3.5" />
            </button>
          );
        },
      },
    ],
    [academyId, startDraft],
  );

  return (
    <div className="space-y-6">
      <LifecycleGuide />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] font-semibold text-sub">
          <span className="font-mono text-ink">{list.length}</span> course
          {list.length === 1 ? '' : 's'} in this academy
        </p>
        <Button onClick={() => setShowCreate((value) => !value)}>
          {showCreate ? <X /> : <Plus />}
          {showCreate ? 'Cancel' : 'New course'}
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
          <h2 className="text-[15px] font-bold">Name the course</h2>
          <p className="mt-1 text-[13.5px] leading-[1.55] text-sub">
            Cove opens Draft v1 straight away. Nothing is visible to teachers or
            students until you publish it.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">Course title</span>
              <Input
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Python Foundations"
                required
                value={title}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">
                What students learn{' '}
                <span className="font-normal text-sub">(optional)</span>
              </span>
              <Input
                maxLength={10000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Variables, loops, and functions through 40 problems"
                value={description}
              />
            </label>
            <Button
              className="self-end"
              disabled={createCourse.isPending || title.trim().length === 0}
              type="submit"
              variant="ink"
            >
              {createCourse.isPending ? 'Creating…' : 'Create and open'}
            </Button>
          </div>
          {createCourse.isError ? (
            <p className="mt-3 text-[13px] font-semibold text-danger">
              Another active course already uses this title. Pick a different one.
            </p>
          ) : null}
        </form>
      ) : null}

      <DataTable
        columns={columns}
        data={list}
        emptyMessage="No courses yet. Start with the one you teach most often."
        pageSize={12}
        searchPlaceholder={list.length > 5 ? 'Search courses' : undefined}
      />

      {startDraft.isError ? (
        <p className="text-[13px] font-semibold text-danger">
          A new draft could not be started. This course may already have one open.
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
  const steps = [
    {
      title: 'Write a draft',
      body: 'Only content editors see a draft. Add modules, lectures, and exercises in any order.',
      chip: <VersionChip state="draft" versionNumber={2} />,
    },
    {
      title: 'Check what blocks publishing',
      body: 'Cove lists every empty module or missing test case, and links each one to the item to fix.',
      chip: null,
    },
    {
      title: 'Publish a version',
      body: 'The draft freezes and becomes the version classes use. Editing it later starts the next draft.',
      chip: <VersionChip state="published" versionNumber={2} />,
    },
  ];

  return (
    <section className="rounded-card border border-border bg-white p-5">
      <h2 className="text-[12px] font-bold uppercase tracking-[0.08em] text-sub">
        How a course goes live
      </h2>
      <ol className="mt-4 grid gap-5 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li className="relative sm:pr-4" key={step.title}>
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
