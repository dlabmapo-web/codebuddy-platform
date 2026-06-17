interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export default async function FeedbackPage({ params }: PageProps) {
  const { sessionId } = await params;
  return (
    <div>
      <h1 className="text-[20px] font-bold text-ink mb-1">실시간 피드백</h1>
      <p className="text-[14px] text-sub">세션 ID: {sessionId}</p>
    </div>
  );
}
