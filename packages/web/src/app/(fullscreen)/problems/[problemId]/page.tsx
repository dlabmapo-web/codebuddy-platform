import ProblemSolveClient from './ProblemSolveClient';

interface PageProps {
  params: Promise<{ problemId: string }>;
  searchParams: Promise<{ sid?: string }>;
}

export default async function ProblemSolvePage({ params, searchParams }: PageProps) {
  const { problemId } = await params;
  const { sid } = await searchParams;
  return <ProblemSolveClient problemId={problemId} submissionId={sid} />;
}
