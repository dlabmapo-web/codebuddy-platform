'use client';

import { courseHasNoVisibleContent, type CourseSummary } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Trash2,
  Pencil,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

import { DeleteConfirmDialog } from '@/components/studio/delete-confirm-dialog';
import { DataTable } from '@/components/studio/data-table';
import { useContentBasePath } from '@/components/studio/content-base-path-provider';
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

import {
  ProvenanceChips,
  ProvenanceLine,
} from '../../library/_components/provenance-chips';
import type { CoursesManagerState } from '../_hooks/use-courses-manager';
import { useContentDate } from '../../_components/content-date';
import { VisibilityConfirmModal } from '../../_components/visibility-confirm-modal';

function VisibilityIndicator({ isVisible }: { isVisible: boolean }) {
  const { t } = useLayoutTranslation('courses');
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
        isVisible
          ? 'bg-success/10 text-success'
          : 'bg-retired-soft text-retired'
      }`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          isVisible ? 'bg-success' : 'bg-retired'
        }`}
      />
      {isVisible ? t('visible') : t('hidden')}
    </span>
  );
}

/**
 * A published course that can deliver nothing.
 *
 * Students never see such a course at all — one with no visible problems is
 * dropped from their catalogue and from every class it is assigned to, rather
 * than shown empty — so this row is the only place the mistake is visible to
 * somebody who can fix it.
 */
function NoContentChip() {
  const { t } = useLayoutTranslation('courses');
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[12.5px] font-bold text-warning"
      title={t('no_visible_content_hint')}
    >
      <AlertTriangle className="size-3" />
      {t('no_visible_content')}
    </span>
  );
}

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

export function CoursesTable({
  canEdit,
  manager,
  toolbarActions,
}: {
  canEdit: boolean;
  manager: CoursesManagerState;
  toolbarActions?: ReactNode;
}) {
  const contentPaths = useContentBasePath();
  const { t } = useLayoutTranslation('courses');
  // The delete words live in their own namespace: `courses` is a layout one,
  // and an irreversible act two staff surfaces offer should not ride in
  // every student's payload.
  const { t: destructive } = useTranslation('destructive');
  const contentDate = useContentDate();
  const [courseToHide, setCourseToHide] = useState<CourseSummary | null>(null);
  const [toDelete, setToDelete] = useState<CourseSummary | null>(null);

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
              <span className="text-[15px] font-bold">{course.title}</span>
              <p className="mt-0.5 line-clamp-1 text-[13.5px] text-sub">
                {course.description || t('no_description')}
              </p>
              {/*
                Under the title rather than in a column of its own. Most
                academies have no copied courses at all, and an empty column on
                every row of every academy is a worse trade than two chips on
                the few rows that have something to say.
              */}
              {course.provenance ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ProvenanceLine provenance={course.provenance} />
                  <ProvenanceChips provenance={course.provenance} />
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'visibility',
        accessorFn: (course) => String(course.isVisible),
        header: t('column.visibility'),
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <VisibilityIndicator isVisible={row.original.isVisible} />
            {courseHasNoVisibleContent(row.original) ? <NoContentChip /> : null}
          </div>
        ),
      },
      {
        id: 'modules',
        accessorFn: (course) => course.content.modules,
        header: t('column.modules'),
        cell: ({ row }) => <CountCell value={row.original.content.modules} />,
      },
      {
        id: 'lectures',
        accessorFn: (course) => course.content.lectures,
        header: t('column.lectures'),
        cell: ({ row }) => <CountCell value={row.original.content.lectures} />,
      },
      {
        id: 'exercises',
        accessorFn: (course) => course.content.exercises,
        header: t('column.exercises'),
        cell: ({ row }) => <CountCell value={row.original.content.exercises} />,
      },
      {
        id: 'updated',
        accessorFn: (course) => course.updatedAt,
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
          const course = row.original;
          const href = contentPaths.course(course.id);
          return (
            <div className="flex items-center justify-end gap-1">
              <Link
                className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
                href={href}
              >
                {t('open')}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {canEdit ? (
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
                  <DropdownMenuContent
                    align="end"
                    className="w-[13rem] text-[14.5px]"
                  >
                    <DropdownMenuLabel className="truncate text-[12.5px]">
                      {course.title}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => manager.openEdit(course)}>
                      <Pencil className="text-sub" />
                      {t('edit')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        const next = !course.isVisible;
                        if (!next) {
                          setCourseToHide(course);
                          return;
                        }
                        manager.setVisible(course.id, next);
                      }}
                    >
                      {course.isVisible ? (
                        <EyeOff className="text-sub" />
                      ) : (
                        <Eye className="text-sub" />
                      )}
                      {course.isVisible ? t('hide') : t('show')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {/* Hiding is the reversible answer for a course that should
                        stop being taught; this unmakes one. The server refuses
                        it once a student has submitted through the course. */}
                    <DropdownMenuItem onSelect={() => setToDelete(course)}>
                      <Trash2 className="text-danger" />
                      <span className="text-danger">{destructive('course.delete')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        },
      },
    ],
    [canEdit, contentDate, contentPaths, destructive, manager, t],
  );

  return (
    <>
      <DataTable
        columns={columns}
        data={manager.courses}
        emptyMessage={t('empty')}
        facets={[
          {
            columnId: 'visibility',
            title: t('column.visibility'),
            options: [
              { label: t('visible'), value: 'true', icon: Eye },
              { label: t('hidden'), value: 'false', icon: EyeOff },
            ],
          },
        ]}
        pageSize={10}
        searchPlaceholder={t('search_placeholder')}
        toolbarActions={toolbarActions}
      />
      <DeleteConfirmDialog
        body={destructive('course.delete_body')}
        cancelLabel={destructive('course.cancel')}
        confirmLabel={destructive('course.delete_confirm')}
        fieldLabel={destructive('course.delete_confirm_label', { name: toDelete?.title ?? '' })}
        workingLabel={destructive('course.delete_working')}
        confirmValue={toDelete?.title ?? ''}
        onClose={() => setToDelete(null)}
        onConfirm={(typed) => manager.deleteCourse(toDelete!.id, typed)}
        open={toDelete !== null}
        pending={manager.deletePending}
        title={destructive('course.delete_title', { name: toDelete?.title ?? '' })}
      />
      {courseToHide ? (
        <VisibilityConfirmModal
          affected={[
            { label: t('column.modules'), value: courseToHide.content.modules },
            {
              label: t('column.lectures'),
              value: courseToHide.content.lectures,
            },
            {
              label: t('column.exercises'),
              value: courseToHide.content.exercises,
            },
          ]}
          itemTitle={courseToHide.title}
          kindLabel={t('kind_course')}
          onCancel={() => setCourseToHide(null)}
          onConfirm={() => {
            manager.setVisible(courseToHide.id, false);
            setCourseToHide(null);
          }}
          open
        />
      ) : null}
    </>
  );
}
