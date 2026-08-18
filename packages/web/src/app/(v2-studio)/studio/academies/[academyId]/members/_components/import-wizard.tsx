'use client';

import type {
  ImportErrorCode,
  ImportPreview,
  ImportResult,
  ImportRow,
  ImportWarningCode,
} from '@cove/shared';
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  canCommitPreview,
  toCsv,
} from '@cove/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileSpreadsheet,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import {
  downloadCsv,
  fileIsTooLarge,
  templateCsv,
  uploadWorkbook,
} from '../_lib/upload-workbook';

/**
 * Member import, as three screens in one dialog.
 *
 * The shape mirrors what the server enforces, because an interface that lets a
 * manager reach a state the server will refuse is an interface that teaches
 * them not to trust it.
 *
 * *Choose* explains the file before asking for one. The template is offered
 * first: a manager who downloads it cannot produce a header the parser fails to
 * recognise, which removes the single most common import failure before it
 * happens.
 *
 * *Review* is the whole point of the feature. Every row shows what was in the
 * file beside what would be created, so a normalization a manager disagrees
 * with is visible *before* two hundred invitations go out rather than after.
 * Errors block; warnings need an explicit tick. Neither is a soft nudge — the
 * commit button is disabled by the same shared predicate the server checks
 * with, so the two cannot disagree.
 *
 * *Result* is a receipt. It is downloadable because a manager importing three
 * hundred people will be asked what happened to eleven of them, and a modal
 * they closed is not an answer.
 *
 * Nothing is created before Confirm. The upload produces a preview and a
 * session; the academy is untouched until the commit, which is what makes
 * uploading the wrong file a non-event.
 */
