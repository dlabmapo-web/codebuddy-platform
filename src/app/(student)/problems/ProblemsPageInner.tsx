'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Blocks,
  BookOpen,
  BookOpenCheck,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Code2,
  Cpu,
  Database,
  Layers3,
  PenLine,
  Search,
  Sparkles,
  Terminal,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';

type SolveStatus = 'unsolved' | 'tried' | 'solved';

type StageItem = {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  order_no: number;
  chapter_count: number;
  problem_count: number;
  solved_count: number;
};

type SubjectItem = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  stages: StageItem[];
};

type StudentProblem = {
  id: string;
  problem_no: number;
  chapter_id: string;
  order_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  solve_status: SolveStatus;
};

type ChapterItem = {
  id: string;
  stage_id: string;
  title: string;
  description: string | null;
  order_no: number;
  problems: StudentProblem[];
};

type CurriculumMeta = {
  id: string;
  title: string;
  description?: string | null;
  order_no: number;
  subject_id?: string;
};

type DraftSession = {
  id: string;
  problem_id: string;
  final_code: string;
  problems: {
    problem_no: number;
    title: string;
    difficulty: ProblemDifficulty;
  } | null;
};

const STAGE_VISUALS: Array<{ Icon: LucideIcon; background: string; color: string; accent: string }> = [
  { Icon: Code2, background: '#EEF4FF', color: 'var(--color-primary)', accent: '#BFD3F5' },
  { Icon: Braces, background: '#F0FDF4', color: '#15803D', accent: '#BBE5C8' },
  { Icon: Workflow, background: '#FFF7ED', color: '#C2410C', accent: '#FED7AA' },
  { Icon: Database, background: '#F5F3FF', color: '#7C3AED', accent: '#DDD6FE' },
  { Icon: Cpu, background: '#FFF1F2', color: '#BE123C', accent: '#FECDD3' },
  { Icon: Terminal, background: '#F0FDFA', color: '#0F766E', accent: '#99F6E4' },
  { Icon: Blocks, background: '#FDF4FF', color: '#A21CAF', accent: '#F5D0FE' },
  { Icon: BookOpenCheck, background: '#FFFBEB', color: '#B45309', accent: '#FDE68A' },
];

