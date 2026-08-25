'use client';

import type {
  ContentImportAction,
  ContentImportIssue,
  ContentImportPlan,
  PlannedLecture,
  PlannedModule,
  PlannedProblem,
} from '@cove/shared';
import { ChevronRight, Eye, FileText, FolderTree, Layers } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { rowTone, toneStyles, type PlanTone } from '../_lib/action-tokens';
import type { PlanFilter } from './plan-summary';

/**
 * The plan, in the shape of the course it would produce.
 *
 * §4.4 asks for the preview to be grouped by the real hierarchy rather than
 * listed by spreadsheet row, and the reason is that a workbook's rows are not
 * how anybody thinks about a curriculum. "Two problems added to Loops" is the
 * sentence a team lead wants; four rows on the Problems sheet with a
 * `lecture_key` column is the same fact, spelled in the file's terms instead of
 * theirs.
 *
 * The colour is the feature. Every branch carries a rail down its left edge in
 * its own outcome's hue, and the rails nest — so the left gutter alone is a map
 * of the import. A solid green column is a whole new module; a mostly-grey one
 * with two blue rows is a small edit; a red rail anywhere means the import will
 * not run until somebody looks at it. That reading is available before a single
 * word on the page has been read, which is the only way a two-hundred-problem
 * preview is reviewable at all.
 *
 * Nothing here decides anything. §7.3 is explicit that the browser never works
 * out whether a row creates or updates something — it renders the plan the
 * server stored, and every badge below is a field, not a conclusion.
 */
export function PlanTree({
  filter,
  plan,
  search,
}: {
  filter: PlanFilter;
  plan: ContentImportPlan;
  search: string;
}) {
  const { t } = useTranslation('content-import');
  const modules = React.useMemo(
    () => filterPlan(plan.modules, filter, search),
    [filter, plan.modules, search],
  );

  if (modules.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border bg-card px-5 py-10 text-center">
        <p className="text-[14px] font-bold text-ink">{t('review.empty_title')}</p>
        <p className="mt-1 text-[13.5px] text-sub">{t('review.empty_body')}</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {modules.map((courseModule) => (
        <ModuleBranch key={courseModule.key} courseModule={courseModule} />
      ))}
    </ol>
  );
}

