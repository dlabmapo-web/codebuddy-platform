import type { ChapterGroup, FilterOption, ProblemStat, SubjectNode, Submission } from './types';

export function groupSubmissionsByProblem(submissions: Submission[]) {
  const grouped: Record<string, Submission[]> = {};
  for (const submission of submissions) {
    if (!grouped[submission.problem_id]) grouped[submission.problem_id] = [];
    grouped[submission.problem_id].push(submission);
  }
  return grouped;
}

export function uniqueSubmissionProblems(submissions: Submission[]) {
  return Array.from(new Map(submissions.map((submission) => [submission.problem_id, submission.problems])).entries())
    .sort((a, b) => (a[1]?.problem_no ?? 0) - (b[1]?.problem_no ?? 0));
}

export function subjectOptions(subjects: SubjectNode[]): FilterOption[] {
  return subjects.map((subject) => ({ id: subject.id, title: subject.title, order_no: subject.order_no }));
}

export function stageOptions(subjects: SubjectNode[], subjectId: string): FilterOption[] {
  const subject = subjects.find((candidate) => candidate.id === subjectId);
  return (subject?.stages ?? []).map((stage) => ({ id: stage.id, title: stage.title, order_no: stage.order_no }));
}

export function chapterOptions(subjects: SubjectNode[], subjectId: string, stageId: string): FilterOption[] {
  if (stageId) {
    for (const subject of subjects) {
      const stage = subject.stages.find((candidate) => candidate.id === stageId);
      if (stage) return stage.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, order_no: chapter.order_no }));
    }
  }
  if (subjectId) {
    const subject = subjects.find((candidate) => candidate.id === subjectId);
    return (subject?.stages ?? []).flatMap((stage) =>
      stage.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, order_no: chapter.order_no })),
    );
  }
  return subjects.flatMap((subject) => subject.stages.flatMap((stage) =>
    stage.chapters.map((chapter) => ({ id: chapter.id, title: chapter.title, order_no: chapter.order_no })),
  ));
}

export function filterProblemStats(problems: ProblemStat[], subjectId: string, stageId: string, chapterId: string) {
  return problems.filter((problem) => {
    if (subjectId && problem.subject_id !== subjectId) return false;
    if (stageId && problem.stage_id !== stageId) return false;
    if (chapterId && problem.chapter_id !== chapterId) return false;
    return true;
  });
}

export function groupProblemsByChapter(problems: ProblemStat[]) {
  const groups = new Map<string, ChapterGroup>();
  for (const problem of problems) {
    const group = groups.get(problem.chapter_id) ?? {
      chapterId: problem.chapter_id,
      chapterTitle: problem.chapter_title,
      chapterOrder: problem.chapter_order_no,
      stageTitle: problem.stage_title,
      subjectTitle: problem.subject_title,
      problems: [],
    };
    group.problems.push(problem);
    groups.set(problem.chapter_id, group);
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.subjectTitle.localeCompare(b.subjectTitle)
    || a.stageTitle.localeCompare(b.stageTitle)
    || a.chapterOrder - b.chapterOrder,
  );
}
