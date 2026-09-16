'use client';

import type { MemberAvatarUrls, TeacherRoster } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import type { PeoplePageSize } from '@cove/shared';
import { DEFAULT_PEOPLE_PAGE_SIZE } from '@cove/shared';

import { DataTable } from '@/components/studio/data-table';
import { PageSizePicker } from '@/components/studio/page-size-picker';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useErrorText } from '@/i18n/client/use-error-text';
import { routes } from '@/lib/routes';

import { ProfileLinkCell, RosterFailure } from '../../../_components/roster-parts';
import { compactDate } from '../../../_lib/compact-date';
import {
  useStudentsState,
  useTeacherRosterQuery,
} from '../_hooks/use-teacher-students';

/**
 * A teacher's own students, as one table.
 *
 * ## Why it is a table and not an analytics surface
 *
 * This page answers "who do I teach, and where do they stand" — identity and
 * standing, nothing measured over a period and nothing narrowed by a lecture.
 * It is therefore the same table the academy's rosters are: the studio's
 * `DataTable`, with its search box, its sortable headers, its column menu and
 * its faceted filters. A teacher who has learned one of this product's tables
 * has learned this one, and none of the analytics scope controls appear here
 * because none of them mean anything to the question.
 *
 * ## One row per seat, not per student
 *
 * A student in two of this teacher's classes is two rows, because their
 * standing is two standings — the platform ranks within a class and nowhere
 * else, and a single row would have to pick one of them or invent a third.
 * The Class column is what makes that legible, and sorting or filtering by it
 * is how a teacher with several classes reads the table one class at a time.
 *
 * ## Sorted and filtered here, not on the server
 *
 * The roster arrives whole — a teacher's scope is bounded by assignment, and
 * the service caps it — so the table owns its own sorting and searching. There
 * is no page to turn and therefore no order the server has to agree with.
 */
