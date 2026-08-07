'use client';

import type {
  ExerciseProgressStatus,
  NavigatorRow,
  WorkspaceNavigatorContext,
} from '@cove/shared';
import { flattenNavigatorExercises } from '@cove/shared';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  LoaderCircle,
  X,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import {
  navigatorPanelClass,
  navigatorScroll,
} from '@/lib/workspace/navigator-geometry';

/**
 * The course, inside the workspace.
 *
 * Presentational and role-agnostic: it is handed a course, a displayed
 * exercise, an optional LIVE exercise, and one callback. It makes no request,
 * owns no socket, touches no document, and knows nothing about who is allowed
 * to open what — which is what lets the student's page and the teacher's page
 * render the same panel from two entirely different controllers.
 *
 * Selection and LIVE are separate inputs on purpose. A teacher reading ahead
 * is looking at one exercise while the student is on another, and collapsing
 * those into one "current" would make the panel lie about one of them.
 */

const statusIcons: Record<
  ExerciseProgressStatus,
  { className: string; Icon: typeof Circle }
> = {
  NOT_STARTED: { className: 'text-sub', Icon: Circle },
  IN_PROGRESS: { className: 'text-draft', Icon: Clock3 },
  SOLVED: { className: 'text-success', Icon: CheckCircle2 },
};

