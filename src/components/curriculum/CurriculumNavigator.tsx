'use client';

import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  ListTree,
  Radio,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type {
  LearningContext,
  LearningContextPath,
  LearningContextProblem,
} from '@/lib/curriculum/learningContext';
import {
  canSelectCurriculumProblem,
  type CurriculumNavigatorMode,
} from '@/lib/curriculum/navigator';

type CurriculumNavigatorProps = {
  mode: CurriculumNavigatorMode;
  context: LearningContext;
  displayedPath?: LearningContextPath;
  displayedProblemId: string;
  liveProblemId?: string | null;
  navigationDisabled?: boolean;
  allSubjectsHref: string;
  onOpenChange?: (open: boolean) => void;
  onSelectProblem: (problem: LearningContextProblem) => void;
};

export const CURRICULUM_PANEL_DESKTOP_WIDTH = 320;
export const FULLSCREEN_HEADER_HEIGHT = 48;

const STATUS_META = {
  passed: { label: '완료', icon: Check, color: '#16A36A' },
  attempted: { label: '시도', icon: Clock3, color: '#D97706' },
  untouched: { label: '미시도', icon: Circle, color: 'var(--color-sub)' },
} as const;

export function CurriculumNavigator({
  mode,
  context,
  displayedPath = context.path,
  displayedProblemId,
  liveProblemId = mode === 'student' ? displayedProblemId : null,
  navigationDisabled = false,
  allSubjectsHref,
  onOpenChange,
  onSelectProblem,
}: CurriculumNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedStages, setExpandedStages] = useState<Set<string>>(
    () => new Set()
  );
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(
    () => new Set()
  );
  const triggerRef = useRef<HTMLButtonElement>(null);

  const changeOpen = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const trigger = triggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        changeOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (trigger ?? previousFocus)?.focus();
    };
  }, [changeOpen, open]);

  const toggleStage = (stageId: string, expanded: boolean) => {
    const isCurrent = stageId === context.path.stage.id;
    if (isCurrent) {
      setCollapsedStages((current) => {
        const next = new Set(current);
        if (expanded) next.add(stageId);
        else next.delete(stageId);
        return next;
      });
      return;
    }
    setExpandedStages((current) => {
      const next = new Set(current);
      if (expanded) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const toggleChapter = (chapterId: string, expanded: boolean) => {
    const isCurrent = chapterId === context.path.chapter.id;
    if (isCurrent) {
      setCollapsedChapters((current) => {
        const next = new Set(current);
        if (expanded) next.add(chapterId);
        else next.delete(chapterId);
        return next;
      });
      return;
    }
    setExpandedChapters((current) => {
      const next = new Set(current);
      if (expanded) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  };

  const stopPropagation = (event: ReactKeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.stopPropagation();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="fullscreen-curriculum-drawer"
        onClick={() => changeOpen(!open)}
        className="flex min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--color-surface)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        title={`${displayedPath.subject.title} › ${displayedPath.stage.title} › ${displayedPath.chapter.title} › ${displayedPath.problem.problemNo}. ${displayedPath.problem.title}`}
        data-testid="curriculum-navigator-trigger"
      >
        <ListTree size={16} className="shrink-0 text-primary" />
        <span
          className="hidden max-w-[360px] truncate 2xl:inline"
          style={{ fontSize: 12, color: 'var(--color-sub)' }}
        >
          {displayedPath.subject.title}
          <span aria-hidden="true"> › </span>
          {displayedPath.stage.title}
          <span aria-hidden="true"> › </span>
          {displayedPath.chapter.title}
        </span>
        <ChevronRight size={13} className="shrink-0 text-sub" />
      </button>

      {open && createPortal(
        (
          <aside
            id="fullscreen-curriculum-drawer"
            aria-label="교육과정"
            data-collaboration-surface="curriculum"
            className="fixed bottom-0 left-0 z-[80] flex flex-col bg-card shadow-2xl"
            style={{
              borderRight: '1px solid var(--color-border)',
              top: FULLSCREEN_HEADER_HEIGHT,
              width: `min(${CURRICULUM_PANEL_DESKTOP_WIDTH}px, calc(100vw - 24px))`,
            }}
            data-testid="curriculum-navigator-drawer"
          >
            <div
              className="flex h-14 shrink-0 items-center gap-3 px-4"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                }}
              >
                <BookOpen size={17} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--color-ink)',
                  }}
                >
                  {context.subject.title}
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-sub)' }}>
                  {mode === 'student' ? '문제를 선택해 이동하세요' : '학생의 학습 위치'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => changeOpen(false)}
                aria-label="교육과정 닫기"
                className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--color-surface)]"
                style={{ color: 'var(--color-sub)' }}
              >
                <X size={17} />
              </button>
            </div>

            <div
              className="min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-3"
              style={{ scrollbarGutter: 'stable' }}
            >
              {context.subject.stages.map((stage) => {
                const isCurrentStage = stage.id === context.path.stage.id;
                const stageExpanded = isCurrentStage
                  ? !collapsedStages.has(stage.id)
                  : expandedStages.has(stage.id);

                return (
                  <section key={stage.id} className="mb-2">
                    <button
                      type="button"
                      aria-expanded={stageExpanded}
                      onClick={() => toggleStage(stage.id, stageExpanded)}
                      onKeyDown={stopPropagation}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface)]"
                    >
                      {stageExpanded
                        ? <ChevronDown size={14} className="shrink-0 text-sub" />
                        : <ChevronRight size={14} className="shrink-0 text-sub" />}
                      <span
                        className="truncate"
                        style={{
                          fontSize: 13,
                          fontWeight: isCurrentStage ? 700 : 600,
                          color: isCurrentStage
                            ? 'var(--color-primary)'
                            : 'var(--color-ink)',
                        }}
                      >
                        {stage.title}
                      </span>
                    </button>

                    {stageExpanded && (
                      <div className="ml-3 border-l pl-2" style={{ borderColor: 'var(--color-border)' }}>
                        {stage.chapters.map((chapter) => {
                          const isCurrentChapter = chapter.id === context.path.chapter.id;
                          const chapterExpanded = isCurrentChapter
                            ? !collapsedChapters.has(chapter.id)
                            : expandedChapters.has(chapter.id);

                          return (
                            <div key={chapter.id} className="my-1">
                              <button
                                type="button"
                                aria-expanded={chapterExpanded}
                                onClick={() => toggleChapter(chapter.id, chapterExpanded)}
                                onKeyDown={stopPropagation}
                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-surface)]"
                              >
                                {chapterExpanded
                                  ? <ChevronDown size={13} className="shrink-0 text-sub" />
                                  : <ChevronRight size={13} className="shrink-0 text-sub" />}
                                <span
                                  className="truncate"
                                  style={{
                                    fontSize: 12,
                                    fontWeight: isCurrentChapter ? 700 : 600,
                                    color: 'var(--color-ink)',
                                  }}
                                >
                                  {chapter.title}
                                </span>
                              </button>

                              {chapterExpanded && (
                                <div className="mt-1 space-y-1 pl-2">
                                  {chapter.problems.map((problem) => {
                                    const isDisplayed = problem.id === displayedProblemId;
                                    const isLive = problem.id === liveProblemId;
                                    const selectable = canSelectCurriculumProblem({
                                      mode,
                                      problemId: problem.id,
                                      displayedProblemId,
                                      liveProblemId,
                                      navigationDisabled,
                                    });
                                    const status = STATUS_META[problem.status];
                                    const StatusIcon = status.icon;

                                    return (
                                      <button
                                        key={problem.id}
                                        type="button"
                                        data-testid={`curriculum-problem-${problem.id}`}
                                        data-live={isLive ? 'true' : 'false'}
                                        aria-current={isDisplayed ? 'page' : undefined}
                                        disabled={!selectable}
                                        onClick={() => onSelectProblem(problem)}
                                        title={`${problem.problemNo}. ${problem.title}`}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors enabled:hover:bg-[var(--color-primary-light)] disabled:cursor-default"
                                        style={{
                                          backgroundColor: isDisplayed
                                            ? 'var(--color-primary-light)'
                                            : 'transparent',
                                          border: isDisplayed
                                            ? '1px solid var(--tint-accent-line)'
                                            : '1px solid transparent',
                                          opacity: 1,
                                        }}
                                      >
                                        <span
                                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
                                          style={{
                                            backgroundColor: isDisplayed
                                              ? 'var(--color-primary)'
                                              : 'var(--color-surface)',
                                            color: isDisplayed
                                              ? '#fff'
                                              : 'var(--color-sub)',
                                            fontSize: 10,
                                            fontWeight: 700,
                                          }}
                                        >
                                          {problem.problemNo}
                                        </span>
                                        <span
                                          className="min-w-0 flex-1 truncate"
                                          style={{
                                            fontSize: 12,
                                            fontWeight: isDisplayed ? 700 : 500,
                                            color: isDisplayed
                                              ? 'var(--color-primary-hover)'
                                              : 'var(--color-ink)',
                                          }}
                                        >
                                          {problem.title}
                                        </span>
                                        {isLive ? (
                                          <span
                                            className="flex shrink-0 items-center gap-1"
                                            style={{
                                              fontSize: 10,
                                              fontWeight: 700,
                                              color: 'var(--color-primary)',
                                            }}
                                          >
                                            <Radio size={11} className="animate-pulse motion-reduce:animate-none" />
                                            LIVE
                                          </span>
                                        ) : (
                                          <span
                                            className="flex shrink-0 items-center gap-1"
                                            style={{ fontSize: 10, color: status.color }}
                                          >
                                            <StatusIcon size={11} />
                                            {status.label}
                                          </span>
                                        )}
                                      </button>
                                    );
                                  })}
                                  {chapter.problems.length === 0 && (
                                    <p className="px-2 py-2" style={{ fontSize: 11, color: 'var(--color-sub)' }}>
                                      공개된 문제가 없습니다.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>

            <div
              className="shrink-0 p-3"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <Link
                href={allSubjectsHref}
                onClick={() => changeOpen(false)}
                className="flex h-10 items-center justify-center rounded-lg font-semibold transition-colors hover:bg-[var(--color-surface)]"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-ink)',
                  fontSize: 12,
                }}
              >
                전체 과목 보기
              </Link>
            </div>
          </aside>
        ),
        document.body
      )}
    </>
  );
}
