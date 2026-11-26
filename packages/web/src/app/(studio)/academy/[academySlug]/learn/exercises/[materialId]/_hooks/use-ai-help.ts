'use client';

import type { AiHelpFallback, AiHelpMode, AiHelpReply, AiHelpResponse, AiHelpState } from '@cove/shared';
import * as React from 'react';

import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';

/**
 * What the AI teacher is asked about: a failed submission, or the code in the
 * editor after Run or Test run, which the server first runs on the examples
 * (the campus courses design, §6).
 */
export type AiHelpSubject =
  | { kind: 'submission'; submissionId: string }
  | { kind: 'code'; materialId: string; classId: string; code: string; source: 'RUN' | 'TEST_RUN'; workspaceRevision: number };

/** One subject's identity: a new submission, or other code, is a new question. */
export function aiHelpSubjectKey(subject: AiHelpSubject): string {
  return subject.kind === 'submission' ? `s:${subject.submissionId}` : `c:${subject.materialId}:${subject.source}:${subject.code}`;
}

/**
 * The AI teacher on the student's own wrong code.
 *
 * Nothing is read or asked until the student presses a button, so a wrong
 * result costs no request of its own. An answer is saved on the server: asking
 * again about the same subject shows it, free. One press is one `requestId`:
 * pressing again after a network failure sends the same one, so an answer that
 * was made and lost is served, not bought twice. Asking about another subject
 * starts over.
 */
export function useAiHelp({ academyId, scope }: { academyId: string; /** Another problem starts over. */ scope: string }) {
  const locale = useLocale();
  const [subject, setSubject] = React.useState<AiHelpSubject | null>(null);
  const [replies, setReplies] = React.useState<AiHelpReply[]>([]);
  const [state, setState] = React.useState<AiHelpState | null>(null);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [asking, setAsking] = React.useState<AiHelpMode | null>(null);
  const [failed, setFailed] = React.useState<AiHelpMode | null>(null);
  const [fallback, setFallback] = React.useState<AiHelpFallback | null>(null);
  const [examplesPassed, setExamplesPassed] = React.useState(false);
  const subjectKey = React.useRef<string | null>(null);
  const pending = React.useRef<{ key: string; mode: AiHelpMode; id: string } | null>(null);
  const running = React.useRef(false);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  // Another problem: nothing said about the last one is about this one.
  const [shownScope, setShownScope] = React.useState(scope);
  if (shownScope !== scope) {
    setShownScope(scope);
    setSubject(null); setReplies([]); setState(null); setRemaining(null); setFailed(null); setFallback(null); setExamplesPassed(false);
  }
  // An answer still on its way about the last problem is dropped when it lands.
  React.useEffect(() => {
    subjectKey.current = null;
    pending.current = null;
  }, [scope]);

  const ask = React.useCallback(async (mode: AiHelpMode, next?: AiHelpSubject) => {
    const target = next ?? subject;
    if (running.current || !target) return;
    running.current = true;
    const key = aiHelpSubjectKey(target);
    if (subjectKey.current !== key) {
      // Another question: the last answer described other code.
      subjectKey.current = key;
      setSubject(target);
      setReplies([]);
      setExamplesPassed(false);
    }
    if (pending.current?.key !== key || pending.current.mode !== mode) pending.current = { key, mode, id: crypto.randomUUID() };
    setAsking(mode); setFailed(null); setFallback(null);
    try {
      const request = { academyId, locale, requestId: pending.current.id, mode };
      const answer: AiHelpResponse = target.kind === 'submission'
        ? await orpc.learn.requestAiHelp({ ...request, submissionId: target.submissionId })
        : await orpc.learn.requestAiHelpForCode({
            ...request, materialId: target.materialId, classId: target.classId, code: target.code,
            source: target.source, workspaceRevision: target.workspaceRevision,
          });
      // Answered, one way or another: the next press is a new question, except
      // while the first is still being written somewhere.
      if (answer.fallback !== 'busy') pending.current = null;
      if (!mounted.current || subjectKey.current !== key) return;
      if (answer.reply) setReplies((previous) => withReply(previous, answer.reply!));
      setState(answer.state);
      setRemaining(answer.remainingForProblem);
      setFallback(answer.fallback);
      setExamplesPassed(answer.examplesPassed === true);
    } catch {
      if (mounted.current && subjectKey.current === key) setFailed(mode);
    } finally {
      running.current = false;
      if (mounted.current) setAsking(null);
    }
  }, [academyId, locale, subject]);

  /** The code now passes: an answer about the wrong code is put away. */
  const clear = React.useCallback(() => {
    setSubject(null); setReplies([]); setState(null); setFailed(null); setFallback(null); setExamplesPassed(false);
  }, []);

  const report = React.useCallback(async (replyId: string) => {
    await orpc.learn.reportAiHelp({ academyId, replyId });
    setReplies((previous) => previous.map((item) => item.id === replyId ? { ...item, reported: true } : item));
  }, [academyId]);

  return {
    subject,
    analysis: replies.find((item) => item.level === 1) ?? null,
    simpler: replies.find((item) => item.level === 2) ?? null,
    state, remaining, asking, failed, fallback, examplesPassed,
    ask: (mode: AiHelpMode, next?: AiHelpSubject) => void ask(mode, next),
    clear,
    report,
  };
}
export type AiHelp = ReturnType<typeof useAiHelp>;

function withReply(replies: AiHelpReply[], reply: AiHelpReply): AiHelpReply[] {
  return [...replies.filter((item) => item.level !== reply.level), reply].sort((a, b) => a.level - b.level);
}
