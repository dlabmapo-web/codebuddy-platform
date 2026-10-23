"use client";
import { ArrowLeft, Search, Users, FileCheck2, LockKeyhole, History, Clock3, Trophy, UserRound } from 'lucide-react';
import { ManualStaffActions } from './manual-staff-actions';
import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { ReviewGradingPanel, AssessmentDrawer, AssessmentStatus, assessmentAction } from './assessment-ui';
import { ChoiceAttempt } from "./choice-options";
import { useManualTranslation } from "./use-manual-translation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { effectiveManualResult, type ManualSession } from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { routes } from "@/lib/routes";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { CodeEditor } from "@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/code-editor";
import { GuiViewer } from "./gui-viewer";
import { executionTranslationKey } from './execution-state';
export function ManualReviewWorkspace({
  academyId,
  classId,
  materialId,
}: {
  academyId: string;
  classId: string;
  materialId: string;
}) {
  const { t: mt } = useManualTranslation();
  const slug = useAcademySlug(),
    target = { academyId, classId, materialId };
  const query = useQuery({
    queryKey: ["manual-roster", academyId, classId, materialId],
    queryFn: () => manualApi.roster(target),
    retry: false,
  });
  const content = useQuery({
    queryKey: ["manual", academyId, materialId, true],
    queryFn: () => manualApi.read({ academyId, materialId, preview: true }),
    retry: false,
  });
  const [userId, setUserId] = useState(""),
    [attemptId, setAttemptId] = useState(""),
    [file, setFile] = useState("main.py"),
    [score, setScore] = useState(0),
    [completed, setCompleted] = useState(false),
    [feedback, setFeedback] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [session, setSession] = useState<ManualSession | null>(null),
    [editing, setEditing] = useState(false),
    [draftFiles, setDraftFiles] = useState<Record<string, string>>({}),
    [draftAnswer, setDraftAnswer] = useState(""),
    [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [rosterOpen, setRosterOpen] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const active = useRef<string | null>(null);
  const connectionFailed = useRef(false);
  const selectedUser = userId || query.data?.[0]?.userId;
  const work = useQuery({
    queryKey: ["manual-learner", academyId, classId, materialId, selectedUser],
    queryFn: () => manualApi.roster({ ...target, userId: selectedUser! }),
    refetchInterval: (query) =>
      query.state.data?.some((s) =>
        s.attempts.some((a) =>
          ["PENDING", "EVALUATING"].includes(
            a.shortAnswerAssessment?.status ?? "",
          ),
        ),
      )
        ? 3000
        : false,
    enabled: Boolean(selectedUser),
    retry: false,
  });
  const learner = work.data?.[0],
    attempt =
      learner?.attempts.find((a) => a.id === attemptId) ?? learner?.attempts[0],
    review = attempt?.reviews[0];
  const effective = effectiveManualResult(attempt);
  const newestAttempt = learner?.attempts[0];
  const newestResult = effectiveManualResult(newestAttempt);
  const reviewDirty = Boolean(attempt && (score !== (effective?.scoreHundredths ?? 0) / 100 || completed !== (effective?.completed ?? false) || feedback !== (review?.feedback ?? "")));
  function allowReviewSwitch() { return !busy && (!reviewDirty || window.confirm(mt('ui.discard_review'))); }
  useEffect(() => {
    if (!reviewDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [reviewDirty]);
  useEffect(() => {
    // Resets the review form to the newly selected attempt's saved result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScore((effective?.scoreHundredths ?? 0) / 100);
    setCompleted(effective?.completed ?? false);
    setFeedback(review?.feedback ?? "");
    setFile(Object.keys(attempt?.files ?? {})[0] ?? "main.py");
    setEditing(false);
  }, [
    attempt?.id,
    attempt?.reviewVersion,
    attempt?.shortAnswerAssessment?.status,
  ]);
  useEffect(() => {
    if (active.current) void manualApi.stop(active.current).catch(() => {});
    active.current = null;
    // Changing learner or attempt ends the previous rerun session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(null);
    setEditing(false);
  }, [learner?.userId, attempt?.id]);
  useEffect(
    () => () => {
      if (active.current) void manualApi.stop(active.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (
      !session ||
      !["QUEUED", "RUNNING", "STARTING", "WAITING_INPUT"].includes(
        session.state,
      )
    )
      return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void (
        session.watchId
          ? manualApi.watchStatus(session.watchId)
          : manualApi.status(session.id)
      )
        .then((next) => {
          if (!cancelled) {
            setSession(next);
            if (connectionFailed.current) {
              connectionFailed.current = false;
              setError("");
            }
          }
        })
        .catch((e) => {
          if (!cancelled) {
            connectionFailed.current = true;
            setError(e.message);
            if ([401, 403, 404].includes(e.status))
              setSession((old) =>
                old ? { ...old, state: "DISCONNECTED" } : null,
              );
          }
        })
        .finally(() => {
          inFlight = false;
        });
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [session?.id, session?.state]);
  const onError = useCallback((message: string) => setError(message), []);
  async function publish() {
    if (!attempt) return;
    setBusy(true);
    setError("");
    try {
      await manualApi.review({
        ...target,
        submissionId: attempt.id,
        expectedVersion: attempt.reviewVersion,
        scoreHundredths: Math.round(score * 100),
        completed,
        feedback,
      });
      await Promise.all([query.refetch(), work.refetch()]);
      setPublishedId(attempt.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("review_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    if (!attempt) return;
    setBusy(true);
    setError("");
    try {
      if (active.current) await manualApi.stop(active.current);
      const next = await manualApi.start({
        ...target,
        files: {},
        answer: "",
        contentRevision: content.data!.config.revision,
        revision: 0,
        preview: true,
        submissionId: attempt.id,
      });
      active.current = next.id;
      setSession(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("run_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (session?.readOnly) {
      setSession(null);
      return;
    }
    if (active.current) {
      await manualApi.stop(active.current);
      active.current = null;
      setSession((s) => (s ? { ...s, state: "STOPPED" } : null));
    }
  }
  async function saveDraft() {
    if (!learner?.draft) return;
    setBusy(true);
    setError("");
    try {
      await manualApi.teacherDraft({
        ...target,
        userId: learner.userId,
        files: draftFiles,
        answer: draftAnswer,
        revision: learner.draft.revision,
      });
      setEditing(false);
      await Promise.all([query.refetch(), work.refetch()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("draft_changed"));
    } finally {
      setBusy(false);
    }
  }
  if (query.isError || content.isError || work.isError)
    return (
      <main className="p-5" role="alert">
        {mt("review_is_not_available")}
      </main>
    );
  if (!query.data || !content.data || (selectedUser && !work.data))
    return <main className="p-5">{mt("loading_review")}</main>;
  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-5 py-4 sm:px-7">
        <Link
          className={assessmentAction}
          onClick={e => { if (!allowReviewSwitch()) e.preventDefault(); }}
          href={routes.academyTeachClass(slug, classId)}
        >
          <ArrowLeft aria-hidden className="size-4" />{mt("ui.back_class")}
        </Link>
        <div className="order-first min-w-0 w-full sm:order-none sm:w-auto sm:flex-1"><p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-brand"><FileCheck2 aria-hidden className="size-3.5" />{mt("teacher_review")}</p><h1 className="text-lg font-bold tracking-tight sm:text-xl">{content.data.title}</h1></div>
        <ManualStaffActions academyId={academyId} data={content.data} classId={classId} reviewing allowNavigate={allowReviewSwitch} />
      </header>
      {error ? (
        <p role="alert" className="m-5 rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-3 sm:px-8">
        <AssessmentDrawer title={mt('ui.learners')} open={rosterOpen} onOpenChange={setRosterOpen} trigger={<button type="button" className={assessmentAction}><Users aria-hidden className="size-4 text-brand" />{learner?.learnerName || mt('ui.learners')}<span className="rounded bg-brand-soft px-2 py-0.5 text-xs text-brand">{query.data.length}</span></button>}>
          <div>
          <label className="relative mb-3 block"><Search aria-hidden className="absolute left-3 top-3 size-4 text-sub" /><input aria-label={mt('ui.search_learners')} placeholder={mt('ui.search_learners')} value={search} onChange={e => setSearch(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-canvas py-2 pr-3 pl-9 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" /></label>
          <ul className="grid gap-2">
            {query.data.filter(s => s.learnerName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((s) => (
              <li key={s.userId}>
                <button
                  aria-pressed={selectedUser === s.userId}
                  disabled={busy}
                  className="w-full rounded-xl border border-transparent p-3 text-left transition-colors hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand aria-pressed:border-brand/25 aria-pressed:bg-brand-soft aria-pressed:text-brand disabled:opacity-50"
                  onClick={() => {
                    if (!allowReviewSwitch()) return;
                    setUserId(s.userId);
                    setAttemptId("");
                    setEditing(false);
                    setRosterOpen(false);
                  }}
                >
                  <strong>{s.learnerName}</strong>
                  <span className="mt-1 block text-xs text-sub">
                    {!s.attempts.length
                      ? mt("not_submitted")
                      : effectiveManualResult(s.attempts[0])
                        ? `${effectiveManualResult(s.attempts[0])!.scoreHundredths / 100} / ${s.attempts[0].maximumHundredths / 100}`
                        : mt("awaiting_review")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!query.data.some(s => s.learnerName.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) ? <p role="status" className="p-3 text-sm text-sub">{mt("ui.no_learners")}</p> : null}
</div>

        </AssessmentDrawer>
        <dl className="ml-auto flex flex-wrap gap-5 text-xs sm:gap-8">
          <div><dt className="mb-1 flex items-center gap-1.5 text-sub"><History aria-hidden className="size-3.5" />{mt('ui.attempt_count')}</dt><dd className="font-semibold tabular-nums">{learner?.attempts.length ?? 0}</dd></div>
          <div><dt className="mb-1 flex items-center gap-1.5 text-sub"><Clock3 aria-hidden className="size-3.5" />{mt('last_submission')}</dt><dd className="font-semibold">{newestAttempt ? new Date(newestAttempt.createdAt).toLocaleString() : '—'}</dd></div>
          <div><dt className="mb-1 flex items-center gap-1.5 text-sub"><Trophy aria-hidden className="size-3.5 text-warning" />{mt('ui.latest_score')}</dt><dd className="font-semibold tabular-nums text-brand">{newestResult ? `${newestResult.scoreHundredths / 100} / ${newestAttempt!.maximumHundredths / 100}` : '—'}</dd></div>
        </dl>
      </div>
      <div className="p-4 sm:p-6 md:px-8">
        <section className="min-w-0 space-y-4">
          <p className="text-sm leading-relaxed text-sub">{mt("ui.review_description")}</p>
          {content.data.type === "TURTLE_EXERCISE" && learner ? (
            <button
              className="mb-3 text-brand"
              onClick={() => {
                void (async () => {
                  if (active.current) await manualApi.stop(active.current);
                  active.current = null;
                  return manualApi.watch({ ...target, userId: learner.userId });
                })()
                  .then(setSession)
                  .catch((e) => setError(e.message));
              }}
            >
              {mt("view_learner_drawing_read_only")}
            </button>
          ) : null}
          {attempt?.multipleChoiceAssessment ? <AssessmentStatus label={mt(attempt.multipleChoiceAssessment.completed?"correct":"incorrect")} completed={attempt.multipleChoiceAssessment.completed} /> : null}
          {attempt?.shortAnswerAssessment ? (
            <AssessmentStatus completed={effective?.completed} label={attempt.shortAnswerAssessment.status === "GRADED"
                ? mt(
                    attempt.shortAnswerAssessment.completed
                      ? "correct"
                      : "incorrect",
                  )
                : mt(
                    attempt.shortAnswerAssessment.status === "ERROR"
                      ? "evaluation_unavailable"
                      : attempt.shortAnswerAssessment.status === "MANUAL"
                        ? "awaiting_review"
                        : "evaluating",
                  )} />
          ) : null}
          {attempt ? (
            <>
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 rounded-lg border border-border bg-card p-5 sm:p-6">
              <h2 className="mb-4 flex items-center gap-2 text-base font-bold"><UserRound aria-hidden className="size-4 text-brand" />{mt('ui.review_answer')} <span className="ml-2 font-normal text-sub">{learner?.learnerName}</span></h2>
              <label className="grid gap-2 text-xs font-semibold text-sub">
                {mt("submission")}
                <select
                  aria-label={mt("submission")}
                  className="min-h-10 w-full min-w-0 rounded-lg border border-border bg-canvas p-2 text-sm font-normal text-ink outline-none focus:border-brand"
                  value={attempt.id}
                  onChange={(e) => { if (allowReviewSwitch()) setAttemptId(e.target.value); }}
                >
                  {learner!.attempts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.createdAt).toLocaleString()} ·{" "}
                      {a.reviews.length
                        ? mt("reviewed")
                        : effectiveManualResult(a)
                          ? mt(effectiveManualResult(a)!.completed ? "correct" : "incorrect")
                        : mt("awaiting_review")}
                    </option>
                  ))}
                </select>
              </label>
              <p className="my-4 flex items-center gap-1.5 text-xs text-sub">
                <LockKeyhole aria-hidden className="size-3.5 shrink-0" />{mt("immutable_submitted_work_read_only")}{" "}
                {attempt.includeInScore
                  ? mt("included_in_score")
                  : mt("excluded_from_score")}
              </p>
              <details open className="mb-5 rounded-md border border-border bg-canvas/50 p-4">
                <summary className="cursor-pointer text-sm font-semibold">{mt('ui.question')}</summary>
                <div className="mt-4 space-y-3 text-sm leading-7">
                  <p className="font-semibold">{content.data.config.shortAnswer?.question ?? content.data.config.multipleChoice?.question}</p>
                  <RichTextFrame content={content.data.config.description} title={mt('activity_instructions')} />
                  {content.data.config.modelAnswer ? <><h3 className="font-semibold text-sub">{mt('model_answer_private')}</h3><p className="whitespace-pre-wrap">{content.data.config.modelAnswer}</p></> : null}
                </div>
              </details>
              {content.data.type === "TURTLE_EXERCISE" ? (
                <>
                  <div className="flex gap-3">
                    {Object.keys(attempt.files).map((name) => (
                      <button key={name} onClick={() => setFile(name)}>
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="h-72">
                    <CodeEditor
                      code={attempt.files[file] ?? ""}
                      fontSize={14}
                      readOnly
                      onChange={() => {}}
                    />
                  </div>
                  <div className="my-3 flex gap-4">
                    <button
                      className="rounded bg-brand px-4 py-2 text-white"
                      disabled={
                        busy ||
                        Boolean(
                          session &&
                            [
                              "QUEUED",
                              "STARTING",
                              "RUNNING",
                              "WAITING_INPUT",
                            ].includes(session.state),
                        )
                      }
                      onClick={() => void run()}
                    >
                      {mt("run_submitted_code")}
                    </button>
                    <button onClick={() => void stop()}>{mt("stop")}</button>
                    <span>{session ? mt(executionTranslationKey(session.state)) : ''}</span>
                  </div>
                  {session ? (
                    <div className="grid min-h-[300px] gap-3 lg:grid-cols-2">
                      <GuiViewer key={session.id} session={session} onError={onError} onStop={session.readOnly ? undefined : () => void stop().catch(error => onError(error.message))} />
                      <section className="min-w-0 bg-editor-bg p-3 text-white">
                        <pre
                          className="max-h-72 overflow-auto whitespace-pre-wrap"
                          data-testid="turtle-terminal"
                        >
                          {session.output}
                        </pre>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void manualApi
                              .input(session.id, input)
                              .then(() => setInput(""))
                              .catch((e) => setError(e.message));
                          }}
                        >
                          <input
                            aria-label={mt("terminal_input")}
                            className="w-full bg-transparent"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                          />
                        </form>
                      </section>
                    </div>
                  ) : null}
                </>
              ) : attempt.multipleChoiceAssessment ? <ChoiceAttempt attempt={attempt} scope={{academyId,materialId,classId,preview:true}}/> : (
                <div className="my-3 min-h-48 break-words whitespace-pre-wrap rounded-xl border border-border bg-canvas/50 p-5 text-base leading-8">
                  {attempt.answer || mt("ui.empty_answer")}
                </div>
              )}
              </div>
              <aside className="min-w-0 space-y-4 xl:sticky xl:top-5">
                <ReviewGradingPanel score={score} maximum={attempt.maximumHundredths / 100} completed={completed} feedback={feedback} busy={busy}
                  saved={Boolean(review || publishedId === attempt.id)} dirty={reviewDirty} onScore={setScore} onCompleted={setCompleted} onFeedback={setFeedback} onSubmit={() => void publish()} />
              <details className="rounded-xl border border-border bg-card p-4">
                <summary className="cursor-pointer text-sm font-semibold">{mt("ui.review_history", { count: attempt.reviews.length })}</summary>
                {attempt.reviews.map((r) => (
                  <article key={r.id} className="mt-3 border-t border-border pt-3 text-sm leading-6">
                    <p>
                      {mt("version", { version: r.version })} ·{" "}
                      {r.scoreHundredths / 100} ·{" "}
                      {r.completed ? mt("completed") : mt("needs_revision")}
                    </p>
                    <p className="whitespace-pre-wrap">{r.feedback}</p>
                  </article>
                ))}
              </details>
              </aside>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-sub"><FileCheck2 aria-hidden className="mx-auto mb-3 size-8 text-sub/50" />{mt("no_submission_from_this_learner")}</div>
              {session?.readOnly ? (
                <div className="min-h-[300px]">
                  <GuiViewer session={session} onError={onError} />
                  <button onClick={() => setSession(null)}>
                    {mt("close_learner_drawing")}
                  </button>
                </div>
              ) : null}
            </>
          )}
          {learner?.draft ? (
            <details className="rounded-2xl border border-border bg-card p-5">
              <summary>
                {mt("current_learner_draft_separate_from_submitted_work")}
              </summary>
              <p className="mt-3 text-sm text-sub">{mt("ui.draft_help")}</p>
              <button
                className="my-3 text-brand"
                onClick={() => {
                  setDraftFiles(learner.draft!.files);
                  setDraftAnswer(learner.draft!.answer);
                  setEditing(true);
                }}
              >
                {mt("edit_current_draft")}
              </button>
              {editing ? (
                <>
                  <label>
                    {mt("draft_answer")}
                    <textarea
                      aria-label={mt("draft_answer")}
                      value={draftAnswer}
                      onChange={(e) => setDraftAnswer(e.target.value)}
                    />
                  </label>
                  {Object.entries(draftFiles).map(([name, code]) => (
                    <label key={name}>
                      {name}
                      <textarea
                        aria-label={`Draft ${name}`}
                        className="block w-full border border-border bg-card p-2 font-mono"
                        value={code}
                        onChange={(e) =>
                          setDraftFiles({
                            ...draftFiles,
                            [name]: e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                  <button disabled={busy} onClick={() => void saveDraft()}>
                    {mt("save_learner_draft")}
                  </button>
                  <button onClick={() => setEditing(false)}>
                    {mt("cancel_edit")}
                  </button>
                </>
              ) : (
                <pre className="overflow-auto whitespace-pre-wrap">
                  {content.data.type === "WRITTEN_RESPONSE"
                    ? learner.draft.answer
                    : Object.entries(learner.draft.files)
                        .map(([name, code]) => `${name}\n${code}`)
                        .join("\n")}
                </pre>
              )}
            </details>
          ) : null}
        </section>
      </div>
    </main>
  );
}
