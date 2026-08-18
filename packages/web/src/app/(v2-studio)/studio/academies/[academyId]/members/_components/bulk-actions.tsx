'use client';

import type {
  AcademyRole,
  BulkConsequenceKind,
  BulkOptions,
  BulkPreview,
  BulkResult,
  PeopleSelection,
} from '@cove/shared';
import { academyRoles, toCsv } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  Download,
  LayoutGrid,
  ShieldOff,
  TriangleAlert,
  UserCheck,
  UserCog,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { downloadCsv } from '../_lib/upload-workbook';

/**
 * The bulk action bar, and the confirmation that stands between it and a
 * mutation.
 *
 * §12's rules made visible. Three of them shape everything here.
 *
 * *A selection is a filter, never a list of ids.* Ticking rows produces
 * `{ mode: 'ids' }`; "select all matching" produces `{ mode: 'filter' }` with
 * the exclusions. The browser never expands the second one — it does not know
 * the ids and must not learn them, because the set it would send is the set as
 * it was when the page rendered.
 *
 * *Nothing is applied without a preview.* The confirmation is not a "are you
 * sure": it states the exact count the server resolved, what will be blocked,
 * and the consequences the table cannot show — that four of these teachers run
 * classes which will be left unstaffed, that eleven of these students will lose
 * every class place. Those are the facts a manager needs and the directory has
 * no column for.
 *
 * *A confirmed operation runs once.* The idempotency key is generated when the
 * dialog opens, not when Confirm is pressed, so a double-click sends the same
 * key twice and gets one operation with one result.
 */
export function BulkActions({
  academyId,
  classes,
  filteredTotal,
  onApplied,
  peopleRevision,
  selection,
  selectedCount,
  onClearSelection,
  onSelectAllFiltered,
  allFilteredSelected,
}: {
  academyId: string;
  classes: { id: string; name: string }[];
  filteredTotal: number;
  onApplied: () => void;
  peopleRevision: number;
  selection: PeopleSelection | null;
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  allFilteredSelected: boolean;
}) {
  const { t } = useTranslation('people-ops');
  const [pending, setPending] = React.useState<BulkOptions | null>(null);

  if (selectedCount === 0 || !selection) return null;

  return (
    <>
      {/*
       * Sticky to the bottom of the viewport rather than pinned above the
       * table. A manager selecting people scrolls while they do it, and a bar
       * that scrolled away would leave them holding a selection with no way to
       * act on it and no obvious way to clear it.
       */}
      <div className="sticky bottom-4 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 shadow-[var(--shadow-modal)]">
        <span className="rounded-full bg-brand/10 px-2.5 py-1 text-[12.5px] font-bold text-brand">
          {t('bulk.selected_bar', { count: selectedCount })}
        </span>

        {/*
         * The escape hatch out of a page-sized selection. Offered only when it
         * would actually widen the selection, so it never appears as a no-op.
         */}
        {!allFilteredSelected && filteredTotal > selectedCount ? (
          <button
            className="rounded-lg px-2.5 py-1 text-[12px] font-bold text-brand underline-offset-2 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={onSelectAllFiltered}
            type="button"
          >
            {t('bulk.select_all_filtered', { count: filteredTotal })}
          </button>
        ) : null}

        <span aria-hidden className="mx-1 h-5 w-px bg-border" />

        <ActionButton
          icon={LayoutGrid}
          label={t('bulk.action_enroll')}
          onClick={() => setPending({ kind: 'ENROLL', classId: '' })}
          tone="peer"
        />
        <ActionButton
          icon={UserCog}
          label={t('bulk.action_role')}
          onClick={() => setPending({ kind: 'ROLE_CHANGE', role: 'STUDENT' })}
          tone="brand"
        />
        <ActionButton
          icon={ShieldOff}
          label={t('bulk.action_suspend')}
          onClick={() => setPending({ kind: 'SUSPEND' })}
          tone="warning"
        />
        <ActionButton
          icon={UserCheck}
          label={t('bulk.action_restore')}
          onClick={() => setPending({ kind: 'RESTORE' })}
          tone="success"
        />

        <button
          aria-label={t('bulk.clear')}
          className="ml-1 grid size-7 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onClearSelection}
          type="button"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {pending ? (
        <BulkConfirmDialog
          academyId={academyId}
          classes={classes}
          initialOptions={pending}
          onApplied={() => {
            onApplied();
            onClearSelection();
          }}
          onClose={() => setPending(null)}
          peopleRevision={peopleRevision}
          selection={selection}
        />
      ) : null}
    </>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: typeof LayoutGrid;
  label: string;
  onClick: () => void;
  tone: 'brand' | 'peer' | 'warning' | 'success';
}) {
  const styles = {
    brand: 'hover:border-brand hover:text-brand',
    peer: 'hover:border-peer hover:text-peer',
    warning: 'hover:border-warning hover:text-warning',
    success: 'hover:border-success hover:text-success',
  }[tone];
  return (
    <button
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5',
        'text-[12.5px] font-bold text-sub transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        styles,
      )}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------- confirmation */

