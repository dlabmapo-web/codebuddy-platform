'use client';

import type { AiHelpFallback, AiHelpHistoryItem, AiHelpMode, AiHelpReply, AiHelpResponse, AiHelpSource, AiHelpState } from '@cove/shared';
import * as React from 'react';

import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';

/**
 * What the AI teacher is asked about: a failed submission, or the code in the
 * editor after Run or Test run, which the server first runs on the examples
 * (the campus courses design, §6).
 */
export type AiHelpSubject =
  /** `code` is what was submitted, kept here to show the line an answer names; it is never sent. */
  | { kind: 'submission'; submissionId: string; code?: string | null }
  | { kind: 'code'; materialId: string; classId: string; code: string; source: 'RUN' | 'TEST_RUN'; workspaceRevision: number };

/** One subject's identity: a new submission, or other code, is a new question. */
export function aiHelpSubjectKey(subject: AiHelpSubject): string {
  return subject.kind === 'submission' ? `s:${subject.submissionId}` : `c:${subject.materialId}:${subject.source}:${subject.code}`;
}

/** One answer in the thread, with its simpler version once asked for. */
export type AiAnswer = {
  /** The submission or check it answered, or, asked in this tab, the question's key. */
  key: string;
  source: AiHelpSource;
  /** The code it was about, while this tab knows it. */
  code: string | null;
  /** The line it names, as that code read, from the server. */
  quoted: string | null;
  analysis: AiHelpReply;
  simpler: AiHelpReply | null;
};

/**
 * Answers given in this tab, per student and problem. The workspace a
 * student returns to may come from a cache older than them, so they are
 * added back to the server's list; a reload reads them all from the server.
 */
const kept = new Map<string, AiAnswer[]>();

/** The server's saved answers, oldest first, as the thread shows them. */
function fromHistory(items: readonly AiHelpHistoryItem[]): AiAnswer[] {
  const answers = new Map<string, AiAnswer>();
  for (const { source, subjectId, quoted, ...reply } of items) {
    const known = answers.get(subjectId);
    if (reply.level === 1) answers.set(subjectId, { key: subjectId, source, code: null, quoted, analysis: reply, simpler: known?.simpler ?? null });
    // A simpler version whose analysis fell outside the list has nothing to sit under.
    else if (known) known.simpler = reply;
  }
  return [...answers.values()];
}

/** The server's list with this tab's answers it has not seen yet, in the order they were written. */
function merged(saved: AiAnswer[], here: readonly AiAnswer[]): AiAnswer[] {
  const all = [...saved];
  for (const answer of here) {
    const index = all.findIndex((item) => item.analysis.id === answer.analysis.id);
    if (index === -1) all.push(answer);
    else all[index] = { ...all[index]!, code: answer.code ?? all[index]!.code, simpler: all[index]!.simpler ?? answer.simpler };
  }
  return all.sort((a, b) => a.analysis.createdAt.localeCompare(b.analysis.createdAt));
}

/**
 * The AI teacher on the student's own wrong code.
 *
 * Nothing is read or asked until the student presses a button, so a wrong
 * result costs no request of its own. Every answer stays in the thread, newest
 * last, and a reload brings them back from the server. Asking again about the
 * same subject shows its saved answer, free. One press is one `requestId`:
 * pressing again after a network failure sends the same one, so an answer that
 * was made and lost is served, not bought twice.
 */
