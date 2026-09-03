'use client';

import type { LibraryCourse } from '@cove/shared';
import { libraryCourseState } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  PenLine,
  Plus,
  Radio,
  Trash2,
  TriangleAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { DeleteConfirmDialog } from '@/components/studio/delete-confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { LibraryStateChip } from './library-state-chip';
import { LibraryCourseModal } from './library-course-modal';
import { LibraryCopiesPanel } from './library-copies-panel';

export type LibraryPage = {
  courses: LibraryCourse[];
  total: number;
  page: number;
  pageSize: number;
};

/** Spelled out rather than derived, so the namespace's types check them. */
const stateLabels = {
  DRAFT: 'state.draft',
  PUBLISHED: 'state.published',
  RETIRED: 'state.retired',
} as const;

function CountCell({ value }: { value: number }) {
  return (
    <span
      className={`font-mono text-[15px] tabular-nums ${
        value === 0 ? 'text-sub/50' : 'font-bold text-ink'
      }`}
    >
      {value}
    </span>
  );
}

/**
 * Every master course, in the table the rest of the product uses.
 *
 * The same `DataTable` a Team Lead reads their own courses in, with the same
 * column shapes — title over description, mono counts, a state facet, a row
 * menu behind `⋯`. An operator who works in both surfaces should not have to
 * learn two ways to read a list of courses, and the cards this replaced were a
 * third one.
 *
 * ## What it can do
 *
 * Everything head office does to a master: create, rename, publish, retire and
 * delete — and open, which is where the modules, lectures, problems and the
 * workbook importer live. Every write calls the same `academyCourses.*`
 * endpoint a customer's Team Lead calls, except `retire`, which means nothing
 * outside a library and has no academy sibling to reuse.
 *
 * ## Colour
 *
 * The console's rule: **hue says what a thing is, loudness says whether it is
 * in trouble.** The state chip carries the hue. Exactly one thing is loud, and
 * it is the only real fault a master can carry — problems with no test cases,
 * which reach every academy that adopts the course and then have to be fixed
 * in each copy separately. It is silent at zero.
 */