function ModuleBranch({ courseModule }: { courseModule: PlannedModule }) {
  const tone = rowTone({
    action: courseModule.action,
    severities: courseModule.issues.map((issue) => issue.severity),
  });

  return (
    <li className="overflow-hidden rounded-card border border-border bg-card">
      <NodeRow
        action={courseModule.action}
        changedFields={courseModule.changedFields}
        icon={<FolderTree className="size-4" strokeWidth={2.25} />}
        isVisible={courseModule.isVisible}
        issues={courseModule.issues}
        kind="module"
        nodeKey={courseModule.key}
        title={courseModule.title}
        tone={tone}
      />
      {courseModule.lectures.length > 0 ? (
        <ol className="space-y-px border-t border-border bg-muted/40 px-3 py-3">
          {courseModule.lectures.map((lecture) => (
            <LectureBranch key={lecture.key} lecture={lecture} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function LectureBranch({ lecture }: { lecture: PlannedLecture }) {
  const tone = rowTone({
    action: lecture.action,
    severities: lecture.issues.map((issue) => issue.severity),
  });

  return (
    <li
      // The rail. `border-l` on the branch container rather than a bar on the
      // row, so it runs the full height of the lecture *and its problems* —
      // which is what makes the gutter readable as a hierarchy instead of as a
      // stack of unrelated stripes.
      className={cn('border-l-[3px] pl-3', toneStyles[tone].rail)}
    >
      <NodeRow
        action={lecture.action}
        changedFields={lecture.changedFields}
        icon={<Layers className="size-4" strokeWidth={2.25} />}
        isVisible={lecture.isVisible}
        issues={lecture.issues}
        kind="lecture"
        nodeKey={lecture.key}
        title={lecture.title}
        tone={tone}
      />
      {lecture.problems.length > 0 ? (
        <ol className="mt-1 space-y-1 pb-1">
          {lecture.problems.map((problem) => (
            <ProblemRow key={problem.key} problem={problem} />
          ))}
        </ol>
      ) : null}
    </li>
  );
}

function ProblemRow({ problem }: { problem: PlannedProblem }) {
  const tone = rowTone({
    action: problem.action,
    severities: problem.issues.map((issue) => issue.severity),
  });

  return (
    <li className={cn('border-l-[3px] pl-3', toneStyles[tone].rail)}>
      <NodeRow
        action={problem.action}
        changedFields={problem.changedFields}
        counts={{
          tests: problem.testCases.length,
          hints: problem.hints.length,
        }}
        icon={<FileText className="size-4" strokeWidth={2.25} />}
        isVisible={problem.isVisible}
        issues={problem.issues}
        kind="problem"
        nodeKey={problem.key}
        title={problem.title}
        tone={tone}
      />
    </li>
  );
}

/**
 * One entity: what it is, what would happen to it, and why that might need a
 * second look.
 *
 * Expandable only when there is something behind it. §4.4 lets an update open
 * to show its changed fields and child counts, and a create or an unchanged row
 * has nothing to reveal — giving those a disclosure arrow that does nothing
 * teaches a team lead that the arrows are unreliable, and they stop using the
 * ones that work.
 */
function NodeRow({
  action,
  changedFields,
  counts,
  icon,
  isVisible,
  issues,
  kind,
  nodeKey,
  title,
  tone,
}: {
  action: ContentImportAction;
  changedFields: readonly string[];
  counts?: { tests: number; hints: number };
  icon: React.ReactNode;
  isVisible: boolean;
  issues: readonly ContentImportIssue[];
  kind: 'module' | 'lecture' | 'problem';
  nodeKey: string;
  title: string;
  tone: PlanTone;
}) {
  const { t } = useTranslation('content-import');
  const [open, setOpen] = React.useState(false);
  const detailId = React.useId();

  const expandable = changedFields.length > 0 || issues.length > 0;

  const body = (
    <>
      <span className={cn('shrink-0', toneStyles[tone].text)}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {/*
            The key, in tabular figures and its own weight. It is an identifier
            the whole feature turns on — VAR-001 and VAR-OO1 are different
            problems — so it is set to be compared character by character rather
            than read as a word.
          */}
          <span className="font-mono text-[12px] font-bold tracking-tight text-sub">
            {nodeKey}
          </span>
          <span className="truncate text-[14px] font-bold text-ink">{title}</span>
        </span>
        {counts ? (
          <span className="mt-0.5 block text-[12.5px] text-sub">
            {t('review.child_counts', {
              hints: counts.hints,
              tests: counts.tests,
            })}
          </span>
        ) : null}
      </span>

      {/*
        §12 — visibility never changes on import, so this reads as context
        rather than as an outcome. A team lead editing something students can
        see right now is the single fact most likely to change their mind about
        confirming, and it belongs on the row rather than only in the warning
        list.
      */}
      {isVisible ? (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-[11.5px] font-bold text-teal"
          title={t('review.visible_hint')}
        >
          <Eye className="size-3" strokeWidth={2.5} />
          {t('review.visible')}
        </span>
      ) : null}

      <ActionBadge action={action} kind={kind} tone={tone} />

      {expandable ? (
        <ChevronRight
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-sub transition-transform motion-reduce:transition-none',
            open && 'rotate-90',
          )}
        />
      ) : (
        <span aria-hidden className="size-4 shrink-0" />
      )}
    </>
  );

  return (
    <div className="py-1">
      {expandable ? (
        <button
          aria-controls={detailId}
          aria-expanded={open}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full items-center gap-2.5 px-2 py-1.5">{body}</div>
      )}

      {expandable && open ? (
        <div className="mt-1 ml-8 space-y-2 pb-1" id={detailId}>
          {changedFields.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-bold text-sub">
                {t('review.changed_fields')}
              </span>
              {changedFields.map((field) => (
                <code
                  className="rounded bg-brand/10 px-1.5 py-0.5 font-mono text-[11.5px] font-bold text-brand"
                  key={field}
                >
                  {field}
                </code>
              ))}
            </div>
          ) : null}
          {issues.map((issue, index) => (
            <IssueLine issue={issue} key={`${issue.code}-${index}`} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActionBadge({
  action,
  kind,
  tone,
}: {
  action: ContentImportAction;
  kind: 'module' | 'lecture' | 'problem';
  tone: PlanTone;
}) {
  const { t } = useTranslation('content-import');
  // The badge always names the action, never the blocker. A conflicted update
  // is still an update, and the rail beside it is already red — saying
  // "conflict" twice would leave nowhere to say what was going to happen.
  const actionTone: PlanTone =
    action === 'CREATE' ? 'create' : action === 'UPDATE' ? 'update' : 'unchanged';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold tracking-wide uppercase',
        toneStyles[actionTone].chip,
        tone === 'conflict' && 'ring-danger/40',
      )}
    >
      {t(`review.action.${action}.${kind}` as const)}
    </span>
  );
}

/**
 * One issue, located the way §4.5 requires.
 *
 * Sheet, row, column, and the value that was received — enough to open the
 * workbook and go straight to the cell. The received value is already truncated
 * and flattened by the server, so a hundred thousand characters of starter code
 * cannot push the rest of the line off the screen.
 */
function IssueLine({ issue }: { issue: ContentImportIssue }) {
  const { t } = useTranslation('content-import');
  const tone: PlanTone = issue.severity === 'WARNING' ? 'warning' : 'conflict';

  return (
    <p
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-[12.5px] leading-[1.55]',
        tone === 'warning'
          ? 'bg-warning/8 text-warning'
          : 'bg-danger/8 text-danger',
      )}
    >
      <span className="font-bold">{t(`issue.${issue.code}` as const)}</span>
      {issue.sheet ? (
        <span className="ml-1.5 font-mono text-[11.5px] opacity-80">
          {issue.rowNumber === null
            ? issue.sheet
            : t('review.issue_location', {
                column: issue.column ?? '—',
                row: issue.rowNumber,
                sheet: issue.sheet,
              })}
        </span>
      ) : null}
      {issue.received ? (
        <span className="ml-1.5 opacity-80">
          {t('review.issue_received', { value: issue.received })}
        </span>
      ) : null}
    </p>
  );
}

/* --------------------------------------------------------------- filtering */

/**
 * The tree, narrowed to what the filter and the search box asked for.
 *
 * A branch survives if it matches or if anything under it does. Dropping a
 * module because the module itself is unchanged would hide the four new
 * problems inside it, which is the opposite of what "show me the creates"
 * means.
 */
function filterPlan(
  modules: readonly PlannedModule[],
  filter: PlanFilter,
  search: string,
): PlannedModule[] {
  const needle = search.trim().toLowerCase();

  const matches = (node: {
    action: ContentImportAction;
    key: string;
    title: string;
    issues: readonly ContentImportIssue[];
  }): boolean => {
    if (needle.length > 0) {
      const haystack = `${node.key} ${node.title}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter === 'all') return true;
    if (filter === 'create') return node.action === 'CREATE';
    if (filter === 'update') return node.action === 'UPDATE';
    if (filter === 'unchanged') return node.action === 'UNCHANGED';
    if (filter === 'warning') {
      return node.issues.some((issue) => issue.severity === 'WARNING');
    }
    return node.issues.some((issue) => issue.severity !== 'WARNING');
  };

  const kept: PlannedModule[] = [];
  for (const courseModule of modules) {
    const lectures: PlannedLecture[] = [];
    for (const lecture of courseModule.lectures) {
      const problems = lecture.problems.filter(matches);
      if (problems.length > 0 || matches(lecture)) {
        lectures.push({ ...lecture, problems });
      }
    }
    if (lectures.length > 0 || matches(courseModule)) {
      kept.push({ ...courseModule, lectures });
    }
  }
  return kept;
}