const DIFF_LABEL: Record<ProblemDifficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};
const STATUS: Record<SolveStatus, { label: string; color: string; bg: string; Icon: LucideIcon }> = {
  unsolved: { label: '미풀이', color: 'var(--color-sub)', bg: 'var(--color-surface)', Icon: Circle },
  tried: { label: '도전 중', color: '#D97706', bg: '#FEF3C7', Icon: Clock3 },
  solved: { label: '완료', color: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
};

function stageVisual(orderNo: number) {
  return STAGE_VISUALS[(Math.max(orderNo, 1) - 1) % STAGE_VISUALS.length];
}

function StageCard({ stage, onClick }: { stage: StageItem; onClick: () => void }) {
  const visual = stageVisual(stage.order_no);
  const progress = stage.problem_count > 0
    ? Math.round((stage.solved_count / stage.problem_count) * 100)
    : 0;

  return (
    <button
      onClick={onClick}
      className="group overflow-hidden rounded-2xl bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
      style={{ border: '1px solid var(--color-border)', boxShadow: '0 2px 8px rgba(22,24,29,0.04)' }}
    >
      <div
        className="relative flex h-32 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(145deg, ${visual.background} 0%, var(--color-card) 100%)` }}
      >
        <div
          className="absolute -right-7 -top-8 rounded-full opacity-40"
          style={{ width: 96, height: 96, backgroundColor: visual.accent }}
        />
        <div
          className="absolute -bottom-10 -left-4 rounded-full opacity-30"
          style={{ width: 80, height: 80, backgroundColor: visual.accent }}
        />
        <div
          className="relative flex items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
          style={{ width: 58, height: 58, color: visual.color, backgroundColor: 'var(--color-card)', boxShadow: '0 8px 24px rgba(22,24,29,0.10)' }}
        >
          <visual.Icon size={28} strokeWidth={1.8} />
        </div>
        <span
          className="absolute left-3 top-3 rounded-full px-2.5 py-1"
          style={{ fontSize: '11px', fontWeight: 700, color: visual.color, backgroundColor: 'var(--color-card)' }}
        >
          STEP {stage.order_no}
        </span>
      </div>

      <div className="p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>
              {stage.title}
            </h3>
            <p className="mt-1 line-clamp-2" style={{ minHeight: 38, fontSize: '12px', lineHeight: 1.55, color: 'var(--color-sub)' }}>
              {stage.description || '이 단계의 핵심 개념을 문제로 익혀보세요.'}
            </p>
          </div>
          <ChevronRight size={17} className="mt-0.5 shrink-0 text-[#BCC0C7] transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span style={{ fontSize: '11px', color: 'var(--color-sub)' }}>
              챕터 {stage.chapter_count} · 문제 {stage.problem_count}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: progress === 100 ? '#15803D' : 'var(--color-primary)' }}>
              {stage.solved_count}/{stage.problem_count}
            </span>
          </div>
          <div className="overflow-hidden rounded-full" style={{ height: 5, backgroundColor: 'var(--color-muted)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: progress === 100 ? '#16A34A' : visual.color }}
            />
          </div>
        </div>
      </div>
    </button>
  );
}

function PageSkeleton({ cards = true }: { cards?: boolean }) {
  return (
    <div className={cards ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'flex flex-col gap-3'}>
      {Array.from({ length: cards ? 6 : 5 }).map((_, index) => (
        <div
          key={index}
          className="animate-pulse rounded-2xl bg-card"
          style={{ height: cards ? 258 : 74, border: '1px solid var(--color-border)' }}
        />
      ))}
    </div>
  );
}

export default function ProblemsPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stageId = searchParams.get('stage') ?? '';
  const requestedChapterId = searchParams.get('chapter') ?? '';

  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [subject, setSubject] = useState<CurriculumMeta | null>(null);
  const [stage, setStage] = useState<CurriculumMeta | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<DraftSession[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const openStage = useCallback((subjectId: string, nextStageId: string) => {
    const params = new URLSearchParams({ subject: subjectId, stage: nextStageId });
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router]);

  const goToCatalog = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');

    const request = stageId
      ? fetch(`/api/curriculum/chapters?stage_id=${stageId}`, { signal: controller.signal })
      : fetch('/api/curriculum/subjects', { signal: controller.signal });

    request
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? '커리큘럼을 불러오지 못했습니다.');
        return json;
      })
      .then((json) => {
        if (stageId) {
          const nextChapters = (json.chapters ?? []) as ChapterItem[];
          setSubject(json.subject ?? null);
          setStage(json.stage ?? null);
          setChapters(nextChapters);
          setSubjects([]);
          setExpandedChapters(() => {
            if (requestedChapterId && nextChapters.some((chapter) => chapter.id === requestedChapterId)) {
              return new Set([requestedChapterId]);
            }
            return nextChapters[0] ? new Set([nextChapters[0].id]) : new Set();
          });
        } else {
          setSubjects(json.subjects ?? []);
          setSubject(null);
          setStage(null);
          setChapters([]);
          setExpandedChapters(new Set());
        }
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : '커리큘럼을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [stageId, requestedChapterId]);

  useEffect(() => {
    fetch('/api/sessions')
      .then((response) => response.json())
      .then((json) => {
        const sessions = (json.sessions ?? []) as DraftSession[];
        const byProblem = new Map<string, DraftSession>();
        for (const session of sessions) {
          if (!session.final_code || !session.problems || !session.problem_id) continue;
          if (!byProblem.has(session.problem_id)) byProblem.set(session.problem_id, session);
        }
        setDrafts(Array.from(byProblem.values()));
      })
      .catch(() => undefined);
  }, []);

  const deleteDraft = useCallback(async (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDrafts((current) => current.filter((draft) => draft.id !== sessionId));
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_code: null }),
    });
  }, []);

  const toggleChapter = (chapterId: string) => {
    setExpandedChapters((current) => {
      const next = new Set(current);
      next.has(chapterId) ? next.delete(chapterId) : next.add(chapterId);
      return next;
    });
  };

  const allStageProblems = useMemo(
    () => chapters.flatMap((chapter) => chapter.problems),
    [chapters],
  );
  const solvedCount = useMemo(
    () => allStageProblems.filter((problem) => problem.solve_status === 'solved').length,
    [allStageProblems],
  );
  const draftProblemIds = useMemo(
    () => new Set(drafts.map((draft) => draft.problem_id)),
    [drafts],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const visibleChapters = useMemo(() => {
    if (!normalizedQuery) return chapters;
    return chapters
      .map((chapter) => ({
        ...chapter,
        problems: chapter.problems.filter((problem) =>
          problem.title.toLocaleLowerCase('ko-KR').includes(normalizedQuery)),
      }))
      .filter((chapter) => chapter.problems.length > 0);
  }, [chapters, normalizedQuery]);

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-6">
      {stageId ? (
        <section
          className="relative overflow-hidden rounded-3xl px-5 py-6 sm:px-7"
          style={{ background: 'linear-gradient(135deg, var(--tint-1) 0%, var(--tint-2) 60%, var(--tint-3) 100%)', border: '1px solid var(--tint-line)' }}
        >
          <div className="absolute -right-16 -top-24 h-56 w-56 rounded-full bg-[var(--tint-decor)]/40" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <button
                onClick={goToCatalog}
                className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-sub shadow-sm transition-colors hover:text-primary"
                aria-label="전체 단계로 돌아가기"
              >
                <ArrowLeft size={17} />
              </button>
              <div>
                <div className="mb-2 flex items-center gap-2" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
                  <span>{subject?.title}</span>
                  <ChevronRight size={12} />
                  <span>STEP {stage?.order_no}</span>
                </div>
                <h1 style={{ fontSize: '25px', fontWeight: 800, color: 'var(--color-ink)', letterSpacing: '-0.02em' }}>
                  {stage?.title}
                </h1>
                <p className="mt-1.5 max-w-2xl" style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--color-sub)' }}>
                  {stage?.description || '챕터를 하나씩 펼쳐 문제를 풀며 학습을 완성해보세요.'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 rounded-2xl bg-card/85 px-5 py-3 shadow-sm backdrop-blur">
              <div>
                <p style={{ fontSize: '11px', color: 'var(--color-sub)' }}>학습 진행률</p>
                <p className="mt-0.5" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-primary)' }}>
                  {solvedCount}<span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-sub)' }}> / {allStageProblems.length}</span>
                </p>
              </div>
              <div className="h-10 w-px bg-border" />
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light text-primary">
                <BookOpenCheck size={21} />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light text-primary">
              <Layers3 size={19} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>LEARNING PATH</span>
          </div>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-ink)', letterSpacing: '-0.025em' }}>
            어떤 단계부터 시작할까요?
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--color-sub)' }}>
            과목별 학습 단계를 살펴보고, 원하는 카드에서 바로 시작하세요.
          </p>
        </header>
      )}

      {drafts.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-card" style={{ border: '1px solid var(--tint-line)' }}>
          <button
            onClick={() => setDraftsOpen((open) => !open)}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
            style={{ backgroundColor: 'var(--tint-soft)' }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--tint-fill)] text-primary">
              <PenLine size={15} />
            </div>
            <div className="flex-1">
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>이어서 풀기</span>
              <span className="ml-2" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>저장된 코드 {drafts.length}개</span>
            </div>
            <ChevronDown size={16} className={`text-[var(--color-sub)] transition-transform ${draftsOpen ? 'rotate-180' : ''}`} />
          </button>
          {draftsOpen && (
            <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/problems/${draft.problem_id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') router.push(`/problems/${draft.problem_id}`);
                  }}
                  className="flex items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-[var(--color-muted)]"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-sub">
                    <Code2 size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>{draft.problems?.title}</p>
                    <p style={{ fontSize: '11px', color: 'var(--color-sub)' }}>코드 {draft.final_code.trim().split('\n').length}줄 저장됨</p>
                  </div>
                  <button
                    onClick={(event) => deleteDraft(draft.id, event)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#BCC0C7] hover:bg-[var(--tint-danger)] hover:text-danger"
                    aria-label="저장된 코드 삭제"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {error ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16" style={{ border: '1px solid var(--color-border)' }}>
          <BookOpen size={36} style={{ color: '#D1D5DB' }} />
          <p className="mt-3" style={{ fontSize: '14px', color: 'var(--color-sub)' }}>{error}</p>
        </div>
      ) : loading ? (
        <PageSkeleton cards={!stageId} />
      ) : !stageId ? (
        subjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-20" style={{ border: '1px solid var(--color-border)' }}>
            <BookOpen size={38} style={{ color: '#D1D5DB' }} />
            <p className="mt-3" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>공개된 커리큘럼이 없습니다</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {subjects.map((subjectItem) => (
              <section key={subjectItem.id}>
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-7 min-w-7 items-center justify-center rounded-lg px-2"
                        style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-card)', backgroundColor: 'var(--color-primary)' }}
                      >
                        {subjectItem.order_no}
                      </span>
                      <h2 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--color-ink)' }}>{subjectItem.title}</h2>
                    </div>
                    {subjectItem.description && (
                      <p className="mt-1.5" style={{ fontSize: '13px', color: 'var(--color-sub)' }}>{subjectItem.description}</p>
                    )}
                  </div>
                  <span className="shrink-0" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{subjectItem.stages.length}개 단계</span>
                </div>
                {subjectItem.stages.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#D7DAE0] px-5 py-8 text-center" style={{ fontSize: '13px', color: 'var(--color-sub)' }}>
                    준비 중인 과목입니다.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {subjectItem.stages.map((stageItem) => (
                      <StageCard
                        key={stageItem.id}
                        stage={stageItem}
                        onClick={() => openStage(subjectItem.id, stageItem.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--color-ink)' }}>챕터별 문제</h2>
              <p className="mt-1" style={{ fontSize: '13px', color: 'var(--color-sub)' }}>
                챕터를 펼쳐 문제를 확인하고 학습을 이어가세요.
              </p>
            </div>
            <label className="flex h-10 w-full items-center gap-2 rounded-xl bg-card px-3 sm:w-72" style={{ border: '1px solid var(--color-border)' }}>
              <Search size={15} style={{ color: '#BCC0C7' }} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
                style={{ fontSize: '13px', color: 'var(--color-ink)' }}
                placeholder="문제 제목 검색"
              />
              {query && (
                <button onClick={() => setQuery('')} className="text-[#BCC0C7]" aria-label="검색어 지우기">
                  <X size={13} />
                </button>
              )}
            </label>
          </div>

          {visibleChapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16" style={{ border: '1px solid var(--color-border)' }}>
              <Search size={32} style={{ color: '#D1D5DB' }} />
              <p className="mt-3" style={{ fontSize: '14px', color: 'var(--color-sub)' }}>검색 결과가 없습니다</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleChapters.map((chapter) => {
                const expanded = expandedChapters.has(chapter.id) || Boolean(normalizedQuery);
                const completed = chapter.problems.filter((problem) => problem.solve_status === 'solved').length;
                const chapterProgress = chapter.problems.length > 0
                  ? Math.round((completed / chapter.problems.length) * 100)
                  : 0;

                return (
                  <section
                    key={chapter.id}
                    className="overflow-hidden rounded-2xl bg-card"
                    style={{ border: expanded ? '1px solid var(--tint-line)' : '1px solid var(--color-border)', boxShadow: expanded ? '0 5px 18px rgba(27,100,218,0.06)' : 'none' }}
                  >
                    <button
                      onClick={() => toggleChapter(chapter.id)}
                      className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--color-muted)] sm:px-5"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ color: expanded ? 'var(--color-primary)' : 'var(--color-sub)', backgroundColor: expanded ? 'var(--color-primary-light)' : 'var(--color-surface)' }}
                      >
                        {completed === chapter.problems.length && chapter.problems.length > 0
                          ? <CheckCircle2 size={19} />
                          : <BookOpen size={19} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary)' }}>CHAPTER {chapter.order_no}</span>
                          {chapterProgress === 100 && (
                            <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>완료</span>
                          )}
                        </div>
                        <h3 className="mt-0.5 truncate" style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-ink)' }}>{chapter.title}</h3>
                        {chapter.description && (
                          <p className="mt-0.5 truncate" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>{chapter.description}</p>
                        )}
                      </div>
                      <div className="hidden w-36 shrink-0 sm:block">
                        <div className="mb-1 flex justify-between" style={{ fontSize: '11px', color: 'var(--color-sub)' }}>
                          <span>{completed}/{chapter.problems.length} 완료</span>
                          <span>{chapterProgress}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${chapterProgress}%` }} />
                        </div>
                      </div>
                      <ChevronDown size={17} className={`shrink-0 text-[var(--color-sub)] transition-transform ${expanded ? 'rotate-180 text-primary' : ''}`} />
                    </button>

                    {expanded && (
                      <div className="border-t border-[var(--color-muted)] bg-[var(--color-muted)] p-2 sm:p-3">
                        {chapter.problems.length === 0 ? (
                          <div className="rounded-xl bg-card px-4 py-7 text-center" style={{ fontSize: '13px', color: 'var(--color-sub)' }}>
                            이 챕터에는 아직 문제가 없습니다.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {chapter.problems.map((problem) => {
                              const status = STATUS[problem.solve_status];
                              const difficulty = DIFF_COLOR[problem.difficulty];
                              const hasDraft = draftProblemIds.has(problem.id);

                              return (
                                <button
                                  key={problem.id}
                                  onClick={() => router.push(`/problems/${problem.id}`)}
                                  className="group flex w-full items-center gap-3 rounded-xl bg-card px-3 py-3 text-left transition-all hover:border-[#9EBDEC] hover:shadow-sm sm:px-4"
                                  style={{ border: hasDraft ? '1px solid #BFDBFE' : '1px solid var(--color-border)' }}
                                >
                                  <span
                                    className="flex h-8 min-w-12 shrink-0 items-center justify-center rounded-lg px-2"
                                    style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-sub)', backgroundColor: 'var(--color-surface)', fontFamily: 'monospace' }}
                                  >
                                    {chapter.order_no}-{problem.order_no}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate transition-colors group-hover:text-primary" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>
                                      {problem.title}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <span className="rounded-md px-1.5 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: difficulty.color, backgroundColor: difficulty.bg }}>
                                        {DIFF_LABEL[problem.difficulty]}
                                      </span>
                                      {hasDraft && (
                                        <span className="flex items-center gap-1 rounded-md bg-[var(--tint-soft)] px-1.5 py-0.5" style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-primary)' }}>
                                          <PenLine size={9} /> 이어 풀기
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className="hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 sm:flex"
                                    style={{ fontSize: '11px', fontWeight: 700, color: status.color, backgroundColor: status.bg }}
                                  >
                                    <status.Icon size={12} />
                                    {status.label}
                                  </span>
                                  <ChevronRight size={17} className="shrink-0 text-[#BCC0C7] transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-center gap-2 py-2" style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
            <Sparkles size={13} style={{ color: '#D97706' }} />
            완료한 문제는 자동으로 학습 진행률에 반영됩니다.
          </div>
        </>
      )}
    </div>
  );
}
