interface PageProps {
  params: Promise<{ problemId: string }>;
}

export default async function ProblemSolvePage({ params }: PageProps) {
  const { problemId } = await params;
  return (
    <div>
      <h1 className="text-[20px] font-bold text-ink mb-1">문제 풀이</h1>
      <p className="text-[14px] text-sub">문제 ID: {problemId}</p>
    </div>
  );
}
