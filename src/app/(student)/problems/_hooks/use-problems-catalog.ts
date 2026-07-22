import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type {
  ChapterItem,
  CurriculumMeta,
  DraftSession,
  SubjectItem,
} from '../_lib/types';

export function useProblemsCatalog() {
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

  const openProblem = useCallback((problemId: string) => {
    router.push(`/problems/${problemId}`);
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    // Route selection starts a new request lifecycle, so stale content must be hidden immediately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const deleteDraft = useCallback(async (sessionId: string) => {
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
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
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

  return {
    chapters,
    deleteDraft,
    draftProblemIds,
    drafts,
    draftsOpen,
    error,
    expandedChapters,
    goToCatalog,
    loading,
    normalizedQuery,
    openProblem,
    openStage,
    query,
    setDraftsOpen,
    setQuery,
    solvedCount,
    stage,
    stageId,
    subject,
    subjects,
    toggleChapter,
    totalProblemCount: allStageProblems.length,
    visibleChapters,
  };
}

export type ProblemsCatalogWorkflow = ReturnType<typeof useProblemsCatalog>;
