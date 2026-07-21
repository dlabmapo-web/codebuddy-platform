import { useEffect, useMemo, useState } from 'react';
import {
  chapterOptions,
  filterProblemStats,
  groupProblemsByChapter,
  stageOptions,
  subjectOptions,
} from '../_lib/progress';
import type { ProblemStat, SubjectNode } from '../_lib/types';

export function useProblemProgress() {
  const [subjects, setSubjects] = useState<SubjectNode[]>([]);
  const [problemStats, setProblemStats] = useState<ProblemStat[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [stageId, setStageId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [collapsedChapters, setCollapsedChapters] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/progress').then((response) => response.json()).then((json) => {
      setSubjects(json.subjects ?? []);
      setProblemStats(json.problems ?? []);
    });
  }, []);

  const subjectsForFilter = useMemo(() => subjectOptions(subjects), [subjects]);
  const stagesForFilter = useMemo(() => stageOptions(subjects, subjectId), [subjects, subjectId]);
  const chaptersForFilter = useMemo(() => chapterOptions(subjects, subjectId, stageId), [subjects, subjectId, stageId]);
  const filteredProblems = useMemo(
    () => filterProblemStats(problemStats, subjectId, stageId, chapterId),
    [problemStats, subjectId, stageId, chapterId],
  );
  const groupedChapters = useMemo(() => groupProblemsByChapter(filteredProblems), [filteredProblems]);

  const selectSubject = (value: string) => {
    setSubjectId(value);
    setStageId('');
    setChapterId('');
  };
  const selectStage = (value: string) => {
    setStageId(value);
    setChapterId('');
  };
  const toggleChapter = (chapterKey: string) => {
    setCollapsedChapters((current) => {
      const next = new Set(current);
      if (next.has(chapterKey)) next.delete(chapterKey);
      else next.add(chapterKey);
      return next;
    });
  };

  return {
    chapterId,
    chaptersForFilter,
    collapsedChapters,
    filteredProblems,
    groupedChapters,
    problemStats,
    selectChapter: setChapterId,
    selectStage,
    selectSubject,
    stageId,
    stagesForFilter,
    subjectId,
    subjectsForFilter,
    toggleChapter,
  };
}
