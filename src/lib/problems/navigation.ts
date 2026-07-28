export type ProblemNavigationCandidate = {
  id: string;
  problem_no: number;
  title: string;
  chapter_id: string;
  chapter_order_no: number;
  problem_order_no: number;
  is_published: boolean;
};

export type ProblemNavigationItem = Omit<
  ProblemNavigationCandidate,
  'is_published'
>;

export type ProblemNavigation = {
  stage_id: string;
  previous: ProblemNavigationItem | null;
  next: ProblemNavigationItem | null;
};

function compareCandidates(
  left: ProblemNavigationCandidate,
  right: ProblemNavigationCandidate,
) {
  return left.chapter_order_no - right.chapter_order_no
    || left.problem_order_no - right.problem_order_no
    || left.problem_no - right.problem_no
    || left.id.localeCompare(right.id);
}

function toNavigationItem(
  candidate: ProblemNavigationCandidate | undefined,
): ProblemNavigationItem | null {
  if (!candidate) return null;
  return {
    id: candidate.id,
    problem_no: candidate.problem_no,
    title: candidate.title,
    chapter_id: candidate.chapter_id,
    chapter_order_no: candidate.chapter_order_no,
    problem_order_no: candidate.problem_order_no,
  };
}

export function resolveProblemNeighbors(
  candidates: ProblemNavigationCandidate[],
  currentProblemId: string,
): Pick<ProblemNavigation, 'previous' | 'next'> {
  const published = candidates
    .filter((candidate) => candidate.is_published)
    .sort(compareCandidates);
  const currentIndex = published.findIndex(
    (candidate) => candidate.id === currentProblemId,
  );

  if (currentIndex < 0) return { previous: null, next: null };

  return {
    previous: toNavigationItem(published[currentIndex - 1]),
    next: toNavigationItem(published[currentIndex + 1]),
  };
}
