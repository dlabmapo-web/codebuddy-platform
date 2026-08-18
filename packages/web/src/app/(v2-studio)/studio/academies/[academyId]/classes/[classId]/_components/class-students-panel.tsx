'use client';

import type { EnrolledStudentSummary } from '@cove/shared';
import { enrollmentGrantsAccess } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, UserMinus } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation } from '@/i18n';

import { useContentDate } from '../../../content/_components/content-date';
import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import { ClassPanel, ClassPanelEmpty } from './class-panel';
import { ClassRowActions } from './class-row-actions';

/** Above this the roster is worth paging rather than scrolling. */
const PAGE_SIZE = 10;

export function ClassStudentsPanel({
  canEnroll,
  manager,
}: {
  canEnroll: boolean;
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation('classes');
  const contentDate = useContentDate();
  const { detail } = manager;
  const editable = canEnroll && detail.status === 'ACTIVE';

  const displayName = useMemo(
    () => (student: EnrolledStudentSummary) =>
      student.displayName ?? student.email ?? t('detail.students_panel.no_name'),
    [t],
  );

  const columns = useMemo<ColumnDef<EnrolledStudentSummary>[]>(
    () => [
      {
        id: 'student',
        // Both fields feed the search, so a Manager can type either one and
        // still find the row whichever column they were looking at.
        accessorFn: (student) =>
          `${student.displayName ?? ''} ${student.email ?? ''}`,
        header: t('detail.students_panel.column.student'),
        cell: ({ row }) => {
          const student = row.original;
          const name = displayName(student);
          // The row is still on the roster, but a suspended or promoted
          // membership grants nothing — say so rather than implying access.
          const learning = enrollmentGrantsAccess(student);
          return (
            <div className="flex items-start gap-3">
              {/* The shared avatar, not a hand-rolled initial disc: this
                  roster and the people directory show the same person, and two
                  drawings of them is how one page ends up showing a photo the
                  other does not. */}
              <ProfileAvatar
                academyImageUrl={student.academyImageUrl}
                className="mt-0.5"
                externalAvatarUrl={student.externalAvatarUrl}
                globalImageUrl={student.globalImageUrl}
                name={name}
                size="sm"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14.5px] font-bold">{name}</span>
                  {learning ? null : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-draft-soft px-2 py-0.5 text-[12px] font-bold text-draft">
                      <span
                        aria-hidden
                        className="size-1.5 rounded-full bg-draft"
                      />
                      {t('detail.students_panel.inactive')}
                    </span>
                  )}
                </div>
                {learning ? null : (
                  <p className="mt-1 max-w-xs text-[13px] leading-5 text-sub">
                    {student.membershipStatus === 'ACTIVE'
                      ? t('detail.students_panel.inactive_role')
                      : t('detail.students_panel.inactive_suspended')}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'email',
        accessorFn: (student) => student.email ?? '',
        header: t('detail.students_panel.column.email'),
        cell: ({ row }) => (
          <span
            className={`text-[13.5px] ${
              row.original.email ? 'text-sub' : 'text-sub/50'
            }`}
          >
            {row.original.email ?? t('detail.students_panel.no_email')}
          </span>
        ),
      },
      {
        id: 'joined',
        accessorFn: (student) => student.enrolledAt,
        header: t('detail.students_panel.column.joined'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px] text-sub">
            {contentDate(row.original.enrolledAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('detail.students_panel.column.actions'),
        enableSorting: false,
        cell: ({ row }) => {
          if (!editable) return null;
          const student = row.original;
          const name = displayName(student);
          return (
            <div className="flex justify-end">
              <ClassRowActions
                disabled={manager.removalPending}
                icon={UserMinus}
                menuAriaLabel={t('detail.students_panel.row_menu_aria', { name })}
                onRemove={() => manager.askRemoveStudent(student, name)}
                removeLabel={t('detail.students_panel.remove')}
                title={name}
              />
            </div>
          );
        },
      },
    ],
    [contentDate, displayName, editable, manager, t],
  );

  return (
    <ClassPanel
      action={
        editable ? (
          <Button onClick={manager.openEnroll} size="sm">
            <Plus />
            {t('detail.students_panel.add')}
          </Button>
        ) : null
      }
      // A Team Lead reads this roster but cannot change it, so the panel says
      // whose call enrollment is instead of just hiding the controls.
      body={
        canEnroll
          ? t('detail.students_panel.body')
          : `${t('detail.students_panel.body')} ${t('detail.students_panel.manager_only')}`
      }
      count={detail.studentCount}
      heading={t('detail.students_panel.heading')}
    >
      {/* An empty roster gets the plain invitation rather than a bare header
          row: a table with nothing in it answers no question a reader has. */}
      {detail.students.length === 0 ? (
        <ClassPanelEmpty>
          {editable
            ? t('detail.students_panel.empty')
            : t('detail.students_panel.empty_readonly')}
        </ClassPanelEmpty>
      ) : (
        <div className="px-5 py-4">
          <DataTable
            columns={
              // The Actions column would otherwise render an empty header for
              // a Team Lead, who has no row action to take.
              editable
                ? columns
                : columns.filter((column) => column.id !== 'actions')
            }
            data={detail.students}
            emptyMessage={t('detail.students_panel.empty_filtered')}
            frameless
            pageSize={PAGE_SIZE}
            searchPlaceholder={t('detail.students_panel.search_placeholder')}
          />
        </div>
      )}
    </ClassPanel>
  );
}
