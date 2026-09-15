import { FeedbackDraftProvider } from '@/lib/monitoring/feedback-draft-provider';

export default function StudentWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <FeedbackDraftProvider>{children}</FeedbackDraftProvider>;
}