export function StudentRosterView({
  academyId,
  academySlug,
  initialData,
  initialKey,
}: {
  academyId: string;
  academySlug: string;
  initialData: TeacherRoster | null;
  initialKey: string;
}) {
  const { t, i18n } = useTranslation('teaching');
  const errorText = useErrorText();
  const { query } = useStudentsState();
  const roster = useTeacherRosterQuery(academyId, query, initialData, initialKey);
  const data = roster.data;

  const numbers = React.useMemo(
    () => new Intl.NumberFormat(i18n.language),
    [i18n.language],
  );

  /**
   * How many rows a page holds.
   *
   * Local state, not a URL parameter, and the difference from the academy's
   * rosters is deliberate: those page on the server, so their size decides
   * which rows are fetched and has to survive a shared link. Every row here is
   * already in the browser, so the size decides nothing but how much is drawn
   * — a preference for this sitting, not part of what the address describes.
   */
  const [pageSize, setPageSize] = React.useState<PeoplePageSize>(
    DEFAULT_PEOPLE_PAGE_SIZE,
  );

  /**
   * The grouped response, flattened to seats.
   *
   * The contract groups by class because a board is per class; a table reads
   * better as rows. Nothing is lost in the flattening — the class each
   * standing belongs to travels with it.
   */
  const rows = React.useMemo<RosterSeat[]>(
    () =>
      (data?.classes ?? []).flatMap((entry) =>
        entry.students.map((student) => ({
          key: `${student.membershipId}:${entry.classId}`,
          membershipId: student.membershipId,
          displayName: student.displayName,
          username: student.username,
          joinedAt: student.joinedAt,
          avatar: student.avatar,
          className: entry.name,
          solvedProblems: student.solvedProblems,
          ...(student.points === undefined ? {} : { points: student.points }),
          ...(student.position === undefined
            ? {}
            : { position: student.position }),
        })),
      ),
    [data?.classes],
  );

  const pointsEnabled = data?.pointsEnabled ?? false;

  const columns = React.useMemo<ColumnDef<RosterSeat>[]>(
    () => [
      {
        id: 'position',
        accessorFn: (row) => row.position ?? Number.MAX_SAFE_INTEGER,
        header: t('roster.column.position'),
        size: 64,
        enableHiding: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block font-mono text-[12.5px] font-bold tabular-nums text-sub">
            {/* An em dash, not a zero and not a last place: this student has
                no position, which is a different claim from having a low one. */}
            {row.original.position === undefined
              ? '—'
              : numbers.format(row.original.position)}
          </span>
        ),
      },
      {
        id: 'displayName',
        accessorFn: (row) => row.displayName,
        header: t('roster.column.student'),
        cell: ({ row }) => (
          <span className="flex min-w-0 items-center gap-2.5">
            <ProfileAvatar
              academyImageUrl={row.original.avatar.academyImageUrl}
              externalAvatarUrl={row.original.avatar.externalAvatarUrl}
              globalImageUrl={row.original.avatar.globalImageUrl}
              name={row.original.displayName}
              size="sm"
            />
            <span className="block min-w-0 truncate font-bold text-ink">
              {row.original.displayName}
            </span>
          </span>
        ),
      },
      {
        id: 'username',
        accessorFn: (row) => row.username ?? '',
        header: t('roster.column.id'),
        size: 140,
        cell: ({ row }) => (
          <span className="block truncate font-mono text-[12.5px] text-sub">
            {row.original.username ?? '—'}
          </span>
        ),
      },
      {
        id: 'className',
        accessorFn: (row) => row.className,
        header: t('roster.column.class'),
        size: 180,
        filterFn: 'arrIncludesSome',
        cell: ({ row }) => (
          <span className="block truncate text-[13px] text-ink">
            {row.original.className}
          </span>
        ),
      },
      {
        id: 'joinedAt',
        accessorFn: (row) => row.joinedAt ?? '',
        header: t('roster.column.joined'),
        size: 112,
        meta: { align: 'right', hideable: true },
        cell: ({ row }) => (
          <span className="block font-mono text-[12.5px] tabular-nums text-sub">
            {row.original.joinedAt
              ? compactDate(row.original.joinedAt, i18n.language)
              : '—'}
          </span>
        ),
      },
      {
        id: 'solvedProblems',
        accessorFn: (row) => row.solvedProblems,
        header: t('roster.column.solved'),
        size: 96,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="block font-mono text-[13px] tabular-nums text-ink">
            {numbers.format(row.original.solvedProblems)}
          </span>
        ),
      },
      // Not built at all when the academy keeps no score, rather than built
      // and filled with zeroes — see the roster contract.
      ...(pointsEnabled
        ? ([
            {
              id: 'points',
              accessorFn: (row) => row.points ?? 0,
              header: t('roster.column.points'),
              size: 96,
              meta: { align: 'right' },
              cell: ({ row }) => (
                <span className="block font-mono text-[13px] font-bold tabular-nums text-ink">
                  {row.original.points === undefined
                    ? '—'
                    : numbers.format(row.original.points)}
                </span>
              ),
            },
          ] satisfies ColumnDef<RosterSeat>[])
        : []),
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        enableHiding: false,
        size: 56,
        cell: ({ row }) => (
          <ProfileLinkCell
            href={routes.academyStudent(academySlug, row.original.membershipId)}
            label={t('roster.open_student', {
              name: row.original.displayName,
            })}
          />
        ),
      },
    ],
    [academySlug, i18n.language, numbers, pointsEnabled, t],
  );

  if (roster.isError && !data) {
    return (
      <RosterFailure
        message={errorText(roster.error, t('roster.failed'))}
        onRetry={() => void roster.refetch()}
        retryLabel={t('roster.retry')}
        title={t('roster.title')}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data?.truncated ? (
        <p
          className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] font-semibold text-warning"
          role="status"
        >
          {t('roster.truncated')}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={rows}
        emptyMessage={t('roster.empty')}
        facets={[
          {
            columnId: 'className',
            title: t('roster.class'),
            options: (data?.classOptions ?? []).map((option) => ({
              label: option.label,
              value: option.label,
            })),
          },
        ]}
        initialColumnVisibility={{ joinedAt: false }}
        layout="fixed"
        loadingLabel={t('roster.loading')}
        pageSize={pageSize}
        resizable
        searchPlaceholder={t('roster.search')}
        toolbarActions={
          <PageSizePicker
            onChange={(size) => setPageSize(size)}
            value={pageSize}
          />
        }
      />
    </div>
  );
}

/**
 * One student in one of this teacher's classes.
 *
 * `points` and `position` stay optional exactly as the contract has them: a
 * student with no standing is not a student ranked last, and a zero here would
 * say the second thing.
 */
type RosterSeat = {
  key: string;
  membershipId: string;
  displayName: string;
  username: string | null;
  joinedAt: string | null;
  avatar: MemberAvatarUrls;
  className: string;
  solvedProblems: number;
  points?: number;
  position?: number;
};