export function ImportWizard({
  academyId,
  onClose,
  onImported,
  open,
}: {
  academyId: string;
  onClose: () => void;
  onImported: () => void;
  open: boolean;
}) {
  const { t } = useTranslation('people-ops');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const headingId = React.useId();

  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);

  const reset = React.useCallback(() => {
    setPreview(null);
    setResult(null);
    setAcknowledged(false);
    setLocalError(null);
  }, []);

  const close = React.useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const upload = useMutation({
    mutationFn: (file: File) => uploadWorkbook({ academyId, file }),
    onSuccess: (next) => {
      setPreview(next);
      setAcknowledged(false);
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      orpc.academyPeopleImport.commit({
        academyId,
        sessionId: preview!.sessionId,
        acknowledgeWarnings: acknowledged,
        peopleRevision: preview!.peopleRevision,
      }),
    onSuccess: (next) => {
      setResult(next);
      // The directory, the invitations list, and the control tower's scale
      // ledger all just changed. Re-read rather than patched: an import can
      // create three hundred rows, and reconciling that in the cache is a
      // second implementation of what the server already knows.
      void queryClient.invalidateQueries({ queryKey: ['academy-people', academyId] });
      void queryClient.invalidateQueries({
        queryKey: ['academy-invitations', academyId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['academy-operations-overview', academyId],
      });
      onImported();
    },
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape closes while choosing or reviewing — nothing has been created —
      // but never while a commit is in flight, when it would look like a way to
      // cancel something that cannot be cancelled.
      if (event.key === 'Escape' && !commit.isPending) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, commit.isPending, open]);

  if (!open) return null;

  const chooseFile = (file: File | null | undefined) => {
    if (!file) return;
    setLocalError(null);
    if (fileIsTooLarge(file)) {
      // Named before the upload starts. Sending five megabytes to be told it is
      // too big is a slow way to learn something the browser already knew.
      setLocalError(
        t('import.reason.file_too_large', {
          size: Math.floor(IMPORT_MAX_FILE_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }
    upload.mutate(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && !commit.isPending) close();
      }}
    >
      <div
        aria-labelledby={headingId}
        aria-modal
        className="cove-pop w-full max-w-4xl rounded-modal border border-border bg-card shadow-[var(--shadow-modal)]"
        data-state="open"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"
            >
              <FileSpreadsheet className="size-4.5" strokeWidth={2.25} />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold" id={headingId}>
                {result ? t('import.result_title') : t('import.title')}
              </h2>
              <p className="mt-1 max-w-xl text-[12.5px] leading-[1.55] text-sub">
                {t('import.description')}
              </p>
            </div>
          </div>
          <button
            aria-label={t('import.cancel')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            disabled={commit.isPending}
            onClick={close}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        {result ? (
          <ResultStep onDone={close} result={result} />
        ) : preview ? (
          <ReviewStep
            acknowledged={acknowledged}
            error={
              commit.isError ? errorText(commit.error, t('import.upload_failed')) : null
            }
            onAcknowledge={setAcknowledged}
            onBack={reset}
            onCommit={() => commit.mutate()}
            pending={commit.isPending}
            preview={preview}
          />
        ) : (
          <ChooseStep
            error={
              localError ??
              (upload.isError
                ? uploadReason(upload.error, t, errorText)
                : null)
            }
            onChoose={chooseFile}
            pending={upload.isPending}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ choose */

/**
 * The template first, the file picker second.
 *
 * Deliberately that order. The single most common import failure is a header
 * the parser does not recognise, and a manager who starts from the template
 * cannot produce one — so the fix is offered before the problem.
 */
function ChooseStep({
  error,
  onChoose,
  pending,
}: {
  error: string | null;
  onChoose: (file: File | null | undefined) => void;
  pending: boolean;
}) {
  const { t } = useTranslation('people-ops');
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);

  return (
    <div className="px-5 py-4">
      <section className="rounded-card border border-border bg-muted p-4">
        <h3 className="text-[13.5px] font-bold">{t('import.template_title')}</h3>
        <p className="mt-1 text-[12.5px] leading-[1.6] text-sub">
          {t('import.template_body')}
        </p>
        <button
          className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand/30 px-3 text-[12.5px] font-bold text-brand transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => downloadCsv('cove-members-template.csv', templateCsv())}
          type="button"
        >
          <Download aria-hidden className="size-3.5" strokeWidth={2.5} />
          {t('import.template_download')}
        </button>
      </section>

      {/*
       * A label wrapping a hidden input rather than a div with a click handler:
       * it is reachable by keyboard, announced as a file input, and opens the
       * picker on Enter, none of which a styled div does for free.
       */}
      <label
        className={cn(
          'mt-4 flex cursor-pointer flex-col items-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors',
          'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
          dragging ? 'border-brand bg-brand/5' : 'border-border hover:border-brand/50',
          pending && 'pointer-events-none opacity-60',
        )}
        onDragLeave={() => setDragging(false)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onChoose(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            onChoose(event.target.files?.[0]);
            // Cleared so choosing the same file twice — after fixing it — fires
            // a change event the second time.
            event.target.value = '';
          }}
          ref={inputRef}
          type="file"
        />
        <span
          aria-hidden
          className="mb-3 grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand"
        >
          <Upload className="size-5" strokeWidth={2} />
        </span>
        <span className="text-[14px] font-bold">
          {pending ? t('import.uploading') : t('import.choose_file')}
        </span>
        <span className="mt-1 text-[12.5px] text-sub">
          {pending ? '' : t('import.drop_hint')}
        </span>
        <span className="mt-3 text-[11.5px] text-sub">
          {t('import.limits', {
            rows: IMPORT_MAX_ROWS,
            size: Math.floor(IMPORT_MAX_FILE_BYTES / (1024 * 1024)),
          })}
        </span>
      </label>

      {error ? (
        <p
          className="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ review */

/**
 * Every row, with what was typed beside what would be created.
 *
 * The two-column comparison is the feature. A manager can see that
 * `  ALICE@X.COM ` becomes `alice@x.com` and agree, or see that a merged column
 * turned a phone number into a name and stop — and stopping here costs nothing,
 * because nothing has been created.
 *
 * Error rows are listed first. A file with four hundred good rows and three bad
 * ones is a file where the three are what the manager needs, and making them
 * scroll for them is how a preview becomes a formality.
 */
function ReviewStep({
  acknowledged,
  error,
  onAcknowledge,
  onBack,
  onCommit,
  pending,
  preview,
}: {
  acknowledged: boolean;
  error: string | null;
  onAcknowledge: (value: boolean) => void;
  onBack: () => void;
  onCommit: () => void;
  pending: boolean;
  preview: ImportPreview;
}) {
  const { t, i18n } = useTranslation('people-ops');
  const acknowledgeId = React.useId();

  const ordered = React.useMemo(() => {
    const rank = { ERROR: 0, WARNING: 1, READY: 2 } as const;
    return [...preview.rows].sort(
      (left, right) =>
        rank[left.status] - rank[right.status] || left.rowNumber - right.rowNumber,
    );
  }, [preview.rows]);

  const committable = canCommitPreview({
    rows: preview.rows,
    warningsAcknowledged: acknowledged,
  });

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-5 py-3">
        <p className="text-[13px] font-bold">
          {t('import.preview_of', {
            count: preview.total,
            filename: preview.originalFilename,
          })}
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Tally tone="success" value={preview.ready} label={t('import.count_ready')} />
          <Tally tone="warning" value={preview.warning} label={t('import.count_warning')} />
          <Tally tone="danger" value={preview.error} label={t('import.count_error')} />
          <span className="ml-auto text-[11.5px] text-sub">
            {t('import.expires', {
              time: new Intl.DateTimeFormat(i18n.language, {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(preview.expiresAt)),
            })}
          </span>
        </div>
      </div>

      <div
        aria-label={t('import.preview_title')}
        className="max-h-[22rem] overflow-auto"
        role="region"
        tabIndex={0}
      >
        <table className="w-full min-w-[46rem] border-collapse text-[12.5px]">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left font-bold text-sub" scope="col">
                {t('import.column_row')}
              </th>
              <th className="px-3 py-2 text-left font-bold text-sub" scope="col">
                {t('import.column_status')}
              </th>
              <th className="px-3 py-2 text-left font-bold text-sub" scope="col">
                {t('import.column_original')}
              </th>
              <th className="px-3 py-2 text-left font-bold text-sub" scope="col">
                {t('import.column_normalized')}
              </th>
              <th className="px-3 py-2 text-left font-bold text-sub" scope="col">
                {t('import.column_notes')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ordered.map((row) => (
              <PreviewRow key={row.rowNumber} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-5 py-4">
        {preview.error > 0 ? (
          <p
            className="rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
            role="alert"
          >
            {t('import.blocked')}
          </p>
        ) : preview.warning > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/8 px-3.5 py-2.5">
            <input
              checked={acknowledged}
              className="mt-0.5 size-4 shrink-0 accent-[var(--warning)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              id={acknowledgeId}
              onChange={(event) => onAcknowledge(event.target.checked)}
              type="checkbox"
            />
            <label className="text-[13px]" htmlFor={acknowledgeId}>
              <span className="font-bold">{t('import.acknowledge')}</span>
              <span className="mt-0.5 block text-[12px] text-sub">
                {t('import.acknowledge_hint')}
              </span>
            </label>
          </div>
        ) : null}

        {error ? (
          <p
            className="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="h-9 rounded-lg px-3.5 text-[13px] font-bold text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-40"
            disabled={pending}
            onClick={onBack}
            type="button"
          >
            {t('import.cancel')}
          </button>
          <button
            className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            disabled={!committable || pending}
            onClick={onCommit}
            type="button"
          >
            {pending
              ? t('import.committing')
              : t('import.commit', { count: preview.ready + preview.warning })}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ row }: { row: ImportRow }) {
  const { t } = useTranslation('people-ops');
  const tone =
    row.status === 'ERROR'
      ? 'bg-danger/10 text-danger'
      : row.status === 'WARNING'
        ? 'bg-warning/10 text-warning'
        : 'bg-success/10 text-success';
  const Icon =
    row.status === 'ERROR'
      ? CircleAlert
      : row.status === 'WARNING'
        ? TriangleAlert
        : CircleCheck;

  return (
    <tr className={row.status === 'ERROR' ? 'bg-danger/4' : undefined}>
      <td className="px-3 py-2 font-mono tabular-nums text-sub">{row.rowNumber}</td>
      <td className="px-3 py-2">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold',
            tone,
          )}
        >
          <Icon aria-hidden className="size-3" strokeWidth={2.5} />
          {t(`import.status_${row.status}`)}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="block truncate font-mono text-[11.5px] text-sub">
          {row.original.email || '—'}
        </span>
        <span className="block truncate text-[11.5px] text-sub">
          {[row.original.role, row.original.displayName]
            .filter(Boolean)
            .join(' · ') || '—'}
        </span>
      </td>
      <td className="px-3 py-2">
        {row.normalized.email ? (
          <>
            <span className="block truncate font-mono text-[11.5px] font-bold">
              {row.normalized.email}
            </span>
            <span className="block truncate text-[11.5px] text-sub">
              {[
                row.normalized.role,
                row.normalized.displayName,
                row.normalized.sendInvitation ? null : t('import.no_email'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <span className="text-sub">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {row.errors.map((code) => (
            <li className="text-[11.5px] font-semibold text-danger" key={code}>
              {t(`import.error.${code satisfies ImportErrorCode}`)}
            </li>
          ))}
          {row.warnings.map((code) => (
            <li className="text-[11.5px] text-warning" key={code}>
              {t(`import.warning.${code satisfies ImportWarningCode}`)}
            </li>
          ))}
        </ul>
      </td>
    </tr>
  );
}

function Tally({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger';
  value: number;
}) {
  const styles = {
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  }[tone];
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-1.5 rounded-full px-2.5 py-1',
        // A zero count stays visible but recedes: "0 errors" is an answer, and
        // hiding it would leave a manager wondering whether it was checked.
        value === 0 ? 'bg-accent text-sub' : styles,
      )}
    >
      <span className="font-mono text-[13px] font-extrabold tabular-nums">
        {value}
      </span>
      <span className="text-[11.5px] font-bold">{label}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ result */

/** The receipt, and a way to keep it. */
function ResultStep({
  onDone,
  result,
}: {
  onDone: () => void;
  result: ImportResult;
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
          {t('import.result_summary', {
            failed: result.failed,
            invited: result.invited,
            skipped: result.skipped,
          })}
        </p>
      </div>

      <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-[12.5px]">
          <thead className="sticky top-0 bg-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-1.5 text-left font-bold text-sub" scope="col">
                {t('import.column_row')}
              </th>
              <th className="px-3 py-1.5 text-left font-bold text-sub" scope="col">
                {t('import.result_column_email')}
              </th>
              <th className="px-3 py-1.5 text-left font-bold text-sub" scope="col">
                {t('import.result_column_outcome')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {result.rows.map((row) => (
              <tr key={`${row.rowNumber}-${row.email}`}>
                <td className="px-3 py-1.5 font-mono tabular-nums text-sub">
                  {row.rowNumber}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11.5px]">{row.email}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={cn(
                      'text-[11.5px] font-bold',
                      row.outcome === 'invited'
                        ? 'text-success'
                        : row.outcome === 'skipped'
                          ? 'text-sub'
                          : 'text-danger',
                    )}
                  >
                    {t(`import.outcome.${row.outcome}`)}
                  </span>
                  <span className="ml-1.5 text-[11px] text-sub">
                    {translateOutcomeCode(row.code, t)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-bold text-sub transition-colors hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() =>
            downloadCsv(
              `cove-import-${result.sessionId.slice(0, 8)}.csv`,
              // Built with the shared writer, which escapes every cell — §17.
              // A results file is one a manager is explicitly invited to open
              // in Excel, so a name beginning with `=` must not become a
              // formula on the way there.
              toCsv([
                [
                  t('import.result_column_row'),
                  t('import.result_column_email'),
                  t('import.result_column_outcome'),
                  t('import.result_column_code'),
                ],
                ...result.rows.map((row) => [
                  row.rowNumber,
                  row.email,
                  row.outcome,
                  row.code,
                ]),
              ]),
            )
          }
          type="button"
        >
          <Download aria-hidden className="size-3.5" strokeWidth={2.5} />
          {t('import.result_download')}
        </button>
        <button
          className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={onDone}
          type="button"
        >
          {t('import.done')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ codes */

/**
 * The workbook reasons the wizard can name, as a closed set.
 *
 * The upload's error body carries the specific reason as its message. Matching
 * it against a list rather than interpolating it into a key means a reason the
 * server adds later renders the general message instead of a raw dotted string.
 */
const fileReasons = [
  'file_too_large',
  'file_empty',
  'unsupported_format',
  'too_many_sheets',
  'too_many_rows',
  'missing_header',
  'missing_required_column',
  'unreadable',
] as const;

function uploadReason(
  error: unknown,
  t: ReturnType<typeof useTranslation<'people-ops'>>['t'],
  errorText: (error: unknown, fallback?: string) => string,
): string {
  const message =
    error instanceof Error ? error.message : String(error ?? '');
  const reason = fileReasons.find((candidate) => candidate === message);
  if (!reason) return errorText(error, t('import.upload_failed'));
  return t(`import.reason.${reason}`, {
    rows: IMPORT_MAX_ROWS,
    size: Math.floor(IMPORT_MAX_FILE_BYTES / (1024 * 1024)),
  });
}

const outcomeCodes = [
  'invited',
  'invited_no_email',
  'membership_exists',
  'invitation_pending',
  'row_invalid',
] as const;

function translateOutcomeCode(
  code: string,
  t: ReturnType<typeof useTranslation<'people-ops'>>['t'],
): string {
  const known = outcomeCodes.find((candidate) => candidate === code);
  return known ? t(`import.outcome_code.${known}`) : code;
}
