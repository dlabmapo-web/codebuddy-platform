'use client';

import type {
  AcademyRole,
  ListPlatformApplicationsResult,
  PlatformApplication,
} from '@cove/shared';
import { approvableRoles, joinRequestStatuses } from '@cove/shared';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { ArrowRight, Inbox, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { ReviewModal } from '@/app/(studio)/academy/[academySlug]/(framed)/applications/_components/review-modal';
import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import {
  useApplicationReview,
  useApplicationsQuery,
  useApplicationsState,
} from '../../_hooks/use-platform-applications';
import { waitedFor } from '../_lib/waited-for';
import { ApplicationsSummary } from './applications-summary';

/**
 * Everyone waiting to be let into an academy, in the table the console uses
 * everywhere else.
 *
 * ## Why a platform operator is looking at this at all
 *
 * They are not this platform's application reviewer — managers are. An
 * academy's own Applications page is behind `academy.applications.review`,
 * which `MANAGER` and `TEAM_LEAD` hold, and it handles the ordinary case
 * perfectly well.
 *
 * What it cannot handle is an academy that has neither role in it, which is
 * every academy created open and every academy whose only manager was
 * suspended. Those applicants wait in a queue nobody is permitted to open. So
 * this table exists for them, and everything about it — the ordering, the
 * summary above it, the sidebar badge — is arranged to make *those* rows the
 * ones an operator sees first and the rest easy to leave alone.
 *
 * ## Colour
 *
 * The console's rule, unchanged: hue says what a thing is, loudness says
 * whether it is in trouble. Exactly one condition here is loud — an academy
 * with no manager — and it is stated on the row that it explains, in the
 * academy cell, rather than left to be inferred from the row's position.
 */
export function ApplicationsTable({
  initialData,
  initialKey,
}: {
  initialData: ListPlatformApplicationsResult | null;
  initialKey: string;
}) {
  const { t } = useTranslation('platform-applications');
  const { t: common } = useLayoutTranslation('common');
  const errorText = useErrorText();
  const locale = useLocale();
  const router = useRouter();

  const { query, change } = useApplicationsState();
  const result = useApplicationsQuery(query, initialData, initialKey);
  const page = result.data;
  const review = useApplicationReview();

  const [reviewing, setReviewing] = React.useState<PlatformApplication | null>(
    null,
  );

  const columns = React.useMemo<ColumnDef<PlatformApplication>[]>(
    () => [
      {
        // The one unsized column, so it absorbs the slack and truncates: a name
        // and an email are the longest things here and the two an operator
        // actually reads across.
        id: 'applicant',
        header: t('table.applicant'),
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => {
          const { user } = row.original;
          const name =
            user.displayName ?? user.email ?? common('fallback.user');
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              {/* An applicant is not a member yet, so only their own account
                  photo exists — the chain falls through to the placeholder,
                  which is the honest picture of somebody nobody has met. */}
              <ProfileAvatar
                externalAvatarUrl={user.externalAvatarUrl}
                globalImageUrl={user.globalImageUrl}
                name={name}
                size="sm"
              />
              <div className="min-w-0">
                <span className="block truncate text-[14px] font-bold text-ink">
                  {name}
                </span>
                <span className="block truncate font-mono text-[12px] text-sub">
                  {user.email ?? '—'}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'academy',
        header: t('table.academy'),
        enableSorting: false,
        size: 196,
        meta: { hideable: true },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-ink">
              {row.original.academyName}
            </span>
            {row.original.academyHasManager ? (
              <span className="block truncate font-mono text-[12px] text-sub">
                /{row.original.academySlug}
              </span>
            ) : (
              // The reason this row is at the top of the queue, said on the
              // row rather than left to be inferred from the ordering.
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[11.5px] font-bold text-danger">
                <ShieldAlert className="size-3" strokeWidth={2.5} />
                {t('table.no_manager')}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'message',
        header: t('table.message'),
        enableSorting: false,
        size: 260,
        meta: { hideable: true },
        cell: ({ row }) =>
          row.original.message ? (
            <p className="line-clamp-2 text-[13px] leading-[1.5] text-sub">
              {row.original.message}
            </p>
          ) : (
            <span className="text-[13px] text-sub/60">
              {t('table.no_message')}
            </span>
          ),
      },
      {
        // An age, not a date. "3 days" answers the question an operator has
        // about a queue; "30 Aug" has to be subtracted from today first. The
        // exact timestamp is on the title attribute for anybody who needs it.
        id: 'waiting',
        header: t('table.waiting'),
        size: 108,
        meta: { hideable: true },
        cell: ({ row }) => {
          const age = waitedFor(row.original.createdAt);
          return (
            <span
              className={cn(
                'whitespace-nowrap text-[13.5px]',
                age.days >= 3 && !row.original.academyHasManager
                  ? 'font-bold text-danger'
                  : 'text-sub',
              )}
              title={new Date(row.original.createdAt).toLocaleString(locale)}
            >
              {t(`age.${age.unit}`, { count: age.value })}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: t('table.status'),
        enableSorting: false,
        size: 116,
        meta: { hideable: true },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        size: 132,
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.status === 'PENDING' ? (
              <Button
                disabled={review.isPending}
                onClick={() => setReviewing(row.original)}
                size="sm"
              >
                {t('table.review')}
              </Button>
            ) : null}
            {/* The academy behind the row, for an operator who needs context
                before deciding — how many members it has, what it teaches. */}
            <Link
              aria-label={t('table.open_academy')}
              className="group grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href={routes.adminAcademy(row.original.academySlug)}
              title={t('table.open_academy')}
            >
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        ),
      },
    ],
    [common, locale, review.isPending, t],
  );

  const facets = React.useMemo(
    () => [
      {
        columnId: 'academy',
        title: t('facet.academy'),
        options: (page?.academyOptions ?? []).map((academy) => ({
          label: academy.name,
          value: academy.id,
        })),
      },
      {
        columnId: 'status',
        title: t('facet.status'),
        options: joinRequestStatuses.map((status) => ({
          label: common(`join_request_status.${status}`),
          value: status,
        })),
      },
      {
        // A one-option facet rather than a switch, so it sits in the same row
        // of chips as the other two and clears with them.
        columnId: 'needs',
        title: t('facet.needs_you'),
        options: [{ label: t('facet.needs_you_on'), value: '1' }],
      },
    ],
    [common, page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (query.academyIds?.length) {
      filters.push({ id: 'academy', value: query.academyIds });
    }
    if (query.statuses?.length) {
      filters.push({ id: 'status', value: query.statuses });
    }
    if (query.leaderlessOnly) filters.push({ id: 'needs', value: ['1'] });
    return filters;
  }, [query]);

  const rowCount = page?.total ?? 0;
  const filtered = Boolean(
    query.query ||
      query.academyIds?.length ||
      query.statuses?.length ||
      query.leaderlessOnly,
  );

  return (
    <div className="grid gap-5">
      {page ? <ApplicationsSummary summary={page.summary} /> : null}

      <Panel
        icon={Inbox}
        meta={String(rowCount)}
        title={t('title')}
        // The queue itself is not a problem; the rows inside it may be. Colour
        // stays reserved for the academy cell that has no manager.
        tone="brand"
      >
        {review.isError ? (
          <p
            className="mx-4 mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] font-semibold text-danger"
            role="alert"
          >
            {errorText(review.error)}
          </p>
        ) : null}
        <DataTable
          className="p-4"
          columns={columns}
          data={page?.rows ?? []}
          emptyMessage={filtered ? t('table.empty_filtered') : t('table.empty')}
          facets={facets}
          frameless
          layout="fixed"
          loadingLabel={t('table.loading')}
          manual={{
            pageIndex: query.page - 1,
            pageCount: Math.max(1, Math.ceil(rowCount / query.pageSize)),
            rowCount,
            sorting: [
              { id: query.sort === 'academy' ? 'academy' : 'waiting', desc: query.direction === 'desc' },
            ],
            globalFilter: query.query ?? '',
            columnFilters,
            pending: result.isFetching,
            onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
            onSortingChange: (sorting) => {
              const next = sorting[0];
              change({
                sort: next?.id === 'academy' ? 'academy' : 'waiting',
                direction: next?.desc ? 'desc' : 'asc',
              });
            },
            onGlobalFilterChange: (value) => change({ query: value }),
            onColumnFiltersChange: (all) =>
              change({
                academyIds: facetSelection(all, 'academy'),
                statuses: facetSelection(
                  all,
                  'status',
                ) as ListPlatformApplicationsResult['rows'][number]['status'][],
                leaderlessOnly:
                  facetSelection(all, 'needs').includes('1') || undefined,
              }),
          }}
          searchPlaceholder={t('table.search')}
          showColumnVisibility
        />
      </Panel>

      <ReviewModal
        approveBlockedReason={(role, reason) =>
          // §5.4 of the onboarding design, and enforced here rather than in the
          // shared `review` procedure because it is a property of *this*
          // surface: a manager seating a member of the academy they already run
          // is not making this decision.
          reviewing &&
          !reviewing.academyHasManager &&
          role === 'MANAGER' &&
          !reason.trim()
            ? t('review.first_manager_reason_required')
            : null
        }
        disabled={review.isPending}
        notice={
          reviewing && !reviewing.academyHasManager ? (
            <div className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-bold text-danger">
                <ShieldAlert className="size-4" strokeWidth={2.5} />
                {t('review.first_manager_title')}
              </p>
              <p className="mt-1.5 text-[13px] leading-[1.6] text-sub">
                {t('review.first_manager_body')}
              </p>
            </div>
          ) : null
        }
        onApprove={(role, reason) => {
          if (!reviewing) return;
          review.mutate({
            academyId: reviewing.academyId,
            requestId: reviewing.id,
            decision: 'APPROVE',
            role,
            reason,
          });
          setReviewing(null);
          router.refresh();
        }}
        onClose={() => setReviewing(null)}
        onReject={(reason) => {
          if (!reviewing) return;
          review.mutate({
            academyId: reviewing.academyId,
            requestId: reviewing.id,
            decision: 'REJECT',
            reason,
          });
          setReviewing(null);
          router.refresh();
        }}
        request={reviewing}
        // An operator reaches the academy through the platform branch, which
        // reports `MANAGER` — so all four roles, including the one that seats
        // the academy's first manager. A team lead never reaches this page.
        roles={approvableRoles('MANAGER' satisfies AcademyRole)}
      />
    </div>
  );
}

const statusTone: Record<string, string> = {
  PENDING: 'bg-draft-soft text-draft',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-danger/10 text-danger',
  CANCELLED: 'bg-retired-soft text-retired',
};

/** The same badge the academy's own applications table draws, so one status
 *  does not wear two vocabularies across two pages. */
function StatusBadge({ status }: { status: PlatformApplication['status'] }) {
  const { t } = useLayoutTranslation('common');
  return (
    <span
      className={cn(
        'inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold',
        statusTone[status] ?? 'bg-retired-soft text-retired',
      )}
    >
      {t(`join_request_status.${status}`)}
    </span>
  );
}
