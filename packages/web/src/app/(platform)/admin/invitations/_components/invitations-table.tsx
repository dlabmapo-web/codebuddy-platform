'use client';

import type {
  InvitationDeliveryState,
  InvitationStatus,
  ListPlatformInvitationsResult,
  PlatformInvitation,
} from '@cove/shared';
import { invitationDeliveryStates, invitationStatuses } from '@cove/shared';
import { formatShortDate } from '@cove/i18n/format';
import type { ColumnDef, ColumnFiltersState } from '@tanstack/react-table';
import { ArrowRight, Mail, Plus, RotateCcw, ShieldAlert, XCircle } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Panel } from '@/app/(studio)/academy/[academySlug]/(framed)/_components/overview-ui/panel';
import { DeliveryBadge } from '@/app/(studio)/academy/[academySlug]/(framed)/invitations/_components/invitations-table';
import { Button } from '@/components/studio/button';
import { DataTable } from '@/components/studio/data-table';
import { facetSelection } from '@/components/studio/data-table-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { StateBadge } from '../../_lib/content-columns';
import {
  useInvitationsQuery,
  useInvitationsState,
  useResendInvitation,
  useRevokeInvitation,
} from '../../_hooks/use-platform-invitations';
import { InvitationComposer } from './invitation-composer';
import { InvitationsSummary } from './invitations-summary';

/**
 * Every invitation on the platform, and whether it arrived.
 *
 * ## Why a platform operator is looking at this at all
 *
 * They are not this platform's inviter — managers are, and an academy's own
 * Invitations page handles the ordinary case perfectly well. What it cannot
 * handle is an academy with no active manager: inviting, resending and revoking
 * all sit behind `academy.members.manage`, so such an academy cannot invite the
 * person who would come and run it. Those rows are this table's reason to
 * exist, and the `no manager` mark is on the row that explains it.
 *
 * The second reason is the support call. "They never got the email" is
 * unanswerable from inside one academy when the operator does not yet know
 * which academy, and this is the only surface that can look across all of them.
 *
 * ## Status and delivery never merge
 *
 * `invitation-delivery.ts` states the rule: an invitation can be PENDING while
 * its email bounced, and ACCEPTED while its last attempt is still only SENT. So
 * they are two columns with two facets, and the two row actions divide the same
 * way — **Resend** answers a delivery problem, **Revoke** a status one.
 *
 * ## Colour
 *
 * The console's rule, unchanged: hue says what a thing is, loudness says
 * whether it is in trouble. Two conditions are loud here, and both are real
 * faults rather than stages: an academy with nobody who can act, and a delivery
 * that failed.
 */