/**
 * What will happen, then the button that makes it happen.
 *
 * The preview is fetched when the dialog opens and again whenever the options
 * change, because "enrol these forty in Class A" and "enrol these forty in
 * Class B" have different consequences — one may already contain half of them.
 *
 * Confirm stays disabled until a preview has landed and reports somebody to
 * change. A manager cannot approve a number the server has not yet produced.
 */
function BulkConfirmDialog({
  academyId,
  classes,
  initialOptions,
  onApplied,
  onClose,
  peopleRevision,
  selection,
}: {
  academyId: string;
  classes: { id: string; name: string }[];
  initialOptions: BulkOptions;
  onApplied: () => void;
  onClose: () => void;
  peopleRevision: number;
  selection: PeopleSelection;
}) {
  const { t } = useTranslation('people-ops');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const headingId = React.useId();

  const [options, setOptions] = React.useState<BulkOptions>(initialOptions);
  const [result, setResult] = React.useState<BulkResult | null>(null);

  // Minted once, when the dialog opens. A double-click on Confirm sends the
  // same key twice and the server returns one operation — which is the whole
  // reason the key is not generated at submit time.
  // `useState` with an initializer rather than `useMemo`: a memo is a cache the
  // runtime may discard and recompute, which would mint a second key for the
  // same dialog — the exact thing the key exists to prevent. State is the
  // guarantee that it is generated once.
  const [idempotencyKey] = React.useState(() => crypto.randomUUID());

  const ready = options.kind !== 'ENROLL' || options.classId !== '';

  const preview = useQuery({
    queryKey: ['bulk-preview', academyId, JSON.stringify({ selection, options })],
    queryFn: () =>
      orpc.academyPeopleBulk.preview({ academyId, selection, options }),
    enabled: ready && result === null,
    retry: false,
  });

  const run = useMutation({
    mutationFn: () =>
      orpc.academyPeopleBulk.run({
        academyId,
        selection,
        options,
        idempotencyKey,
        peopleRevision,
      }),
    onSuccess: (next) => {
      setResult(next);
      void queryClient.invalidateQueries({ queryKey: ['academy-people', academyId] });
      void queryClient.invalidateQueries({
        queryKey: ['academy-operations-overview', academyId],
      });
      onApplied();
    },
  });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !run.isPending) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, run.isPending]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && !run.isPending) onClose();
      }}
    >
      <div
        aria-labelledby={headingId}
        aria-modal
        className="cove-pop w-full max-w-lg rounded-modal border border-border bg-card shadow-[var(--shadow-modal)]"
        data-state="open"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <h2 className="text-[16px] font-extrabold" id={headingId}>
            {result ? t('bulk.result_title') : t('bulk.confirm_title')}
          </h2>
          <button
            aria-label={t('bulk.cancel')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            disabled={run.isPending}
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        {result ? (
          <BulkResultBody onClose={onClose} result={result} />
        ) : (
          <div className="px-5 py-4">
            {options.kind === 'ENROLL' ? (
              <Picker
                label={t('bulk.choose_class')}
                onChange={(classId) => setOptions({ kind: 'ENROLL', classId })}
                options={classes.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                }))}
                placeholder={t('bulk.choose_class')}
                value={options.classId}
              />
            ) : null}

            {options.kind === 'ROLE_CHANGE' ? (
              <Picker
                label={t('bulk.choose_role')}
                onChange={(role) =>
                  setOptions({ kind: 'ROLE_CHANGE', role: role as AcademyRole })
                }
                options={academyRoles.map((role) => ({
                  value: role,
                  label: t(`role.${role}`),
                }))}
                value={options.role}
              />
            ) : null}

            {preview.data ? (
              <ConsequenceList preview={preview.data} />
            ) : preview.isError ? (
              <p
                className="rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
                role="alert"
              >
                {errorText(preview.error, t('bulk.failed'))}
              </p>
            ) : ready ? (
              <div className="h-24 animate-pulse rounded-lg bg-accent motion-reduce:animate-none" />
            ) : null}

            {run.isError ? (
              <p
                className="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
                role="alert"
              >
                {errorText(run.error, t('bulk.failed'))}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
              <button
                className="h-9 rounded-lg px-3.5 text-[13px] font-bold text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
                disabled={run.isPending}
                onClick={onClose}
                type="button"
              >
                {t('bulk.cancel')}
              </button>
              <button
                className="h-9 rounded-lg bg-primary px-4 text-[13px] font-bold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                // Never enabled on a number the server has not produced.
                disabled={
                  run.isPending ||
                  !preview.data ||
                  preview.data.affected === 0
                }
                onClick={() => run.mutate()}
                type="button"
              >
                {run.isPending ? t('bulk.confirming') : t('bulk.confirm')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The exact counts, then what they cost.
 *
 * The affected count is set at heading size because it is the number a manager
 * is being asked to approve. The consequences are a list rather than prose:
 * each is a separate fact with its own count, and a paragraph would let one of
 * them be skimmed past.
 */
function ConsequenceList({ preview }: { preview: BulkPreview }) {
  const { t } = useTranslation('people-ops');

  return (
    <div className="mt-1">
      {preview.affected === 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/8 px-3.5 py-2.5 text-[13px] font-bold text-warning">
          {t('bulk.confirm_none')}
        </p>
      ) : (
        <p className="text-[15px] font-extrabold">
          {t('bulk.confirm_affected', { count: preview.affected })}
        </p>
      )}

      {preview.blocked > 0 ? (
        <p className="mt-1 text-[12.5px] text-sub">
          {t('bulk.confirm_blocked', { count: preview.blocked })}
        </p>
      ) : null}

      {preview.consequences.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {preview.consequences.map((consequence) => (
            <li
              className="flex items-start gap-2.5 rounded-lg border border-border bg-muted px-3 py-2"
              key={consequence.kind}
            >
              <TriangleAlert
                aria-hidden
                className={cn(
                  'mt-0.5 size-3.5 shrink-0',
                  severity(consequence.kind) === 'high'
                    ? 'text-danger'
                    : 'text-warning',
                )}
                strokeWidth={2.5}
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold">
                  {t(`bulk.consequence.${consequence.kind}`, {
                    count: consequence.count,
                  })}
                </span>
                {consequence.sample.length > 0 ? (
                  <span className="mt-0.5 block truncate text-[11.5px] text-sub">
                    {t('bulk.sample', { names: consequence.sample.join(', ') })}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Which consequences are losses and which are merely facts.
 *
 * Only two are losses: work that will be undone. The rest describe people the
 * operation will leave alone, which is reassuring rather than alarming, and
 * painting all six red would make none of them mean anything.
 */
function severity(kind: BulkConsequenceKind): 'high' | 'normal' {
  return kind === 'teacher_assignments_stranded' || kind === 'enrollments_dropped'
    ? 'high'
    : 'normal';
}

function BulkResultBody({
  onClose,
  result,
}: {
  onClose: () => void;
  result: BulkResult;
}) {
  const { t } = useTranslation('people-ops');
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3 rounded-card border border-success/25 bg-success/8 px-4 py-3.5">
        <CircleCheck
          aria-hidden
          className="size-5 shrink-0 text-success"
          strokeWidth={2.25}
        />
        <p className="text-[13.5px] font-bold">
          {t('bulk.result_summary', {
            failed: result.failed,
            succeeded: result.succeeded,
          })}
        </p>
      </div>

      {/* §14 — a replayed retry says so. "Nothing happened, and that is
          correct" is otherwise indistinguishable from a bug. */}
      {result.replayed ? (
        <p className="mt-3 rounded-lg border border-brand/25 bg-brand/5 px-3.5 py-2.5 text-[12.5px] text-brand">
          {t('bulk.replayed')}
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() =>
            downloadCsv(
              `cove-bulk-${result.operationId.slice(0, 8)}.csv`,
              toCsv([
                ['membership_id', 'name', 'outcome', 'code'],
                ...result.rows.map((row) => [
                  row.membershipId,
                  row.displayName,
                  row.outcome,
                  row.code,
                ]),
              ]),
            )
          }
          type="button"
        >
          <Download aria-hidden className="size-3.5" strokeWidth={2.5} />
          {t('bulk.result_download')}
        </button>
        <button
          className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onClose}
          type="button"
        >
          {t('bulk.close')}
        </button>
      </div>
    </div>
  );
}

function Picker({
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  value: string;
}) {
  const id = React.useId();
  return (
    <div className="mb-4 flex flex-col gap-1">
      <label className="text-[12px] font-bold text-sub" htmlFor={id}>
        {label}
      </label>
      <select
        className="h-9 w-full rounded-lg border border-border bg-card px-2.5 text-[13.5px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {placeholder ? (
          <option disabled value="">
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
