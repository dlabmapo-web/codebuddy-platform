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
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { ArchiveClassDialog } from '@/app/(studio)/academy/[academySlug]/(framed)/classes/_components/archive-class-dialog';
import { VisibilityConfirmModal } from '@/app/(studio)/academy/[academySlug]/(framed)/content/_components/visibility-confirm-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

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
          <RowActions
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
          <RowActions
            deleteLabel={t('content_panel.delete_class')}
            editDisabled={row.original.status === 'ARCHIVED'}
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

      <DeleteDialog
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

/* --------------------------------------------------------------- helpers */

/** Visible/hidden, running/archived — one badge, because they read the same. */
function StateBadge({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
        on ? 'bg-success/10 text-success' : 'bg-retired-soft text-retired'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${on ? 'bg-success' : 'bg-retired'}`}
      />
      {label}
    </span>
  );
}

/** How many course chips fit a row before the rest collapse into `+N`. */
const CHIP_LIMIT = 2;

/**
 * The courses a class teaches, named rather than counted.
 *
 * The chips are for a reader who can see them; the accessible name carries the
 * whole list, so `+2` is never the entire answer a screen reader gets.
 */
function CoursesCell({ courses }: { courses: PlatformClass['courses'] }) {
  const { t } = useTranslation('platform-content');
  if (courses.length === 0) {
    return (
      <span className="text-[13.5px] text-sub/60">{t('table.no_courses')}</span>
    );
  }

  const shown = courses.slice(0, CHIP_LIMIT);
  const rest = courses.length - shown.length;
  return (
    <span
      aria-label={t('table.courses_aria', {
        count: courses.length,
        titles: courses.map((course) => course.title).join(', '),
      })}
      className="flex flex-wrap items-center gap-1"
      role="group"
    >
      {shown.map((course) => (
        <span
          aria-hidden
          className="max-w-[11rem] truncate rounded-md bg-brand-soft px-2 py-0.5 text-[12.5px] font-semibold text-brand"
          key={course.id}
        >
          {course.title}
        </span>
      ))}
      {rest > 0 ? (
        <span
          aria-hidden
          className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[12.5px] font-bold tabular-nums text-sub"
        >
          {t('table.courses_more', { count: rest })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * A class running with nobody teaching it is the one condition on this table
 * worth colour, so the empty case is a warning rather than a dash.
 */
function TeacherCell({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string | null;
}) {
  const { t } = useTranslation('platform-content');
  if (!name) {
    return (
      <span className="whitespace-nowrap rounded-md bg-danger/10 px-2 py-0.5 text-[12.5px] font-bold text-danger">
        {t('table.no_teacher')}
      </span>
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ProfileAvatar alt="" globalImageUrl={avatarUrl} name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold text-ink">
          {name}
        </span>
        <span className="block truncate text-[12.5px] text-sub">
          {t('table.teacher_role')}
        </span>
      </span>
    </span>
  );
}

/** A measurement column: right-aligned, tabular, and grey at zero. */
function countColumn<T>(
  id: string,
  header: string,
  read: (row: T) => number,
  flagZero = false,
): ColumnDef<T> {
  return {
    id,
    accessorFn: (row) => read(row),
    header,
    size: 110,
    cell: ({ row }) => {
      const value = read(row.original);
      return (
        <span
          className={`font-mono text-[15px] tabular-nums ${
            value === 0
              ? flagZero
                ? 'font-bold text-danger'
                : 'text-sub/50'
              : 'font-bold text-ink'
          }`}
        >
          {value}
        </span>
      );
    },
  };
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

/**
 * Open, and a menu — the same shape the academy's own class and course tables
 * use, so an operator moving between them is not learning a second control.
 *
 * Open and Edit are ordinary console links. The destination mounts the same
 * editor component as the academy route, under the console shell.
 */
function RowActions({
  deleteLabel,
  editDisabled = false,
  label,
  onDelete,
  href,
  statusAction,
}: {
  /** "Delete course" or "Delete class" — never the academy's own wording. */
  deleteLabel: string;
  editDisabled?: boolean;
  label: string;
  onDelete: () => void;
  href: string;
  statusAction?: {
    disabled?: boolean;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onSelect: () => void;
  };
}) {
  const { t } = useTranslation('platform');
  const StatusIcon = statusAction?.icon;
  return (
    <div
      className="flex items-center justify-end gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Link
        className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
        href={href}
      >
        {t('table.open')}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t('table.more')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink data-[state=open]:bg-canvas data-[state=open]:text-ink"
            type="button"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[13rem] text-[14.5px]">
          <DropdownMenuLabel className="truncate text-[12.5px]">
            {label}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {editDisabled ? (
            <DropdownMenuItem disabled>
              <Pencil className="text-sub" />
              {t('content_panel.edit')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Pencil className="text-sub" />
                {t('content_panel.edit')}
              </Link>
            </DropdownMenuItem>
          )}
          {statusAction && StatusIcon ? (
            <DropdownMenuItem
              disabled={statusAction.disabled}
              onSelect={statusAction.onSelect}
            >
              <StatusIcon className="text-sub" />
              {statusAction.label}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete}>
            <Trash2 className="text-danger" />
            <span className="text-danger">{deleteLabel}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * One dialog for both kinds.
 *
 * The name typed back, as the academy deletion asks — the three destructive
 * acts in the product should ask the same thing of the person doing them. The
 * server refuses either outright once a student has submitted, which is the
 * guarantee that matters and the one this form cannot make.
 */
function DeleteDialog({
  academyId,
  onClose,
  onDone,
  target,
}: {
  academyId: string;
  onClose: () => void;
  onDone: () => void;
  target:
    | { kind: 'course' | 'class'; id: string; label: string }
    | null;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const [typed, setTyped] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const close = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  const confirmed = Boolean(target) && typed.trim() === target?.label.trim();

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={Boolean(target)}>
      <ModalContent
        description={t(
          target?.kind === 'class'
            ? 'content_delete.class_body'
            : 'content_delete.course_body',
        )}
        title={t('content_delete.title', { name: target?.label ?? '' })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            setBusy(true);
            setError(null);
            try {
              if (target.kind === 'course') {
                await orpc.academyCourses.delete({
                  academyId,
                  courseId: target.id,
                  confirmTitle: typed.trim(),
                });
              } else {
                await orpc.academyClasses.delete({
                  academyId,
                  classId: target.id,
                  confirmName: typed.trim(),
                });
              }
              setTyped('');
              setError(null);
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-1.5 px-6 py-5">
            <label
              className="text-[13.5px] font-bold text-ink"
              htmlFor="content-delete-confirm"
            >
              {t('content_delete.confirm_label', { name: target?.label ?? '' })}
              <span className="ml-1 text-danger">*</span>
            </label>
            <input
              autoComplete="off"
              className="h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/30"
              id="content-delete-confirm"
              onChange={(event) => setTyped(event.target.value)}
              value={typed}
            />
            {error ? (
              <p className="mt-1 text-[13px] text-danger" role="alert">
                {errorText(error)}
              </p>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={busy} onClick={close} type="button" variant="ghost">
              {t('create.cancel')}
            </Button>
            <Button disabled={busy || !confirmed} type="submit" variant="danger">
              {busy ? t('delete.working') : t('delete.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
