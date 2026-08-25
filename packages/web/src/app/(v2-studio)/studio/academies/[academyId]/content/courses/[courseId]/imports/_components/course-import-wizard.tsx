'use client';

import type {
  ContentImportPreview,
  ContentImportResult,
} from '@cove/shared';
import {
  CONTENT_IMPORT_MAX_PROBLEMS,
  CONTENT_IMPORT_MAX_UPLOAD_BYTES,
  canCommitPlan,
  collectPlanIssues,
  issueReportFilename,
  issuesToCsv,
} from '@cove/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CircleAlert,
  Download,
  FileSpreadsheet,
  Loader2,
  PartyPopper,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { toneStyles } from '../_lib/action-tokens';
import { refreshCourseTreeAfterImport } from '../_lib/refresh-course-tree';
import {
  downloadCourseWorkbook,
  looksLikeXlsx,
  saveCsv,
  uploadCourseWorkbook,
  workbookIsTooLarge,
} from '../_lib/upload-course-workbook';
import { PlanSummary, type PlanFilter } from './plan-summary';
import { PlanTree } from './plan-tree';
import { StageRail, type ImportStage } from './stage-rail';

/**
 * Import from Excel, as four screens on one page.
 *
 * A full page rather than the modal the member importer uses, for the reason
 * §4.1 gives: a grouped hierarchy preview, row-level issues, a warning
 * acknowledgement, and a result report need room to stay readable, and a
 * two-hundred-problem plan inside a dialog is a scroll container inside a
 * scroll container.
 *
 * The shape mirrors what the server enforces exactly, because an interface that
 * lets a team lead reach a state the server will refuse is an interface that
 * teaches them not to trust it. The Confirm button is disabled by
 * `canCommitPlan` — the same shared predicate the commit endpoint checks — so
 * the two cannot disagree about what "ready" means.
 *
 * Nothing exists before Confirm. The upload produces a preview and a session;
 * the course is untouched until the commit, which is what makes uploading the
 * wrong workbook a non-event rather than an incident.
 */
