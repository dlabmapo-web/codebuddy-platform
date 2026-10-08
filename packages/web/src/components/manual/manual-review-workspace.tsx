"use client";
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
  useEffect(() => {
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
    <main className="min-h-dvh bg-canvas p-5 text-ink">
      <header className="mb-4 flex flex-wrap gap-4">
        <Link
          className="text-brand"
          href={routes.academyTeachClass(slug, classId)}
        >
          ← Class
        </Link>
        <h1 className="font-bold">{content.data.title} · Teacher review</h1>
      </header>
      {error ? (
        <p role="alert" className="p-3 text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid gap-5 md:grid-cols-[240px_1fr]">
        <aside>
          <ul>
            {query.data.map((s) => (
              <li key={s.userId}>
                <button
                  className="mb-2 w-full rounded border border-border bg-card p-3 text-left"
                  onClick={() => {
                    setUserId(s.userId);
                    setAttemptId("");
                    setEditing(false);
                  }}
                >
                  <strong>{s.learnerName}</strong>
                  <span className="block text-xs">
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
        </aside>
        <section className="min-w-0">
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
          {attempt?.shortAnswerAssessment ? (
            <p role="status">
              {attempt.shortAnswerAssessment.status === "GRADED"
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
                  )}
            </p>
          ) : null}
          {attempt ? (
            <>
              <label>
                {mt("submission")}
                <select
                  aria-label={mt("submission")}
                  className="ml-3 border border-border bg-card p-2"
                  value={attempt.id}
                  onChange={(e) => setAttemptId(e.target.value)}
                >
                  {learner!.attempts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {new Date(a.createdAt).toLocaleString()} ·{" "}
                      {a.reviews.length
                        ? mt("reviewed")
                        : mt("awaiting_review")}
                    </option>
                  ))}
                </select>
              </label>
              <p className="my-3 text-xs">
                Immutable submitted work · Read-only ·{" "}
                {attempt.includeInScore
                  ? mt("included_in_score")
                  : mt("excluded_from_score")}
              </p>
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
                    <span>{session?.state}</span>
                  </div>
                  {session ? (
                    <div className="grid min-h-[300px] gap-3 lg:grid-cols-2">
                      <GuiViewer session={session} onError={onError} />
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
              ) : (
                <pre className="my-3 whitespace-pre-wrap rounded border border-border bg-card p-4">
                  {attempt.answer}
                </pre>
              )}
              <form
                className="my-4 grid gap-3 rounded border border-border bg-card p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void publish();
                }}
              >
                <label>
                  {mt("score")}
                  <input
                    aria-label={mt("score")}
                    type="number"
                    step="0.01"
                    min={0}
                    max={attempt.maximumHundredths / 100}
                    className="ml-3 border border-border bg-card p-2"
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                  />{" "}
                  / {attempt.maximumHundredths / 100}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={completed}
                    onChange={(e) => setCompleted(e.target.checked)}
                  />{" "}
                  Completed
                </label>
                <label>
                  {mt("feedback")}
                  <textarea
                    aria-label={mt("feedback")}
                    className="block w-full border border-border bg-card p-2"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </label>
                <button
                  disabled={busy}
                  className="rounded bg-brand p-2 text-white"
                >
                  {mt("publish_review")}
                </button>
              </form>
              <details>
                <summary>Review history ({attempt.reviews.length})</summary>
                {attempt.reviews.map((r) => (
                  <article key={r.id} className="my-2 border border-border p-3">
                    <p>
                      {mt("version", { version: r.version })} ·{" "}
                      {r.scoreHundredths / 100} ·{" "}
                      {r.completed ? mt("completed") : mt("needs_revision")}
                    </p>
                    <p className="whitespace-pre-wrap">{r.feedback}</p>
                  </article>
                ))}
              </details>
            </>
          ) : (
            <>
              <p>{mt("no_submission_from_this_learner")}</p>
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
            <details className="mt-5 border border-border bg-card p-4">
              <summary>
                {mt("current_learner_draft_separate_from_submitted_work")}
              </summary>
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
