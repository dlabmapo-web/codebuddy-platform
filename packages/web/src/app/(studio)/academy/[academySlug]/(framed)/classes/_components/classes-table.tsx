'use client';

import { useContentBasePath } from '@/components/studio/content-base-path-provider';

import type {
  AssignedCourseSummary,
  AssignedTeacherSummary,
  ClassSummary,
} from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Archive,
  ArrowRight,
  CircleCheck,
  CircleSlash,
  MoreHorizontal,
  Trash2,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import { DataTable } from '@/components/studio/data-table';
import { DeleteConfirmDialog } from '@/components/studio/delete-confirm-dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';

import { useContentDate } from '../../content/_components/content-date';
import { teacherAssignmentState } from '../[classId]/_lib/teacher-assignment';
import type { ClassesManagerState } from '../_hooks/use-classes-manager';
import { ArchiveClassDialog } from './archive-class-dialog';
import { ClassStatusBadge } from './class-status-badge';

/** How many course chips fit a row before the rest collapse into `+N`. */
const CHIP_LIMIT = 2;

function CoursesCell({ courses }: { courses: AssignedCourseSummary[] }) {
  const { t } = useLayoutTranslation('classes');
  if (courses.length === 0) {
    return <span className="text-[13.5px] text-sub/60">{t('courses_cell.none')}</span>;
  }

  const shown = courses.slice(0, CHIP_LIMIT);
  const rest = courses.length - shown.length;
  return (
    // The chips are decoration for a reader who can see them; the accessible
    // name carries the complete list, so `+2` is never the whole answer.
    <span
      aria-label={t('courses_cell.aria', {
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
          className="rounded-md bg-canvas px-2 py-0.5 font-mono text-[12.5px] font-bold text-sub tabular-nums"
        >
          {t('courses_cell.more', { count: rest })}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Three states, and the middle one is the point: a class can store a teacher
 * whose membership no longer grants anything. Showing that row as though it
 * were staffed is the failure this cell exists to prevent, so an unavailable
 * assignment keeps the name and says plainly that it grants nothing.
 */
function TeacherCell({ teacher }: { teacher: AssignedTeacherSummary | null }) {
  const { t } = useLayoutTranslation('classes');
  if (!teacher) {
    return (
      <span className="text-[13.5px] text-sub/60">{t('teacher_cell.none')}</span>
    );
  }

  // The list carries no email, so the name falls back to the label directly.
  const name = teacher.displayName ?? t('detail.teacher_panel.no_name');
  const effective = teacherAssignmentState(teacher) === 'active';
  return (
    <span
      aria-label={
        effective
          ? t('teacher_cell.aria_assigned', { name })
          : t('teacher_cell.aria_unavailable', { name })
      }
      className="flex min-w-0 items-center gap-2"
    >
      <span
        aria-hidden
        className={`grid size-7 shrink-0 place-items-center rounded-full text-[12.5px] font-bold ${
          effective ? 'bg-primary-light text-primary' : 'bg-draft-soft text-draft'
        }`}
      >
        {name.trim().charAt(0).toUpperCase()}
      </span>
      <span aria-hidden className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{name}</span>
        {effective ? (
          <span className="block truncate text-[12.5px] text-sub">
            {t('teacher_cell.role')}
          </span>
        ) : (
          <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-draft-soft px-1.5 py-0.5 text-[11.5px] font-bold text-draft">
            <span className="size-1.5 rounded-full bg-draft" />
            {t('teacher_cell.unavailable')}
          </span>
        )}
      </span>
    </span>
  );
}

export function ClassesTable({
  manager,
  toolbarActions,
}: {
  manager: ClassesManagerState;
  toolbarActions?: ReactNode;
}) {
  const contentPaths = useContentBasePath();
  const { t } = useLayoutTranslation('classes');
  // The delete words live in their own namespace: `classes` is a layout one,
  // and an irreversible act two staff surfaces offer should not ride in
  // every student's payload.
  const { t: destructive } = useTranslation('destructive');
  const contentDate = useContentDate();
  const isMobile = useIsMobile();
  const [toArchive, setToArchive] = useState<ClassSummary | null>(null);
  const [toDelete, setToDelete] = useState<ClassSummary | null>(null);

  const columns = useMemo<ColumnDef<ClassSummary>[]>(
    () => [
      {
        id: 'class',
        accessorFn: (record) => `${record.name} ${record.description}`,
        header: t('column.class'),
        cell: ({ row }) => {
          const teacher = row.original.assignedTeacher;
          return (
            <div className="min-w-0 max-w-md">
              <span className="text-[15px] font-bold">{row.original.name}</span>
              <p className="mt-0.5 line-clamp-1 text-[13.5px] text-sub">
                {row.original.description || t('no_description')}
              </p>
              {/* The teacher column is dropped on a narrow viewport rather
                  than pushing the table sideways, so its answer moves here. */}
              {isMobile ? (
                <p className="mt-1 truncate text-[12.5px] font-semibold text-sub">
                  {teacher
                    ? `${t('column.teacher')}: ${
                        teacher.displayName ?? t('detail.teacher_panel.no_name')
                      }${
                        teacherAssignmentState(teacher) === 'active'
                          ? ''
                          : ` · ${t('teacher_cell.unavailable')}`
                      }`
                    : t('teacher_cell.aria_none')}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorFn: (record) => record.status,
        header: t('column.status'),
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => <ClassStatusBadge status={row.original.status} />,
      },
      {
        id: 'courses',
        accessorFn: (record) =>
          record.courses.map((course) => course.title).join(' '),
        header: t('column.courses'),
        enableSorting: false,
        cell: ({ row }) => <CoursesCell courses={row.original.courses} />,
      },
      {
        id: 'students',
        accessorFn: (record) => record.studentCount,
        header: t('column.students'),
        cell: ({ row }) => (
          <span
            className={`font-mono text-[15px] tabular-nums ${
              row.original.studentCount === 0
                ? 'text-sub/50'
                : 'font-bold text-ink'
            }`}
          >
            {row.original.studentCount}
          </span>
        ),
      },
      {
        id: 'teacher',
        // Sorting and search both run on the name, so an unassigned class
        // sorts with the other blanks rather than under a literal label.
        accessorFn: (record) => record.assignedTeacher?.displayName ?? '',
        header: t('column.teacher'),
        cell: ({ row }) => <TeacherCell teacher={row.original.assignedTeacher} />,
      },
      {
        id: 'updated',
        accessorFn: (record) => record.updatedAt,
        header: t('column.updated'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {contentDate(row.original.updatedAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('column.actions'),
        enableSorting: false,
        cell: ({ row }) => {
          const record = row.original;
          const archived = record.status === 'ARCHIVED';
          return (
            <div className="flex items-center justify-end gap-1">
              <Link
                className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                href={contentPaths.class(record.id)}
              >
                {t('open')}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t('row_menu_aria', { name: record.name })}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink data-[state=open]:bg-canvas data-[state=open]:text-ink"
                    type="button"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[13rem] text-[14.5px]">
                  <DropdownMenuLabel className="truncate text-[12.5px]">
                    {record.name}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={archived}
                    onSelect={() => manager.openEdit(record)}
                  >
                    <Pencil className="text-sub" />
                    {t('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={manager.statusPendingId === record.id}
                    onSelect={() => {
                      // Restoring is safe and reversible, so it goes straight
                      // through; archiving revokes access and is confirmed.
                      if (archived) manager.setStatus(record.id, 'ACTIVE');
                      else setToArchive(record);
                    }}
                  >
                    {archived ? (
                      <RotateCcw className="text-sub" />
                    ) : (
                      <Archive className="text-sub" />
                    )}
                    {archived ? t('restore') : t('archive')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {/* Under a separator and in danger: archiving ends a class
                      and keeps it, this unmakes one. The server refuses it
                      outright once anybody has submitted through the class. */}
                  <DropdownMenuItem onSelect={() => setToDelete(record)}>
                    <Trash2 className="text-danger" />
                    <span className="text-danger">{destructive('class.delete')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [contentDate, contentPaths, destructive, isMobile, manager, t],
  );

  return (
    <>
      <DataTable
        columns={
          // Six columns do not fit a phone. The teacher answer is not dropped,
          // only moved into the class cell above.
          isMobile ? columns.filter((column) => column.id !== 'teacher') : columns
        }
        data={manager.classes}
        // A filtered-empty table must not claim the academy has no classes.
        emptyMessage={
          manager.classes.length === 0 ? t('empty') : t('empty_filtered')
        }
        facets={[
          {
            columnId: 'status',
            title: t('column.status'),
            options: [
              { label: t('status.ACTIVE'), value: 'ACTIVE', icon: CircleCheck },
              {
                label: t('status.ARCHIVED'),
                value: 'ARCHIVED',
                icon: CircleSlash,
              },
            ],
          },
        ]}
        pageSize={10}
        searchPlaceholder={t('search_placeholder')}
        toolbarActions={toolbarActions}
      />
      <DeleteConfirmDialog
        body={destructive('class.delete_body')}
        cancelLabel={destructive('class.cancel')}
        confirmLabel={destructive('class.delete_confirm')}
        fieldLabel={destructive('class.delete_confirm_label', { name: toDelete?.name ?? '' })}
        workingLabel={destructive('class.delete_working')}
        confirmValue={toDelete?.name ?? ''}
        onClose={() => setToDelete(null)}
        onConfirm={(typed) => manager.deleteClass(toDelete!.id, typed)}
        open={toDelete !== null}
        pending={manager.deletePending}
        title={destructive('class.delete_title', { name: toDelete?.name ?? '' })}
      />
      {toArchive ? (
        <ArchiveClassDialog
          courseCount={toArchive.courses.length}
          name={toArchive.name}
          onCancel={() => setToArchive(null)}
          onConfirm={() => {
            manager.setStatus(toArchive.id, 'ARCHIVED');
            setToArchive(null);
          }}
          pending={manager.statusPendingId === toArchive.id}
          studentCount={toArchive.studentCount}
        />
      ) : null}
    </>
  );
}