export function CourseImportWizard({
  academyId,
  courseId,
  courseTitle,
  problemCount,
}: {
  academyId: string;
  courseId: string;
  courseTitle: string;
  problemCount: number;
}) {
  const { i18n, t } = useTranslation('content-import');
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const [preview, setPreview] = React.useState<ContentImportPreview | null>(null);
  const [result, setResult] = React.useState<ContentImportResult | null>(null);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [filter, setFilter] = React.useState<PlanFilter>('all');
  const [search, setSearch] = React.useState('');
  const [localError, setLocalError] = React.useState<string | null>(null);

  const stage: ImportStage = result
    ? 'result'
    : preview
      ? 'review'
      : 'prepare';

  const download = useMutation({
    mutationFn: (kind: 'current' | 'blank') =>
      downloadCourseWorkbook({
        academyId,
        courseId,
        kind,
        locale: i18n.language,
      }),
  });

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadCourseWorkbook({ academyId, courseId, file }),
    onSuccess: (next) => {
      setPreview(next);
      setAcknowledged(false);
      setFilter(next.counts.conflicts + next.counts.errors > 0 ? 'conflict' : 'all');
      setSearch('');
    },
  });

  const commit = useMutation({
    mutationFn: () =>
      orpc.academyContentImports.commit({
        academyId,
        courseId,
        sessionId: preview!.sessionId,
        contentRevision: preview!.contentRevision,
        acknowledgeWarnings: acknowledged,
      }),
    onSuccess: async (next) => {
      // The course tree just gained modules, lectures, and problems. Re-read
      // rather than patched: an import can create two hundred of them, and
      // reconciling that in the cache is a second implementation of what the
      // server already knows.
      await refreshCourseTreeAfterImport(queryClient, academyId, courseId);
      void queryClient.invalidateQueries({
        queryKey: ['academy-courses', academyId],
      });
      setResult(next);
    },
  });

  const chooseFile = (file: File | null | undefined) => {
    if (!file) return;
    setLocalError(null);
    if (!looksLikeXlsx(file)) {
      setLocalError(t('upload.reason.not_xlsx'));
      return;
    }
    if (workbookIsTooLarge(file)) {
      setLocalError(
        t('upload.reason.file_too_large', {
          size: Math.floor(CONTENT_IMPORT_MAX_UPLOAD_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }
    upload.mutate(file);
  };

  const restart = () => {
    setPreview(null);
    setResult(null);
    setAcknowledged(false);
    setFilter('all');
    setSearch('');
    setLocalError(null);
    upload.reset();
    commit.reset();
  };

  const courseHref = `/studio/academies/${academyId}/content/courses/${courseId}`;

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <Link
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-sub transition-colors hover:text-ink"
          href={courseHref}
        >
          <ArrowLeft className="size-3.5" />
          {t('back_to_course', { course: courseTitle })}
        </Link>
        <StageRail stage={stage} />
      </header>

      {stage === 'prepare' ? (
        <PrepareStage
          busy={download.isPending}
          downloadError={
            download.error ? errorText(download.error) : null
          }
          fileError={
            localError ?? (upload.error ? errorText(upload.error) : null)
          }
          onChooseFile={chooseFile}
          onDownload={(kind) => download.mutate(kind)}
          problemCount={problemCount}
          uploading={upload.isPending}
        />
      ) : null}

      {stage === 'review' && preview ? (
        <ReviewStage
          acknowledged={acknowledged}
          committing={commit.isPending}
          commitError={commit.error ? errorText(commit.error) : null}
          filter={filter}
          onAcknowledge={setAcknowledged}
          onCommit={() => commit.mutate()}
          onFilterChange={setFilter}
          onRestart={restart}
          onSearch={setSearch}
          preview={preview}
          search={search}
        />
      ) : null}

      {stage === 'result' && result ? (
        <ResultStage
          courseHref={courseHref}
          onRestart={restart}
          result={result}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- prepare */

/**
 * The workbook, before anything is uploaded.
 *
 * The current-course download comes first and is the recommended one, because
 * §4.3 makes it the safe path: a team lead who starts from their own content
 * never invents a key for something that already exists, and never clears a
 * problem's tests by omitting rows they did not know they had to include.
 * Leading with the blank template would be leading with the way to get it
 * wrong.
 */
function PrepareStage({
  busy,
  downloadError,
  fileError,
  onChooseFile,
  onDownload,
  problemCount,
  uploading,
}: {
  busy: boolean;
  downloadError: string | null;
  fileError: string | null;
  onChooseFile: (file: File | null | undefined) => void;
  onDownload: (kind: 'current' | 'blank') => void;
  problemCount: number;
  uploading: boolean;
}) {
  const { t } = useTranslation('content-import');
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const oversized = problemCount > CONTENT_IMPORT_MAX_PROBLEMS;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-card border border-border bg-card p-6">
        <h2 className="text-[17px] font-extrabold text-ink">
          {t('prepare.title')}
        </h2>
        <p className="mt-1.5 text-[14px] leading-[1.6] text-sub">
          {t('prepare.description')}
        </p>

        <div className="mt-5 space-y-3">
          <WorkbookOption
            busy={busy}
            description={t('prepare.current_description')}
            disabled={oversized}
            label={t('prepare.current_label')}
            onSelect={() => onDownload('current')}
            recommended
          />
          <WorkbookOption
            busy={busy}
            description={t('prepare.blank_description')}
            label={t('prepare.blank_label')}
            onSelect={() => onDownload('blank')}
          />
        </div>

        {oversized ? (
          <p className="mt-4 rounded-lg bg-warning/8 px-3 py-2.5 text-[13px] leading-[1.55] text-warning">
            {t('prepare.too_large', {
              limit: CONTENT_IMPORT_MAX_PROBLEMS,
              total: problemCount,
            })}
          </p>
        ) : null}

        {downloadError ? <ErrorNote text={downloadError} /> : null}

        <ul className="mt-5 space-y-1.5 border-t border-border pt-4 text-[13px] leading-[1.6] text-sub">
          <li>{t('prepare.rule_keys')}</li>
          <li>{t('prepare.rule_no_delete')}</li>
          <li>{t('prepare.rule_hidden')}</li>
          <li>{t('prepare.rule_collections')}</li>
        </ul>
      </section>

      {/*
        The drop zone is a label wrapping a real file input, so the keyboard and
        the pointer reach the same control and the browser's own focus ring
        applies. A div with a click handler would look identical and be
        unreachable by tab.
      */}
      <section>
        <label
          className={cn(
            'flex h-full min-h-[19rem] cursor-pointer flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors',
            'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring',
            dragging
              ? 'border-brand bg-brand-soft'
              : 'border-border bg-card hover:border-brand/50',
          )}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            onChooseFile(event.dataTransfer.files?.[0]);
          }}
        >
          <input
            accept=".xlsx"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              onChooseFile(event.target.files?.[0]);
              // Cleared so choosing the same corrected file twice in a row
              // still fires a change event.
              event.target.value = '';
            }}
            ref={inputRef}
            type="file"
          />
          <span
            aria-hidden
            className={cn(
              'grid size-12 place-items-center rounded-2xl',
              uploading ? 'bg-brand/10 text-brand' : 'bg-muted text-sub',
            )}
          >
            {uploading ? (
              <Loader2 className="size-5 animate-spin motion-reduce:animate-none" />
            ) : (
              <Upload className="size-5" strokeWidth={2.25} />
            )}
          </span>
          <span className="text-[15px] font-extrabold text-ink">
            {uploading ? t('upload.working') : t('upload.title')}
          </span>
          <span className="max-w-xs text-[13.5px] leading-[1.6] text-sub">
            {t('upload.description', {
              size: Math.floor(CONTENT_IMPORT_MAX_UPLOAD_BYTES / (1024 * 1024)),
            })}
          </span>
          <span className="mt-1 text-[12.5px] font-semibold text-brand">
            {t('upload.safe_note')}
          </span>
        </label>
        {fileError ? <ErrorNote text={fileError} /> : null}
      </section>
    </div>
  );
}

function WorkbookOption({
  busy,
  description,
  disabled,
  label,
  onSelect,
  recommended,
}: {
  busy: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onSelect: () => void;
  recommended?: boolean;
}) {
  const { t } = useTranslation('content-import');

  return (
    <button
      className={cn(
        'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        disabled
          ? 'cursor-not-allowed border-border bg-muted/50 opacity-60'
          : 'border-border bg-card hover:border-brand hover:bg-brand-soft/40',
      )}
      disabled={disabled || busy}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden
        className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Download className="size-4" strokeWidth={2.25} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-extrabold text-ink">{label}</span>
          {recommended ? (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-extrabold tracking-wide text-success uppercase">
              {t('prepare.recommended')}
            </span>
          ) : null}
        </span>
        <span className="mt-1 block text-[13px] leading-[1.55] text-sub">
          {description}
        </span>
      </span>
    </button>
  );
}

/* --------------------------------------------------------------- review */

function ReviewStage({
  acknowledged,
  commitError,
  committing,
  filter,
  onAcknowledge,
  onCommit,
  onFilterChange,
  onRestart,
  onSearch,
  preview,
  search,
}: {
  acknowledged: boolean;
  commitError: string | null;
  committing: boolean;
  filter: PlanFilter;
  onAcknowledge: (next: boolean) => void;
  onCommit: () => void;
  onFilterChange: (next: PlanFilter) => void;
  onRestart: () => void;
  onSearch: (next: string) => void;
  preview: ContentImportPreview;
  search: string;
}) {
  const { t } = useTranslation('content-import');
  const counts = preview.counts;
  const blocked = counts.conflicts + counts.errors > 0;
  const ready = canCommitPlan({ counts, acknowledgeWarnings: acknowledged });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-sub">
          <FileSpreadsheet className="size-4 text-brand" strokeWidth={2.25} />
          {preview.originalFilename}
        </p>
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13.5px] font-bold text-sub transition-colors hover:border-ink/25 hover:text-ink"
          onClick={onRestart}
          type="button"
        >
          <RotateCcw className="size-3.5" />
          {t('review.upload_again')}
        </button>
      </div>

      <PlanSummary
        counts={counts}
        filter={filter}
        onFilterChange={onFilterChange}
      />

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-sub"
        />
        <input
          className="h-10 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[14px] text-ink placeholder:text-sub/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('review.search_placeholder')}
          type="search"
          value={search}
        />
      </div>

      <PlanTree filter={filter} plan={preview.plan} search={search} />

      <ConfirmPanel
        acknowledged={acknowledged}
        blocked={blocked}
        commitError={commitError}
        committing={committing}
        counts={counts}
        onAcknowledge={onAcknowledge}
        onCommit={onCommit}
        preview={preview}
        ready={ready}
      />
    </div>
  );
}