export function LibraryTable({
  academyId,
  initialData,
  initialSearch,
}: {
  /** The library's own academy. Null only while no library exists. */
  academyId: string | null;
  initialData: LibraryPage;
  initialSearch: string;
}) {
  const { t } = useTranslation('platform-library');
  const { t: destructive } = useTranslation('destructive');
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();

  const [courses, setCourses] = React.useState(initialData.courses);
  const [editing, setEditing] = React.useState<LibraryCourse | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [openCopies, setOpenCopies] = React.useState<LibraryCourse | null>(null);
  const [toDelete, setToDelete] = React.useState<LibraryCourse | null>(null);
  const [deletePending, setDeletePending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const reload = React.useCallback(async () => {
    try {
      const next = await orpc.platformLibrary.courses({
        page: 1,
        ...(initialSearch ? { search: initialSearch } : {}),
      });
      setCourses(next.courses);
      setError(null);
    } catch (caught) {
      setError(caught);
    }
  }, [initialSearch]);

  const run = React.useCallback(
    async (work: () => Promise<unknown>) => {
      setError(null);
      try {
        await work();
        await reload();
        router.refresh();
      } catch (caught) {
        setError(caught);
      }
    },
    [reload, router],
  );

  const columns = React.useMemo<ColumnDef<LibraryCourse>[]>(
    () => [
      {
        id: 'course',
        accessorFn: (course) => `${course.title} ${course.description}`,
        header: t('column.course'),
        cell: ({ row }) => (
          <div className="min-w-0 max-w-md">
            <span className="text-[15px] font-bold">{row.original.title}</span>
            <p className="mt-0.5 line-clamp-1 text-[13.5px] text-sub">
              {row.original.description || t('no_description')}
            </p>
          </div>
        ),
      },
      {
        id: 'state',
        accessorFn: (course) => libraryCourseState(course),
        header: t('column.state'),
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => {
          const state = libraryCourseState(row.original);
          return (
            <LibraryStateChip label={t(stateLabels[state])} state={state} />
          );
        },
      },
      {
        id: 'modules',
        accessorFn: (course) => course.moduleCount,
        header: t('column.modules'),
        cell: ({ row }) => <CountCell value={row.original.moduleCount} />,
      },
      {
        id: 'lectures',
        accessorFn: (course) => course.lectureCount,
        header: t('column.lectures'),
        cell: ({ row }) => <CountCell value={row.original.lectureCount} />,
      },
      {
        id: 'problems',
        accessorFn: (course) => course.exerciseCount,
        header: t('column.problems'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <CountCell value={row.original.exerciseCount} />
            {/* The one loud thing on this page, and silent at zero. */}
            {row.original.problemsWithoutTests > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-[12px] font-bold text-danger"
                title={t('shape.cannot_grade', {
                  count: row.original.problemsWithoutTests,
                })}
              >
                <TriangleAlert className="size-3" strokeWidth={2.5} />
                {row.original.problemsWithoutTests}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'copies',
        accessorFn: (course) => course.copyCount,
        header: t('column.copies'),
        cell: ({ row }) => {
          const course = row.original;
          if (course.copyCount === 0) {
            return <span className="text-[13.5px] text-sub/50">—</span>;
          }
          return (
            <button
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-bold text-sub transition-colors hover:bg-canvas hover:text-ink"
              onClick={(event) => {
                event.stopPropagation();
                setOpenCopies(course);
              }}
              type="button"
            >
              <Users className="size-3.5" />
              {course.copyCount}
              {course.behindCount > 0 ? (
                <span className="rounded-full bg-draft-soft px-1.5 text-[11.5px] font-bold text-draft">
                  {t('copies.behind', { count: course.behindCount })}
                </span>
              ) : null}
            </button>
          );
        },
      },
      {
        id: 'updated',
        accessorFn: (course) => course.updatedAt,
        header: t('column.updated'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {formatShortDate(row.original.updatedAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('column.actions'),
        enableSorting: false,
        cell: ({ row }) => {
          const course = row.original;
          return (
            <div
              className="flex items-center justify-end gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              <Link
                className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                href={routes.adminLibraryCourse(course.id)}
              >
                {t('open')}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t('row_menu_aria', { title: course.title })}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink data-[state=open]:bg-canvas data-[state=open]:text-ink"
                    type="button"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[14rem] text-[14.5px]">
                  <DropdownMenuLabel className="truncate text-[12.5px]">
                    {course.title}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(course)}>
                    <Pencil className="text-sub" />
                    {t('actions.edit')}
                  </DropdownMenuItem>
                  {/*
                    Absent on a retired master: publishing one would put it back
                    on the shelf under a chip that still says withdrawn. Restore
                    it first, which is the order the chip already implies.
                  */}
                  {course.retiredAt ? null : course.isVisible ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        void run(() =>
                          orpc.academyCourses.setVisibility({
                            academyId: academyId!,
                            courseId: course.id,
                            isVisible: false,
                          }),
                        )
                      }
                    >
                      <EyeOff className="text-sub" />
                      {t('actions.unpublish')}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={!academyId}
                      onSelect={() =>
                        void run(() =>
                          orpc.academyCourses.setVisibility({
                            academyId: academyId!,
                            courseId: course.id,
                            isVisible: true,
                          }),
                        )
                      }
                    >
                      <Eye className="text-sub" />
                      {t('actions.publish')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() =>
                      void run(() =>
                        orpc.platformLibrary.retire({
                          courseId: course.id,
                          retired: course.retiredAt === null,
                        }),
                      )
                    }
                  >
                    {course.retiredAt ? (
                      <ArchiveRestore className="text-sub" />
                    ) : (
                      <Archive className="text-sub" />
                    )}
                    {course.retiredAt
                      ? t('actions.restore')
                      : t('actions.retire')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Retiring is the reversible answer for a master that should
                      stop being offered; this unmakes one. The server refuses it
                      once any academy has adopted it. */}
                  <DropdownMenuItem onSelect={() => setToDelete(course)}>
                    <Trash2 className="text-danger" />
                    <span className="text-danger">
                      {destructive('course.delete')}
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [academyId, destructive, locale, run, t],
  );

  return (
    <>
      {error ? (
        <p
          className="mb-3 rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger"
          role="alert"
        >
          {errorText(error)}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={courses}
        emptyMessage={t('empty.body')}
        facets={[
          {
            columnId: 'state',
            title: t('column.state'),
            options: [
              { label: t('state.draft'), value: 'DRAFT', icon: PenLine },
              { label: t('state.published'), value: 'PUBLISHED', icon: Radio },
              { label: t('state.retired'), value: 'RETIRED', icon: Archive },
            ],
          },
        ]}
        pageSize={10}
        searchPlaceholder={t('search.placeholder')}
        toolbarActions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('create.action')}
          </Button>
        }
      />

      <LibraryCourseModal
        academyId={academyId}
        course={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={(courseId) => {
          setCreating(false);
          if (editing) {
            setEditing(null);
            void reload();
            router.refresh();
            return;
          }
          router.push(routes.adminLibraryCourse(courseId));
        }}
        open={creating || editing !== null}
      />

      <DeleteConfirmDialog
        body={destructive('course.delete_body')}
        cancelLabel={destructive('course.cancel')}
        confirmLabel={destructive('course.delete_confirm')}
        confirmValue={toDelete?.title ?? ''}
        fieldLabel={destructive('course.delete_confirm_label', {
          name: toDelete?.title ?? '',
        })}
        onClose={() => setToDelete(null)}
        onConfirm={async (typed) => {
          if (!toDelete || !academyId) return;
          setDeletePending(true);
          try {
            await orpc.academyCourses.delete({
              academyId,
              courseId: toDelete.id,
              confirmTitle: typed,
            });
            setToDelete(null);
            await reload();
            router.refresh();
          } finally {
            setDeletePending(false);
          }
        }}
        open={toDelete !== null}
        pending={deletePending}
        title={destructive('course.delete_title', {
          name: toDelete?.title ?? '',
        })}
        workingLabel={destructive('course.delete_working')}
      />

      <LibraryCopiesPanel
        course={openCopies}
        onClose={() => setOpenCopies(null)}
      />
    </>
  );
}
