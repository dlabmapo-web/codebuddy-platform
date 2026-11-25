'use client';

import type { AiHelpFallback, AiHelpMode, AiHelpReply, AiHelpState } from '@cove/shared';
import * as React from 'react';

import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';

/**
 * The AI teacher on one failed submission.
 *
 * Nothing is read or asked until the student presses a button, so a failed
 * result costs no request of its own. A submission's analysis is saved: asking
 * again shows it, free. One press is one `requestId`: pressing again after a
 * network failure sends the same one, so an answer that was made and lost is
 * served, not bought twice.
 */
export function useAiHelp({ academyId, submissionId }: { academyId: string; submissionId: string }) {
  const locale = useLocale();
  const [replies, setReplies] = React.useState<AiHelpReply[]>([]);
  const [state, setState] = React.useState<AiHelpState | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [asking, setAsking] = React.useState<AiHelpMode | null>(null);
  const [failed, setFailed] = React.useState<AiHelpMode | null>(null);
  const [fallback, setFallback] = React.useState<AiHelpFallback | null>(null);
  const pending = React.useRef<{ mode: AiHelpMode; id: string } | null>(null);
  const running = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const ask = React.useCallback(async (mode: AiHelpMode) => {
    if (running.current) return;
    running.current = true;
    if (pending.current?.mode !== mode) pending.current = { mode, id: crypto.randomUUID() };
    setAsking(mode); setFailed(null); setFallback(null);
    try {
      const answer = await orpc.learn.requestAiHelp({ academyId, submissionId, locale, requestId: pending.current.id, mode });
      // Answered, one way or another: the next press is a new question, except
      // while the first is still being written somewhere.
      if (answer.fallback !== 'busy') pending.current = null;
      if (!mounted.current) return;
      if (answer.reply) setReplies((previous) => withReply(previous, answer.reply!));
      setState(answer.state);
      setRemaining(answer.remainingForProblem);
      setFallback(answer.fallback);
    } catch {
      if (mounted.current) setFailed(mode);
    } finally {
      running.current = false;
      if (mounted.current) setAsking(null);
    }
  }, [academyId, locale, submissionId]);

  const report = React.useCallback(async (replyId: string) => {
    await orpc.learn.reportAiHelp({ academyId, replyId });
    setReplies((previous) => previous.map((item) => item.id === replyId ? { ...item, reported: true } : item));
  }, [academyId]);

  return {
    analysis: replies.find((item) => item.level === 1) ?? null,
    simpler: replies.find((item) => item.level === 2) ?? null,
    state, remaining, asking, failed, fallback,
    ask: (mode: AiHelpMode) => void ask(mode),
    report,
  };
}

function withReply(replies: AiHelpReply[], reply: AiHelpReply): AiHelpReply[] {
  return [...replies.filter((item) => item.level !== reply.level), reply].sort((a, b) => a.level - b.level);
}