/**
 * The confirmation, stating exactly what will and will not happen.
 *
 * §4.6 lists the four promises this panel has to repeat, and repeating them
 * here rather than in a dialog is deliberate: they are the reason a team lead
 * can confirm a two-hundred-problem import without reading every row, and they
 * are most useful beside the button rather than one click after it.
 */
function ConfirmPanel({
  acknowledged,
  blocked,
  commitError,
  committing,
  counts,
  onAcknowledge,
  onCommit,
  preview,
  ready,
}: {
  acknowledged: boolean;
  blocked: boolean;
  commitError: string | null;
  committing: boolean;
  counts: ContentImportPreview['counts'];
  onAcknowledge: (next: boolean) => void;
  onCommit: () => void;
  preview: ContentImportPreview;
  ready: boolean;
}) {
  const { t } = useTranslation('content-import');
  const issues = React.useMemo(
    () => collectPlanIssues(preview.plan),
    [preview.plan],
  );

  return (
    <section
      className={cn(
        'rounded-card border p-5',
        blocked ? 'border-danger/30 bg-danger/5' : 'border-border bg-card',
      )}
    >
      {blocked ? (
        <div className="flex items-start gap-3">
          <CircleAlert
            aria-hidden
            className="mt-0.5 size-5 shrink-0 text-danger"
            strokeWidth={2.25}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-extrabold text-danger">
              {t('review.blocked_title', {
                count: counts.conflicts + counts.errors,
              })}
            </h2>
            <p className="mt-1 text-[13.5px] leading-[1.6] text-sub">
              {t('review.blocked_body')}
            </p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-[15px] font-extrabold text-ink">
            {t('review.confirm_title')}
          </h2>
          <ul className="mt-3 grid gap-1.5 text-[13.5px] leading-[1.6] text-sub sm:grid-cols-2">
            <li>{t('review.promise_no_delete')}</li>
            <li>{t('review.promise_hidden')}</li>
            <li>{t('review.promise_visibility')}</li>
            <li>{t('review.promise_atomic')}</li>
          </ul>
        </>
      )}

      {counts.warnings > 0 ? (
        <label
          className={cn(
            'mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
            acknowledged
              ? 'border-warning/40 bg-warning/8'
              : 'border-border bg-muted/40 hover:border-warning/40',
          )}
        >
          <input
            checked={acknowledged}
            className="mt-0.5 size-4 shrink-0 accent-[var(--warning)]"
            onChange={(event) => onAcknowledge(event.target.checked)}
            type="checkbox"
          />
          <span className="text-[13.5px] leading-[1.6] text-ink">
            <span className="font-extrabold">
              {t('review.acknowledge_title', { count: counts.warnings })}
            </span>
            <span className="mt-0.5 block text-sub">
              {t('review.acknowledge_body')}
            </span>
          </span>
        </label>
      ) : null}

      {commitError ? <ErrorNote text={commitError} /> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[14.5px] font-extrabold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            ready && !committing
              ? 'bg-ink text-card hover:bg-ink/90'
              : 'cursor-not-allowed bg-muted text-sub',
          )}
          disabled={!ready || committing}
          onClick={onCommit}
          type="button"
        >
          {committing ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : null}
          {t('review.confirm_action', {
            count: counts.create + counts.update,
          })}
          {!committing ? <ArrowRight className="size-4" /> : null}
        </button>

        {issues.length > 0 ? (
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-bold text-sub transition-colors hover:border-ink/25 hover:text-ink"
            onClick={() =>
              saveCsv(
                issueReportFilename(preview.originalFilename),
                issuesToCsv(issues),
              )
            }
            type="button"
          >
            <Download className="size-4" />
            {t('review.download_issues', { count: issues.length })}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- result */

/**
 * The receipt.
 *
 * Counts first, then links into the affected problems, because the next thing a
 * team lead does after importing forty problems is open one — and §12 leaves
 * every one of them hidden, so "review it in the builder" is not advice, it is
 * the remaining step.
 */
function ResultStage({
  courseHref,
  onRestart,
  result,
}: {
  courseHref: string;
  onRestart: () => void;
  result: ContentImportResult;
}) {
  const { t } = useTranslation('content-import');
  const problems = result.entities.filter(
    (entity) => entity.kind === 'PROBLEM' && entity.action !== 'UNCHANGED',
  );

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-success/25 bg-success/5 p-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success"
          >
            <PartyPopper className="size-5" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-extrabold text-ink">
              {t('result.title')}
            </h2>
            <p className="mt-1 text-[14px] leading-[1.6] text-sub">
              {t('result.description')}
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ResultTile
            label={t('result.created')}
            tone="create"
            value={result.created}
          />
          <ResultTile
            label={t('result.updated')}
            tone="update"
            value={result.updated}
          />
          <ResultTile
            label={t('result.unchanged')}
            tone="unchanged"
            value={result.unchanged}
          />
          <ResultTile
            label={t('result.failed')}
            tone="conflict"
            value={result.failed}
          />
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-5 text-[14.5px] font-extrabold text-card transition-colors hover:bg-ink/90"
            href={courseHref}
          >
            {t('result.return_to_course')}
            <ArrowRight className="size-4" />
          </Link>
          <button
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[14px] font-bold text-sub transition-colors hover:border-ink/25 hover:text-ink"
            onClick={onRestart}
            type="button"
          >
            <Upload className="size-4" />
            {t('result.import_another')}
          </button>
        </div>
      </section>

      {problems.length > 0 ? (
        <section className="rounded-card border border-border bg-card p-5">
          <h3 className="text-[14.5px] font-extrabold text-ink">
            {t('result.problems_title', { count: problems.length })}
          </h3>
          <ul className="mt-3 divide-y divide-border">
            {problems.map((problem) => (
              <li
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
                key={problem.key}
              >
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-extrabold tracking-wide uppercase',
                    toneStyles[problem.action === 'CREATE' ? 'create' : 'update']
                      .chip,
                  )}
                >
                  {t(`result.action.${problem.action}` as const)}
                </span>
                <span className="font-mono text-[12px] font-bold text-sub">
                  {problem.key}
                </span>
                {problem.lectureId ? (
                  <Link
                    className="truncate text-[14px] font-bold text-brand underline-offset-4 hover:underline"
                    href={`${courseHref}/lectures/${problem.lectureId}/exercises/${problem.id}`}
                  >
                    {problem.title}
                  </Link>
                ) : (
                  <span className="truncate text-[14px] font-bold text-ink">
                    {problem.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ResultTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: keyof typeof toneStyles;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <dt className="text-[12.5px] font-bold text-sub">{label}</dt>
      <dd
        className={cn(
          'mt-0.5 text-[24px] leading-none font-extrabold tabular',
          value === 0 ? 'text-sub/50' : toneStyles[tone].text,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p
      className="mt-3 flex items-start gap-2 rounded-lg bg-danger/8 px-3 py-2.5 text-[13px] leading-[1.55] text-danger"
      role="alert"
    >
      <CircleAlert aria-hidden className="mt-px size-4 shrink-0" />
      {text}
    </p>
  );
}
