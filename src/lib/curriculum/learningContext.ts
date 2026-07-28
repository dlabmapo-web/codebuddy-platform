export type LearningProgressStatus = 'passed' | 'attempted' | 'untouched';

export type LearningContextPath = {
  subject: { id: string; title: string };
  stage: { id: string; title: string };
  chapter: { id: string; title: string };
  problem: { id: string; problemNo: number; title: string };
};

export type LearningContextProblem = {
  id: string;
  problemNo: number;
  title: string;
  orderNo: number;
  status: LearningProgressStatus;
};

export type LearningContextChapter = {
  id: string;
  title: string;
  orderNo: number;
  problems: LearningContextProblem[];
};

export type LearningContextStage = {
  id: string;
  title: string;
  orderNo: number;
  chapters: LearningContextChapter[];
};

export type LearningContext = {
  path: LearningContextPath;
  subject: {
    id: string;
    title: string;
    stages: LearningContextStage[];
  };
};

export type LearningContextSource = {
  path: LearningContextPath;
  stages: Array<{
    id: string;
    subjectId: string;
    title: string;
    orderNo: number;
    isPublished: boolean;
  }>;
  chapters: Array<{
    id: string;
    stageId: string;
    title: string;
    orderNo: number;
    isPublished: boolean;
  }>;
  problems: Array<{
    id: string;
    chapterId: string | null;
    problemNo: number;
    title: string;
    orderNo: number;
    isPublished: boolean;
  }>;
  submissions: Array<{
    problemId: string;
    status: string;
  }>;
};

function compareOrdered(
  left: { orderNo: number; title: string; id: string },
  right: { orderNo: number; title: string; id: string }
) {
  return left.orderNo - right.orderNo
    || left.title.localeCompare(right.title)
    || left.id.localeCompare(right.id);
}

function resolveStatuses(
  submissions: LearningContextSource['submissions']
): Map<string, LearningProgressStatus> {
  const statuses = new Map<string, LearningProgressStatus>();

  for (const submission of submissions) {
    const current = statuses.get(submission.problemId);
    if (current === 'passed') continue;
    statuses.set(
      submission.problemId,
      submission.status === 'pass' ? 'passed' : 'attempted'
    );
  }

  return statuses;
}

export function buildLearningContext(
  source: LearningContextSource
): LearningContext {
  const statuses = resolveStatuses(source.submissions);
  const publishedProblems = source.problems
    .filter((problem) => problem.isPublished && problem.chapterId)
    .sort(compareOrdered);
  const problemsByChapter = new Map<string, LearningContextProblem[]>();

  for (const problem of publishedProblems) {
    if (!problem.chapterId) continue;
    const list = problemsByChapter.get(problem.chapterId) ?? [];
    list.push({
      id: problem.id,
      problemNo: problem.problemNo,
      title: problem.title,
      orderNo: problem.orderNo,
      status: statuses.get(problem.id) ?? 'untouched',
    });
    problemsByChapter.set(problem.chapterId, list);
  }

  const chaptersByStage = new Map<string, LearningContextChapter[]>();
  for (const chapter of source.chapters
    .filter((item) => item.isPublished)
    .sort(compareOrdered)) {
    const list = chaptersByStage.get(chapter.stageId) ?? [];
    list.push({
      id: chapter.id,
      title: chapter.title,
      orderNo: chapter.orderNo,
      problems: problemsByChapter.get(chapter.id) ?? [],
    });
    chaptersByStage.set(chapter.stageId, list);
  }

  const stages = source.stages
    .filter(
      (stage) => stage.isPublished && stage.subjectId === source.path.subject.id
    )
    .sort(compareOrdered)
    .map((stage) => ({
      id: stage.id,
      title: stage.title,
      orderNo: stage.orderNo,
      chapters: chaptersByStage.get(stage.id) ?? [],
    }));

  return {
    path: source.path,
    subject: {
      id: source.path.subject.id,
      title: source.path.subject.title,
      stages,
    },
  };
}

export function updateLearningProgress(
  context: LearningContext,
  problemId: string,
  status: Exclude<LearningProgressStatus, 'untouched'>
): LearningContext {
  return {
    ...context,
    subject: {
      ...context.subject,
      stages: context.subject.stages.map((stage) => ({
        ...stage,
        chapters: stage.chapters.map((chapter) => ({
          ...chapter,
          problems: chapter.problems.map((problem) => (
            problem.id === problemId
              ? { ...problem, status }
              : problem
          )),
        })),
      })),
    },
  };
}