export function WorkspaceCurriculumNavigator({
  context,
  displayedMaterialId,
  liveMaterialId,
  busyMaterialId,
  disabled,
  dockAt = 'md',
  error,
  footer,
  onClose,
  onSelect,
  onRetry,
  open,
  panelId,
}: {
  /** Null while the course is still loading or failed to load. */
  context: WorkspaceNavigatorContext | null;
  displayedMaterialId: string;
  /** The exercise the watched student has open. Teacher surfaces only. */
  liveMaterialId?: string | null;
  /** The destination of a transition in flight, if any. */
  busyMaterialId?: string | null;
  /** True while a run, submission, or transition owns the workspace. */
  disabled?: boolean;
  /** The breakpoint where the overlay becomes a dedicated 320px column. */
  dockAt?: 'md' | 'lg';
  error?: boolean;
  /** Where this role goes to leave: a course outline, or a class roster. */
  footer: { href: string; label: string };
  onClose: () => void;
  onSelect: (materialId: string) => void;
  onRetry?: () => void;
  open: boolean;
  /** Matches the header trigger's `aria-controls`. */
  panelId: string;
}) {
  const { t } = useLayoutTranslation('learn');
  const rows = React.useMemo(
    () => (context ? flattenNavigatorExercises(context) : []),
    [context],
  );

  const displayedBranch = React.useMemo(
    () => rows.find((row) => row.materialId === displayedMaterialId),
    [displayedMaterialId, rows],
  );

  /**
   * Which branches are open.
   *
   * Seeded once from the branch holding the displayed exercise — a long course
   * fully expanded is a wall of titles — and owned by the reader from then on.
   * Reseeding happens only when the panel is showing a different course, so
   * neither a watched student moving nor a progress refresh can reach in and
   * reopen something the reader deliberately closed.
   */
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const seededCourseRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!context || seededCourseRef.current === context.course.id) return;
    seededCourseRef.current = context.course.id;
    setExpanded(
      new Set(
        displayedBranch
          ? [displayedBranch.moduleId, displayedBranch.lectureId]
          : [],
      ),
    );
  }, [context, displayedBranch]);

  const toggle = React.useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (!open) return null;

  return (
    <aside
      aria-label={t('navigator.title')}
      className={navigatorPanelClass(dockAt)}
      id={panelId}
      // A peer pointing at the outline is pointing at a place both people can
      // name, so the panel declares itself as that place rather than being
      // wrapped in something that has no box to measure.
      {...surfaceProps('curriculum')}
    >
      <header className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-sub">
            {t('navigator.title')}
          </p>
          <p className="truncate text-[13.5px] font-bold" title={context?.course.title}>
            {context?.course.title ?? t('navigator.loading')}
          </p>
          {context ? (
            <p className="text-[11.5px] text-sub">
              {t('outline.progress', {
                solved: context.course.progress.solved,
                total: context.course.progress.total,
              })}
            </p>
          ) : null}
        </div>
        <button
          aria-label={t('navigator.close')}
          className="grid size-7 shrink-0 place-items-center rounded-lg text-sub transition-colors hover:bg-canvas hover:text-ink"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className={navigatorScroll}>
        {error ? (
          // A curriculum that failed to load must not take the workspace with
          // it: the panel says so, offers a retry, and the exercise beside it
          // stays entirely usable.
          <div className="px-3 py-6 text-center">
            <p className="text-[13px] font-semibold">{t('navigator.error')}</p>
            {onRetry ? (
              <button
                className="mt-2 rounded-lg border border-border px-3 py-1.5 text-[12.5px] font-bold text-sub transition-colors hover:border-brand/40 hover:text-brand"
                onClick={onRetry}
                type="button"
              >
                {t('navigator.retry')}
              </button>
            ) : null}
          </div>
        ) : !context ? (
          <p aria-live="polite" className="px-3 py-6 text-center text-[13px] text-sub">
            {t('navigator.loading')}
          </p>
        ) : (
          <ul className="px-2 py-2">
            {context.course.modules.map((courseModule) => (
              <ModuleBranch
                courseModule={courseModule}
                displayedMaterialId={displayedMaterialId}
                busyMaterialId={busyMaterialId ?? null}
                disabled={disabled ?? false}
                expanded={expanded}
                key={courseModule.id}
                liveMaterialId={liveMaterialId ?? null}
                onSelect={onSelect}
                onToggle={toggle}
                rows={rows}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-3 py-2">
        <Link
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-sub transition-colors hover:text-brand"
          href={footer.href}
        >
          <ChevronRight aria-hidden className="size-3.5 rotate-180" />
          {footer.label}
        </Link>
      </footer>
    </aside>
  );
}

function ModuleBranch({
  busyMaterialId,
  courseModule,
  disabled,
  displayedMaterialId,
  expanded,
  liveMaterialId,
  onSelect,
  onToggle,
  rows,
}: {
  busyMaterialId: string | null;
  courseModule: WorkspaceNavigatorContext['course']['modules'][number];
  disabled: boolean;
  displayedMaterialId: string;
  expanded: ReadonlySet<string>;
  liveMaterialId: string | null;
  onSelect: (materialId: string) => void;
  onToggle: (id: string) => void;
  rows: NavigatorRow[];
}) {
  const { t } = useLayoutTranslation('learn');
  const open = expanded.has(courseModule.id);

  return (
    <li className="mb-1">
      <Branch
        label={t('outline.module_label', { position: courseModule.position })}
        onToggle={() => onToggle(courseModule.id)}
        open={open}
        title={courseModule.title}
      />
      {open ? (
        <ul className="ml-2 border-l border-border pl-1.5">
          {courseModule.lectures.map((lecture) => {
            const lectureOpen = expanded.has(lecture.id);
            return (
              <li className="mb-0.5" key={lecture.id}>
                <Branch
                  label={t('outline.lecture_label', { position: lecture.position })}
                  onToggle={() => onToggle(lecture.id)}
                  open={lectureOpen}
                  small
                  title={lecture.title}
                />
                {lectureOpen ? (
                  <ul>
                    {lecture.exercises.map((exercise) => {
                      const row = rows.find(
                        (candidate) => candidate.materialId === exercise.materialId,
                      );
                      return (
                        <ExerciseRow
                          busy={busyMaterialId === exercise.materialId}
                          disabled={disabled}
                          exercise={exercise}
                          key={exercise.materialId}
                          live={liveMaterialId === exercise.materialId}
                          number={row?.number ?? exercise.position}
                          onSelect={onSelect}
                          selected={displayedMaterialId === exercise.materialId}
                        />
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function Branch({
  label,
  onToggle,
  open,
  small,
  title,
}: {
  label: string;
  onToggle: () => void;
  open: boolean;
  small?: boolean;
  title: string;
}) {
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <button
      aria-expanded={open}
      className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
        small ? 'text-[12.5px]' : 'text-[13px]'
      }`}
      onClick={onToggle}
      type="button"
    >
      <Icon aria-hidden className="size-3.5 shrink-0 text-sub" />
      <span className="shrink-0 font-mono text-[10.5px] font-bold text-sub">
        {label}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${small ? 'font-semibold' : 'font-bold'}`}
        title={title}
      >
        {title}
      </span>
    </button>
  );
}

function ExerciseRow({
  busy,
  disabled,
  exercise,
  live,
  number,
  onSelect,
  selected,
}: {
  busy: boolean;
  disabled: boolean;
  exercise: WorkspaceNavigatorContext['course']['modules'][number]['lectures'][number]['exercises'][number];
  live: boolean;
  number: number;
  onSelect: (materialId: string) => void;
  selected: boolean;
}) {
  const { t } = useLayoutTranslation('learn');
  const status = statusIcons[exercise.status];

  return (
    <li>
      <button
        // The row the workspace is currently rendering, which on a teacher's
        // screen is not necessarily the one the student is on.
        aria-current={selected ? 'true' : undefined}
        className={`group flex w-full items-center gap-2 rounded-md py-1.5 pl-1.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50 ${
          selected ? 'bg-brand-soft' : 'hover:bg-canvas'
        }`}
        disabled={disabled || busy}
        onClick={() => onSelect(exercise.materialId)}
        type="button"
      >
        <span className="w-6 shrink-0 text-right font-mono text-[11px] font-bold text-sub">
          {number}
        </span>
        {busy ? (
          <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin text-brand" />
        ) : (
          <status.Icon
            aria-hidden
            className={`size-3.5 shrink-0 ${status.className}`}
          />
        )}
        <span
          className={`min-w-0 flex-1 truncate text-[12.5px] ${
            selected ? 'font-bold text-brand' : 'font-medium'
          }`}
          title={exercise.title}
        >
          {exercise.title}
        </span>
        {/* Status is a word as well as a colour: a red and a green dot are the
            same dot to a large share of readers. */}
        <span className="sr-only">{t(`status.${exercise.status}`)}</span>
        {live ? (
          <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-danger">
            {t('navigator.live')}
          </span>
        ) : null}
      </button>
    </li>
  );
}
