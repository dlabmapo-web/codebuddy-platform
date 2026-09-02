'use client';

import type {
  ContentLens,
  ContentSortKey,
  PlatformClass,
  PlatformContentSummary,
  PlatformCourse,
  PlatformProblem,
} from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { Archive, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { ArchiveClassDialog } from '@/app/(studio)/academy/[academySlug]/(framed)/classes/_components/archive-class-dialog';
import { VisibilityConfirmModal } from '@/app/(studio)/academy/[academySlug]/(framed)/content/_components/visibility-confirm-modal';
import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import {
  ContentDeleteDialog,
  ContentRowActions,
  type ContentDeleteTarget,
} from '../../_components/content-row-actions';
import {
  countColumn,
  CoursesCell,
  StateBadge,
  TeacherCell,
} from '../../_lib/content-columns';
import {
  useContentQuery,
  useContentState,
  useContentSummaryQuery,
  type ContentPage,
} from '../../_hooks/use-platform-content';
import { contentDetailHref, lensIcons, lensTones } from '../../_lib/content-view';
import { ContentSummary } from './content-summary';
import { ContentTypeChip } from './content-type-chip';

/**
 * Every academy's teaching, in the table the rest of the product uses.
 *
 * One component for all three lenses, because they differ only in their
 * columns: the same search, the same academy facet, the same paging, the same
 * row actions. The alternative — three tables — would give the academy column
 * three places to drift, and the rule that every Open link stays inside the
 * console is the thing that must never differ.
 *
 * ## Colour
 *
 * The users directory's rule, one level up (§2.1 of the browser redesign):
 * **hue says what a thing is, loudness says whether it is in trouble.** One
 * lens is on screen at a time, so the hue is a page property rather than a
 * per-row decoration — the summary tile, the type chip and this panel's rail
 * all take `lensTones[lens]`, and switching to problems turns the page violet.
 *
 * Loudness stays per row and stays rare: a class with nobody teaching it, a
 * problem with no test cases. Those two are what an operator opens this page
 * to find.
 *
 * ## Where the counts live
 *
 * The summary strip is rendered here rather than by the page above, so it
 * moves with the academy facet — an operator narrowed to one academy is shown
 * that academy's content, not the platform's. It is the contract
 * `UserComposition` establishes, and the reason that component sits inside
 * `UserTable` too.
 */
export function ContentTable({
  initialData,
  initialKey,
  initialSummary,
  initialSummaryKey,
  lens,
}: {
  initialData: ContentPage | null;
  initialKey: string;
  /** Null when the server's summary call failed; the client refetches it. */
  initialSummary: PlatformContentSummary | null;
  initialSummaryKey: string;
  lens: ContentLens;
}) {
  const { t } = useTranslation('platform-content');
  const { t: platform } = useTranslation('platform');
  const { t: coursesT } = useLayoutTranslation('courses');
  const { t: classesT } = useLayoutTranslation('classes');
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();

  // `path` is this table's own address, handed to every Open link as `from`
  // so the detail page's Back returns here rather than to the academy's index.
  const { query, path, change } = useContentState(lens);
  const result = useContentQuery(lens, query, initialData, initialKey);
  const summaryResult = useContentSummaryQuery(
    query.academyIds,
    initialSummary,
    initialSummaryKey,
  );
  const page = result.data;

  /**
   * Back to the top when the rows underneath are replaced wholesale.
   *
   * Switching type or turning a page swaps every row on screen. Left where they
   * were, the operator is halfway down a table they have not seen the top of —
   * the summary strip, the toolbar and the header row are all above them, and
   * the page reads as though it did nothing. Narrowing a filter is deliberately
   * not in here: that keeps the same question on screen and answers it.
   *
   * Skipped on first paint, so a deep link that the browser restores a scroll
   * position for is left alone.
   */
  const scrollKey = `${lens}:${query.page}`;
  const lastScrollKey = React.useRef(scrollKey);
  React.useEffect(() => {
    if (lastScrollKey.current === scrollKey) return;
    lastScrollKey.current = scrollKey;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [scrollKey]);

  const [deleteState, setDeleteState] = React.useState<{
    academyId: string;
    target: ContentDeleteTarget;
  } | null>(null);
  const [courseToHide, setCourseToHide] = React.useState<PlatformCourse | null>(
    null,
  );
  const [classToArchive, setClassToArchive] =
    React.useState<PlatformClass | null>(null);
  const [statusPending, setStatusPending] = React.useState<string | null>(null);
  const [statusError, setStatusError] = React.useState<{
    kind: 'course' | 'class' | 'problem';
    error: unknown;
  } | null>(null);

  /**
   * Both caches, after any write.
   *
   * `refetch` for the rows this table holds, `router.refresh()` because the
   * server rendered the first page and the academy pages read the same records
   * on their own next visit. The summary is refetched explicitly: deleting a
   * class has to move the number in the strip above, and that is a different
   * query key.
   */
  const refresh = React.useCallback(() => {
    void result.refetch();
    void summaryResult.refetch();
    router.refresh();
  }, [result, router, summaryResult]);

  const setCourseVisibility = React.useCallback(
    async (course: PlatformCourse, isVisible: boolean) => {
      setStatusPending(`course:${course.id}`);
      setStatusError(null);
      try {
        await orpc.academyCourses.setVisibility({
          academyId: course.academyId,
          courseId: course.id,
          isVisible,
        });
        setCourseToHide(null);
        refresh();
      } catch (error) {
        setStatusError({ kind: 'course', error });
      } finally {
        setStatusPending(null);
      }
    },
    [refresh],
  );

  const setClassStatus = React.useCallback(
    async (record: PlatformClass, status: 'ACTIVE' | 'ARCHIVED') => {
      setStatusPending(`class:${record.id}`);
      setStatusError(null);
      try {
        await orpc.academyClasses.setStatus({
          academyId: record.academyId,
          classId: record.id,
          status,
        });
        setClassToArchive(null);
        refresh();
      } catch (error) {
        setStatusError({ kind: 'class', error });
      } finally {
        setStatusPending(null);
      }
    },
    [refresh],
  );

  /**
   * Applied immediately, with no dialog.
   *
   * Hiding a course or archiving a class confirms because both cascade — a
   * course carries its modules, lectures and problems out of every student's
   * view with it. A problem is a leaf and takes nothing with it, so a
   * confirmation would be a click charged for nothing.
   */
  const setProblemVisibility = React.useCallback(
    async (problem: PlatformProblem, isVisible: boolean) => {
      setStatusPending(`problem:${problem.materialId}`);
      setStatusError(null);
      try {
        await orpc.academyCourses.setExerciseVisibility({
          academyId: problem.academyId,
          courseId: problem.courseId,
          lectureId: problem.lectureId,
          materialId: problem.materialId,
          isVisible,
        });
        refresh();
      } catch (error) {
        setStatusError({ kind: 'problem', error });
      } finally {
        setStatusPending(null);
      }
    },
    [refresh],
  );

  const columns = React.useMemo(() => {
    const updatedColumn = <T extends { updatedAt: string }>(
      size: number,
    ): ColumnDef<T> => ({
      id: 'updated',
      header: t('table.updated'),
      size,
      // The first column to go when the table runs out of room. It dates a row
      // rather than identifying one, and the columns the operator came for —
      // the name, the academy, the counts — keep their width instead. It stays
      // in the Columns menu, so an operator who is auditing staleness can put
      // it back.
      meta: { className: 'max-xl:hidden', hideable: true },
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[13.5px] text-sub">
          {formatShortDate(row.original.updatedAt, locale)}
        </span>
      ),
    });

    if (lens === 'courses') {
      return [
        {
          // The one unsized column, so it absorbs the slack and truncates.
          // `layout="fixed"` requires every other column to declare a width,
          // and this one is never hidden — a table of rows you cannot name is
          // not a shorter table, it is a broken one.
          id: 'title',
          header: t('table.course'),
          enableHiding: false,
          cell: ({ row }) => (
            <TitleCell
              subtitle={row.original.description}
              title={row.original.title}
            />
          ),
        },
        academyColumn<PlatformCourse>(t('table.academy')),
        {
          id: 'visibility',
          header: t('table.visibility'),
          enableSorting: false,
          size: 104,
          meta: { hideable: true },
          cell: ({ row }) => (
            <StateBadge
              label={
                row.original.isVisible ? t('table.published') : t('table.draft')
              }
              on={row.original.isVisible}
            />
          ),
        },
        // Four measurements rather than the one mono string this table used to
        // print. "4 modules · 31 problems" dropped lectures entirely and could
        // not be compared down the column, which is the only thing a count is
        // on a table for.
        countColumn<PlatformCourse>(
          'classes',
          t('table.classes'),
          (row) => row.classCount,
          false,
          78,
          true,
        ),
        countColumn<PlatformCourse>(
          'modules',
          t('table.modules'),
          (row) => row.moduleCount,
          false,
          78,
          true,
        ),
        countColumn<PlatformCourse>(
          'lectures',
          t('table.lectures'),
          (row) => row.lectureCount,
          false,
          78,
        ),
        countColumn<PlatformCourse>(
          'problems',
          t('table.problems'),
          (row) => row.exerciseCount,
          false,
          78,
        ),
        updatedColumn<PlatformCourse>(88),
        {
          id: 'actions',
          header: '',
          enableHiding: false,
          enableSorting: false,
          size: 96,
          cell: ({ row }) => (
            <ContentRowActions
              deleteLabel={platform('content_panel.delete_course')}
              href={contentDetailHref.course(row.original, path)}
              label={row.original.title}
              onDelete={() =>
                setDeleteState({
                  academyId: row.original.academyId,
                  target: {
                    kind: 'course',
                    id: row.original.id,
                    label: row.original.title,
                  },
                })
              }
              statusAction={{
                disabled: Boolean(statusPending),
                icon: row.original.isVisible ? EyeOff : Eye,
                label: row.original.isVisible
                  ? coursesT('hide')
                  : coursesT('show'),
                onSelect: () => {
                  // Hiding cascades to everything under the course, so it
                  // confirms. Showing is reversible and applies at once.
                  if (row.original.isVisible) {
                    setStatusError(null);
                    setCourseToHide(row.original);
                    return;
                  }
                  void setCourseVisibility(row.original, true);
                },
              }}
            />
          ),
        },
      ] as ColumnDef<PlatformCourse>[];
    }

    if (lens === 'classes') {
      return [
        {
          id: 'name',
          header: t('table.class'),
          enableHiding: false,
          cell: ({ row }) => (
            <TitleCell
              subtitle={row.original.description}
              title={row.original.name}
            />
          ),
        },
        academyColumn<PlatformClass>(t('table.academy')),
        {
          id: 'status',
          header: t('table.status'),
          enableSorting: false,
          size: 104,
          meta: { hideable: true },
          cell: ({ row }) => (
            <StateBadge
              label={t(`table.class_status.${row.original.status}`)}
              on={row.original.status === 'ACTIVE'}
            />
          ),
        },
        {
          id: 'courses',
          header: t('table.assigned_courses'),
          enableSorting: false,
          size: 176,
          meta: { hideable: true },
          cell: ({ row }) => <CoursesCell courses={row.original.courses} />,
        },
        {
          id: 'teacher',
          header: t('table.teacher'),
          enableSorting: false,
          size: 164,
          meta: { hideable: true },
          cell: ({ row }) => (
            <TeacherCell
              avatarUrl={row.original.teacherAvatarUrl}
              name={row.original.teacherName}
            />
          ),
        },
        countColumn<PlatformClass>(
          'students',
          t('table.students'),
          (row) => row.studentCount,
          false,
          80,
          true,
        ),
        updatedColumn<PlatformClass>(88),
        {
          id: 'actions',
          header: '',
          enableHiding: false,
          enableSorting: false,
          size: 96,
          cell: ({ row }) => (
            <ContentRowActions
              deleteLabel={platform('content_panel.delete_class')}
              href={contentDetailHref.class(row.original, path)}
              label={row.original.name}
              onDelete={() =>
                setDeleteState({
                  academyId: row.original.academyId,
                  target: {
                    kind: 'class',
                    id: row.original.id,
                    label: row.original.name,
                  },
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
            />
          ),
        },
      ] as ColumnDef<PlatformClass>[];
    }

    return [
      {
        id: 'title',
        header: t('table.problem'),
        enableHiding: false,
        cell: ({ row }) => <TitleCell title={row.original.title} />,
      },
      academyColumn<PlatformProblem>(t('table.academy')),
      {
        id: 'visibility',
        header: t('table.visibility'),
        enableSorting: false,
        size: 104,
        meta: { hideable: true },
        cell: ({ row }) => (
          <StateBadge
            label={
              row.original.isVisible
                ? t('table.published')
                : t('table.hidden_problem')
            }
            on={row.original.isVisible}
          />
        ),
      },
      {
        // Its own column rather than a subtitle under the title. A problem
        // title does not identify one — every academy has an "Exercise 3" —
        // and where it sits was previously set in the smallest type on the row.
        id: 'course',
        header: t('table.course_column'),
        enableSorting: false,
        size: 180,
        meta: { hideable: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {row.original.courseTitle}
            </span>
            <span className="block truncate text-[12px] text-sub">
              {row.original.lectureTitle}
            </span>
          </div>
        ),
      },
      {
        // A pill rather than grey text. Difficulty is a measurement of a
        // problem, and the codebase's rule forbids colouring a *child*, not a
        // measurement — the same reason rank markers carry tone.
        id: 'difficulty',
        header: t('table.difficulty'),
        size: 108,
        meta: { hideable: true },
        cell: ({ row }) =>
          row.original.difficulty ? (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-bold ${
                difficultyStyles[row.original.difficulty]
              }`}
            >
              {t(`table.difficulty_value.${row.original.difficulty}`)}
            </span>
          ) : (
            <span className="text-sub">—</span>
          ),
      },
      // Zero test cases means the problem cannot grade anything, which is the
      // single most common "this problem is broken" report — so this is the
      // one count on the page that flags its zero.
      countColumn<PlatformProblem>(
        'tests',
        t('table.tests'),
        (row) => row.testCaseCount,
        true,
        80,
      ),
      updatedColumn<PlatformProblem>(88),
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <ContentRowActions
            deleteLabel={t('table.delete_problem')}
            href={contentDetailHref.problem(row.original, path)}
            label={row.original.title}
            onDelete={() =>
              setDeleteState({
                academyId: row.original.academyId,
                target: {
                  kind: 'problem',
                  id: row.original.materialId,
                  label: row.original.title,
                  courseId: row.original.courseId,
                  lectureId: row.original.lectureId,
                },
              })
            }
            statusAction={{
              disabled: Boolean(statusPending),
              icon: row.original.isVisible ? EyeOff : Eye,
              label: row.original.isVisible
                ? coursesT('hide')
                : coursesT('show'),
              onSelect: () =>
                void setProblemVisibility(row.original, !row.original.isVisible),
            }}
          />
        ),
      },
    ] as ColumnDef<PlatformProblem>[];
  }, [
    classesT,
    coursesT,
    lens,
    locale,
    path,
    platform,
    setClassStatus,
    setCourseVisibility,
    setProblemVisibility,
    statusPending,
    t,
  ]);

  const facets = React.useMemo(
    () => [
      {
        columnId: 'academy',
        title: t('table.academy'),
        options: (page?.academyOptions ?? []).map((academy) => ({
          label: academy.name,
          value: academy.id,
        })),
      },
    ],
    [page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(
    () =>
      query.academyIds?.length
        ? [{ id: 'academy', value: query.academyIds }]
        : [],
    [query.academyIds],
  );

  const rowCount = page?.total ?? 0;

  const sortColumnId = sortColumnIdOf(query.sort, lens);

  /**
   * The whole row opens the editor, as it does on the users directory.
   *
   * The arrow in the actions cell stays: a row that is only clickable in its
   * middle is undiscoverable, and a keyboard reader needs a real link. This is
   * the shortcut for the mouse, not the only way in.
   */
  const openRow = React.useCallback(
    (row: PlatformCourse | PlatformClass | PlatformProblem) => {
      router.push(
        lens === 'courses'
          ? contentDetailHref.course(row as PlatformCourse, path)
          : lens === 'classes'
            ? contentDetailHref.class(row as PlatformClass, path)
            : contentDetailHref.problem(row as PlatformProblem, path),
      );
    },
    [lens, path, router],
  );

  // A failure that has no dialog to live in. The two that do — hiding a course,
  // archiving a class — show it inside the modal that asked for the action, so
  // this reports only what is left: a failed Show, Restore, or problem toggle.
  const looseError =
    statusError && !courseToHide && !classToArchive
      ? errorText(
          statusError.error,
          statusError.kind === 'class'
            ? classesT('archive_dialog.failed')
            : coursesT('visibility_change_failed'),
        )
      : null;

  return (
    <div className="grid gap-5">
      {summaryResult.data ? (
        <ContentSummary active={lens} summary={summaryResult.data} />
      ) : null}

      <Panel
        icon={lensIcons[lens]}
        // A string, so a filter that matches nothing still states "0". As a
        // number, zero is falsy and the pill vanishes exactly when the
        // operator most needs to be told the count is real.
        meta={String(rowCount)}
        title={t(`lens.${lens}`)}
        tone={lensTones[lens]}
      >
        {/* Above the table, not below it. A row action fails at the top of a
            page of twenty-five rows, and a message under the last one is off
            screen at the moment it is needed. */}
        {looseError ? (
          <p
            className="mx-4 mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] font-semibold text-danger"
            role="alert"
          >
            {looseError}
          </p>
        ) : null}
        <DataTable
          className="p-4"
          columns={columns as ColumnDef<never>[]}
          data={(page?.rows ?? []) as never[]}
          emptyMessage={t('table.empty')}
          facets={facets}
          frameless
          layout="fixed"
          loadingLabel={t('table.loading')}
          manual={{
            pageIndex: query.page - 1,
            pageCount: Math.max(1, Math.ceil(rowCount / query.pageSize)),
            rowCount,
            sorting: [{ id: sortColumnId, desc: query.direction === 'desc' }],
            globalFilter: query.query ?? '',
            columnFilters,
            pending: result.isFetching,
            onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
            onSortingChange: (sorting) => {
              const next = sorting[0];
              change(
                next
                  ? {
                      sort: sortKeyOf(next.id),
                      direction: next.desc ? 'desc' : 'asc',
                    }
                  : { sort: 'updatedAt', direction: 'desc' },
              );
            },
            onGlobalFilterChange: (value) => change({ query: value }),
            onColumnFiltersChange: (filters) =>
              change({ academyIds: facetSelection(filters, 'academy') }),
          }}
          // Cast to match the `never` the columns and rows are widened to
          // above: the table is told one row shape per lens by `lens`, and
          // carrying a discriminant in the payload as well would be the same
          // decision made twice.
          onRowClick={openRow as (row: never) => void}
          searchPlaceholder={t(`table.search_${lens}`)}
          // The operator decides which columns this table is for. Courses alone
          // offers eight, and which four matter depends on whether they are
          // auditing curriculum size or chasing a delivery question.
          showColumnVisibility
          toolbarFilters={<ContentTypeChip lens={lens} query={query} />}
        />
      </Panel>

      <ContentDeleteDialog
        academyId={deleteState?.academyId ?? null}
        onClose={() => setDeleteState(null)}
        onDone={() => {
          setDeleteState(null);
          refresh();
        }}
        target={deleteState?.target ?? null}
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
            ? errorText(
                statusError.error,
                coursesT('visibility_change_failed'),
              )
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
              ? errorText(
                  statusError.error,
                  classesT('archive_dialog.failed'),
                )
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
    </div>
  );
}

/**
 * The two names a sort has, and the map between them.
 *
 * TanStack knows a sort by column id; the contract knows it by key. Most agree,
 * two do not — the name column is `name` on classes and `title` elsewhere, and
 * the date column is `updated` against `updatedAt`. Written out in both
 * directions rather than inferred, because getting it wrong in the read
 * direction is silent: the request sorts correctly and the header shows no
 * arrow, so the table looks like it ignored the click.
 */
const sortKeyByColumnId: Record<string, ContentSortKey> = {
  title: 'title',
  name: 'title',
  updated: 'updatedAt',
  classes: 'classes',
  modules: 'modules',
  students: 'students',
  difficulty: 'difficulty',
};

/**
 * A column id as the contract's sort key.
 *
 * Anything unrecognised falls back rather than being forwarded: the value
 * reaches an `orderBy`, and the allowlist that guards it lives in the contract.
 */
function sortKeyOf(columnId: string): ContentSortKey {
  return sortKeyByColumnId[columnId] ?? 'updatedAt';
}

/** The column a sort key points at, for the lens on screen. */
function sortColumnIdOf(sort: ContentSortKey, lens: ContentLens): string {
  if (sort === 'updatedAt') return 'updated';
  if (sort === 'title') return lens === 'classes' ? 'name' : 'title';
  return sort;
}

type AcademyRow = { academyName: string; academySlug: string };

/**
 * Which academy a row belongs to.
 *
 * The same shape on all three lenses, because on this surface "which academy"
 * is the first thing an operator reads. The slug is their handle for one, as
 * it is on the academies table — mono, so the column scans as one shape.
 */
function academyColumn<T extends AcademyRow>(header: string): ColumnDef<T> {
  return {
    id: 'academy',
    header,
    enableSorting: false,
    size: 156,
    meta: { hideable: true },
    cell: ({ row }) => (
      <div className="min-w-0">
        <span className="block truncate text-[13.5px] font-semibold text-ink">
          {row.original.academyName}
        </span>
        <span className="block truncate font-mono text-[12px] text-sub">
          /{row.original.academySlug}
        </span>
      </div>
    ),
  };
}

const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

/**
 * A row's name, over whatever one line best identifies it.
 *
 * The lifecycle state used to live here as a tinted line. It is a column of its
 * own now — a `StateBadge`, the same one the academy detail page uses for the
 * same fact — which is what lets it be compared down the table and hidden by an
 * operator who does not need it. What sits under the name instead is the
 * academy's own description: already on the wire, previously rendered nowhere,
 * and the thing that tells two courses called "Python" apart.
 */
function TitleCell({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-[14px] font-bold text-ink">
        {title}
      </span>
      {subtitle?.trim() ? (
        <span className="block truncate text-[12px] text-sub">{subtitle}</span>
      ) : null}
    </div>
  );
}