export function useAiHelp({ academyId, userId, scope, history }: {
  academyId: string;
  userId: string;
  /** Another problem starts another thread. */
  scope: string;
  /** The saved answers the workspace opened with. */
  history?: readonly AiHelpHistoryItem[];
}) {
  const locale = useLocale();
  const threadKey = `${userId}:${scope}`;
  const [subject, setSubject] = React.useState<AiHelpSubject | null>(null);
  const [answers, setAnswers] = React.useState<AiAnswer[]>(() => merged(fromHistory(history ?? []), kept.get(threadKey) ?? []));
  // The thread as the last change left it, so an answer joins the latest
  // thread even while the screen still shows the one before.
  const answersRef = React.useRef(answers);
  React.useEffect(() => { answersRef.current = answers; }, [answers]);
  const commit = React.useCallback((next: AiAnswer[]) => {
    answersRef.current = next;
    kept.set(threadKey, next);
    setAnswers(next);
  }, [threadKey]);
  /** The answer about the current question, which "more simply" asks about. */
  const [live, setLive] = React.useState<string | null>(null);
  /** The answer that just arrived, each time one does, for the page to take the reader to it. */
  const [fresh, setFresh] = React.useState<{ id: string; seq: number } | null>(null);
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
  // Another problem: its own thread, and nothing asked about the last one.
  const [shownThread, setShownThread] = React.useState(threadKey);
  if (shownThread !== threadKey) {
    setShownThread(threadKey);
    setAnswers(merged(fromHistory(history ?? []), kept.get(threadKey) ?? []));
    setSubject(null); setLive(null); setFresh(null); setState(null); setRemaining(null); setFailed(null); setFallback(null); setExamplesPassed(false);
  }
  // An answer still on its way about the last problem is dropped when it lands.
  React.useEffect(() => {
    subjectKey.current = null;
    pending.current = null;
  }, [threadKey]);

  const ask = React.useCallback(async (mode: AiHelpMode, next?: AiHelpSubject) => {
    const target = next ?? subject;
    if (running.current || !target) return;
    running.current = true;
    const key = aiHelpSubjectKey(target);
    if (subjectKey.current !== key) {
      // Another question: earlier answers stay, but none of them is about it.
      subjectKey.current = key;
      setSubject(target);
      setLive(null);
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
      const reply = answer.reply;
      if (reply) {
        const next = withReply(answersRef.current, reply, {
          key, source: target.kind === 'submission' ? 'SUBMIT' : target.source, code: target.code ?? null,
        }, live);
        commit(next.answers);
        setLive(next.key);
        setFresh((current) => ({ id: reply.id, seq: (current?.seq ?? 0) + 1 }));
      }
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
  }, [academyId, commit, live, locale, subject]);

  /** The code now passes: the question is over. Its answers stay to read. */
  const clear = React.useCallback(() => {
    subjectKey.current = null;
    setSubject(null); setLive(null); setState(null); setFailed(null); setFallback(null); setExamplesPassed(false);
  }, []);

  const report = React.useCallback(async (replyId: string) => {
    await orpc.learn.reportAiHelp({ academyId, replyId });
    const mark = (reply: AiHelpReply | null) => reply && reply.id === replyId ? { ...reply, reported: true } : reply;
    commit(answersRef.current.map((item) => ({ ...item, analysis: mark(item.analysis)!, simpler: mark(item.simpler) })));
  }, [academyId, commit]);

  return {
    subject,
    answers,
    /** The answer about the current question, if it has one. */
    live: answers.find((item) => item.key === live) ?? null,
    fresh,
    state, remaining, asking, failed, fallback, examplesPassed,
    ask: (mode: AiHelpMode, next?: AiHelpSubject) => void ask(mode, next),
    clear,
    report,
  };
}
export type AiHelp = ReturnType<typeof useAiHelp>;

/**
 * The thread with one more reply, and the key of the answer that holds it.
 * An analysis served again (asked about the same subject after a reload) is
 * the card already there; a simpler version joins the answer it simplifies,
 * the current question's.
 */
export function withReply(
  answers: readonly AiAnswer[], reply: AiHelpReply, about: { key: string; source: AiHelpSource; code: string | null }, live: string | null,
): { answers: AiAnswer[]; key: string | null } {
  const known = answers.findIndex((item) => item.analysis.id === reply.id || item.simpler?.id === reply.id);
  if (known !== -1) {
    const item = answers[known]!;
    const updated = { ...item, code: item.code ?? about.code, analysis: item.analysis.id === reply.id ? reply : item.analysis, simpler: item.simpler?.id === reply.id ? reply : item.simpler };
    return { answers: answers.map((entry, index) => index === known ? updated : entry), key: item.key };
  }
  if (reply.level === 1) {
    return { answers: [...answers, { key: about.key, source: about.source, code: about.code, quoted: null, analysis: reply, simpler: null }], key: about.key };
  }
  let owner = answers.findIndex((item) => item.key === live);
  for (let index = answers.length - 1; owner === -1 && index >= 0; index -= 1) if (answers[index]!.key === about.key) owner = index;
  if (owner === -1) return { answers: [...answers], key: live };
  return { answers: answers.map((entry, index) => index === owner ? { ...entry, simpler: reply } : entry), key: answers[owner]!.key };
}