export function InvitationsTable({
  initialData,
  initialKey,
}: {
  initialData: ListPlatformInvitationsResult | null;
  initialKey: string;
}) {
  const { t } = useTranslation('platform-invitations');
  const { t: common } = useLayoutTranslation('common');
  // The delivery vocabulary the manager's own page reads, mounted by this
  // route rather than by the console's layout — one ladder of evidence, one set
  // of words for it.
  const { t: ops } = useTranslation('people-ops');
  const errorText = useErrorText();
  const locale = useLocale();

  const { query, change } = useInvitationsState();
  const result = useInvitationsQuery(query, initialData, initialKey);
  const page = result.data;
  const resend = useResendInvitation();
  const revoke = useRevokeInvitation();

  const [composing, setComposing] = React.useState(false);
  const [confirming, setConfirming] = React.useState<PlatformInvitation | null>(
    null,
  );

  const busy = resend.isPending || revoke.isPending;

  const columns = React.useMemo<ColumnDef<PlatformInvitation>[]>(
    () => [
      {
        // The one unsized column, so it absorbs the slack and truncates. An
        // invitation *is* an address; a row you cannot read the address of is
        // not a shorter row, it is a broken one.
        id: 'email',
        header: t('table.email'),
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-mono text-[13.5px] font-semibold text-ink">
              {row.original.email}
            </span>
            {row.original.invitedBy ? (
              <span className="block truncate text-[12px] text-sub">
                {t(
                  row.original.invitedBy.isOperator
                    ? 'table.sent_by_us'
                    : 'table.sent_by',
                  { name: row.original.invitedBy.displayName ?? '—' },
                )}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'academy',
        header: t('table.academy'),
        enableSorting: true,
        size: 192,
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
              // Why this row is an operator's problem, said on the row rather
              // than left to be inferred from a summary tile.
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-[11.5px] font-bold text-danger">
                <ShieldAlert className="size-3" strokeWidth={2.5} />
                {t('table.no_manager')}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'role',
        header: t('table.role'),
        enableSorting: false,
        size: 116,
        meta: { hideable: true },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[13.5px]">
            {common(`role.${row.original.role}`)}
          </span>
        ),
      },
      {
        id: 'status',
        header: t('table.status'),
        enableSorting: false,
        size: 116,
        meta: { hideable: true },
        cell: ({ row }) => (
          <StateBadge
            label={common(`invitation_status.${row.original.status}`)}
            on={row.original.status === 'PENDING'}
          />
        ),
      },
      {
        id: 'delivery',
        header: t('table.delivery'),
        enableSorting: false,
        size: 132,
        meta: { hideable: true },
        cell: ({ row }) => <DeliveryBadge delivery={row.original.delivery} />,
      },
      {
        // A date rather than an age, unlike the applications queue: an expiry
        // is a deadline in the future, and "in 5 days" and "5 days ago" are one
        // careless glance apart on a table that shows both live and dead rows.
        id: 'expires',
        header: t('table.expires'),
        size: 112,
        meta: { className: 'max-xl:hidden', hideable: true },
        cell: ({ row }) => (
          <span
            className={cn(
              'whitespace-nowrap text-[13.5px]',
              row.original.status === 'PENDING' ? 'text-sub' : 'text-sub/50',
            )}
          >
            {formatShortDate(row.original.expiresAt, locale)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        enableSorting: false,
        size: 96,
        cell: ({ row }) => (
          <div
            className="flex items-center justify-end gap-0.5"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.status === 'PENDING' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t('table.actions')}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-canvas data-[state=open]:text-ink"
                    type="button"
                  >
                    <Mail className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[15rem] text-[14.5px]">
                  <DropdownMenuLabel className="truncate text-[12.5px]">
                    {row.original.email}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() =>
                      resend.mutate({
                        academyId: row.original.academyId,
                        invitationId: row.original.id,
                      })
                    }
                  >
                    <RotateCcw className="text-sub" />
                    {t('table.resend')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => setConfirming(row.original)}
                  >
                    <XCircle className="text-danger" />
                    <span className="text-danger">{t('table.revoke')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {/* The academy behind the row, for the manager-state questions this
                table raises and cannot answer. */}
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
    [busy, common, locale, resend, t],
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
        options: invitationStatuses.map((status) => ({
          label: common(`invitation_status.${status}`),
          value: status,
        })),
      },
      {
        // Its own facet, never folded into status. The two answer different
        // questions and an invitation is routinely PENDING and BOUNCED at once.
        columnId: 'delivery',
        title: t('facet.delivery'),
        options: invitationDeliveryStates.map((state) => ({
          label: ops(`delivery.state.${state}`),
          value: state,
        })),
      },
      {
        // A one-option facet rather than a switch, so it sits in the same row
        // of chips as the others and clears with them.
        columnId: 'needs',
        title: t('facet.needs_you'),
        options: [{ label: t('facet.needs_you_on'), value: '1' }],
      },
    ],
    [common, ops, page?.academyOptions, t],
  );

  const columnFilters = React.useMemo<ColumnFiltersState>(() => {
    const filters: ColumnFiltersState = [];
    if (query.academyIds?.length) {
      filters.push({ id: 'academy', value: query.academyIds });
    }
    if (query.statuses?.length) {
      filters.push({ id: 'status', value: query.statuses });
    }
    if (query.deliveryStates?.length) {
      filters.push({ id: 'delivery', value: query.deliveryStates });
    }
    if (query.leaderlessOnly) filters.push({ id: 'needs', value: ['1'] });
    return filters;
  }, [query]);

  const rowCount = page?.total ?? 0;
  const filtered = Boolean(
    query.query ||
      query.academyIds?.length ||
      query.statuses?.length ||
      query.deliveryStates?.length ||
      query.leaderlessOnly,
  );

  /**
   * The single academy the facet is narrowed to, if it is narrowed to one.
   *
   * Read from the same `academyOptions` the facet is built from, so the chip,
   * the summary strip and the composer's field can never name it differently.
   */
  const scopedAcademy =
    query.academyIds?.length === 1
      ? (page?.academyOptions.find(
          (option) => option.id === query.academyIds?.[0],
        ) ?? null)
      : null;

  const failure = resend.error ?? revoke.error;

  return (
    <div className="grid gap-5">
      {page ? (
        <InvitationsSummary
          academyName={scopedAcademy?.name}
          summary={page.summary}
        />
      ) : null}

      <Panel
        icon={Mail}
        // A string, so a filter that matches nothing still states "0". As a
        // number, zero is falsy and the pill vanishes exactly when the operator
        // most needs to be told the count is real.
        meta={String(rowCount)}
        title={t('title')}
        tone="brand"
      >
        {/* Above the table, not below it. A row action fails at the top of a
            page of twenty-five rows, and a message under the last one is off
            screen at the moment it is needed. */}
        {failure ? (
          <p
            className="mx-4 mt-4 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] font-semibold text-danger"
            role="alert"
          >
            {errorText(failure, t('table.action_failed'))}
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
              {
                id: query.sort === 'sent' ? 'email' : query.sort,
                desc: query.direction === 'desc',
              },
            ],
            globalFilter: query.query ?? '',
            columnFilters,
            pending: result.isFetching,
            onPageIndexChange: (pageIndex) => change({ page: pageIndex + 1 }),
            onSortingChange: (sorting) => {
              const next = sorting[0];
              change({
                sort:
                  next?.id === 'academy'
                    ? 'academy'
                    : next?.id === 'expires'
                      ? 'expires'
                      : 'sent',
                direction: next?.desc ? 'desc' : 'asc',
              });
            },
            onGlobalFilterChange: (value) => change({ query: value }),
            onColumnFiltersChange: (all) =>
              change({
                academyIds: facetSelection(all, 'academy'),
                statuses: facetSelection(all, 'status') as InvitationStatus[],
                deliveryStates: facetSelection(
                  all,
                  'delivery',
                ) as InvitationDeliveryState[],
                leaderlessOnly:
                  facetSelection(all, 'needs').includes('1') || undefined,
              }),
          }}
          searchPlaceholder={t('table.search')}
          showColumnVisibility
          // Where the studio puts it, so a manager and an operator reach for
          // the same corner.
          toolbarActions={
            <Button onClick={() => setComposing(true)}>
              <Plus />
              {t('composer.open')}
            </Button>
          }
        />
      </Panel>

      <InvitationComposer
        academies={page?.academyOptions ?? []}
        // The facet has already answered "which academy" when it holds exactly
        // one. Asking again is the form charging the operator for the filter
        // they set.
        lockedAcademyId={scopedAcademy?.id ?? null}
        onClose={() => setComposing(false)}
        open={composing}
      />

      <RevokeDialog
        invitation={confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return;
          revoke.mutate({
            academyId: confirming.academyId,
            invitationId: confirming.id,
          });
          setConfirming(null);
        }}
        pending={revoke.isPending}
      />
    </div>
  );
}

/**
 * Revoking asks; resending does not.
 *
 * A resend is additive and reversible by resending again. A revoke kills a link
 * somebody may already be holding, and the recipient learns about it by finding
 * a dead page — so it is the one action here that confirms.
 */
function RevokeDialog({
  invitation,
  onClose,
  onConfirm,
  pending,
}: {
  invitation: PlatformInvitation | null;
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation('platform-invitations');
  const { t: common } = useLayoutTranslation('common');

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={Boolean(invitation)}>
      <ModalContent
        description={t('revoke.body')}
        title={t('revoke.heading', { email: invitation?.email ?? '' })}
      >
        <div className="px-6 py-5">
          <p className="text-[14px] leading-6 text-sub">
            {t('revoke.detail', {
              academy: invitation?.academyName ?? '',
            })}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
          <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
            {common('action.cancel')}
          </Button>
          <Button disabled={pending} onClick={onConfirm} type="button" variant="danger">
            {t('revoke.confirm')}
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
}
