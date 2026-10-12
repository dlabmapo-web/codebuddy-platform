"use client";
import {VideoResourceLinks} from "@/components/video/video-resource-links";
import {
  ChoiceOptions,
  ChoiceAttempt,
  ChoiceRich,
  ChoiceHistoryExplanation,
} from "./choice-options";
import { useManualTranslation } from "./use-manual-translation";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { effectiveManualResult, type ManualSession } from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { routes } from "@/lib/routes";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { CodeEditor } from "@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/code-editor";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { GuiViewer } from "./gui-viewer";
export function ManualWorkspace({
  academyId,
  materialId,
  classId,
  preview = false,
}: {
  academyId: string;
  materialId: string;
  classId?: string;
  preview?: boolean;
}) {
  const { t: mt } = useManualTranslation();
  const slug = useAcademySlug();
  const [deliveryClass, setDeliveryClass] = useState(classId);
  const target = { academyId, materialId };
  const query = useQuery({
    queryKey: ["manual", academyId, materialId, preview, deliveryClass],
    queryFn: () =>
      manualApi.read({ ...target, preview, classId: deliveryClass }),
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.config.shortAnswer ||
      query.state.data?.config.multipleChoice
        ? 3000
        : false,
  });
  const data = query.data;
  const short = data?.config.shortAnswer;
  const choice = data?.config.multipleChoice;
  const explicit = Boolean(short || choice);
  const [choiceSelected, setChoiceSelected] = useState<string[]>([]);
  const [loadedChoice, setLoadedChoice] = useState<typeof choice>(null);
  const [loadedInstructions, setLoadedInstructions] = useState("");
  const [files, setFiles] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState("main.py");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [session, setSession] = useState<ManualSession | null>(null);
  const [input, setInput] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [executionTab, setExecutionTab] = useState<"drawing" | "terminal">(
    "drawing",
  );
  const [dirty, setDirty] = useState(false);
  const pendingSubmit = useRef<{ key: string; content: string } | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const draftRevision = useRef(0);
  const loaded = useRef(false);
  const loadedContentRevision = useRef<number | undefined>(undefined);
  const active = useRef<string | null>(null);
  const connectionFailed = useRef(false);
  const latest = useRef({ files, answer });
  latest.current = { files, answer };
  const showError = useCallback((text: string) => setError(text), []);
  useEffect(() => {
    if (!data || loaded.current) return;
    loaded.current = true;
    loadedContentRevision.current = data.config.revision;
    setLoadedChoice(data.config.multipleChoice);
    setLoadedInstructions(data.config.description);
    setFiles(data.draft?.files ?? data.config.files);
    setAnswer(data.config.shortAnswer ? "" : (data.draft?.answer ?? ""));
    draftRevision.current = data.draft?.revision ?? 0;
    setSelected(data.config.entryPoint);
  }, [data]);
  useEffect(() => {
    if (!explicit || !dirty || preview) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const guard = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]");
      if (
        !link ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        link.getAttribute("target") === "_blank"
      )
        return;
      if (!window.confirm(mt("discard_answer"))) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const url = window.location.href;
    const state = window.history.state;
    const backGuard = (event: PopStateEvent) => {
      if (
        window.location.href !== url &&
        !window.confirm(mt("discard_answer"))
      ) {
        event.stopImmediatePropagation();
        window.history.pushState(state, "", url);
      }
    };
    window.addEventListener("popstate", backGuard, true);
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", guard, true);
    return () => {
      window.removeEventListener("popstate", backGuard, true);
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", guard, true);
    };
  }, [explicit, dirty, preview, mt]);
  useEffect(
    () => () => {
      if (active.current) void manualApi.stop(active.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (
      !session ||
      !["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT"].includes(
        session.state,
      )
    )
      return;
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void manualApi
        .status(session.id)
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
  const running =
    session &&
    ["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT"].includes(session.state);
  async function save() {
    if (preview || explicit) return;
    if (saving.current) return saving.current;
    const snapshot = latest.current;
    const operation = (async () => {
      setError("");
      try {
        const result = await manualApi.draft({
          ...target,
          ...latest.current,
          revision: draftRevision.current,
        });
        draftRevision.current = result.revision;
        if (
          latest.current.files === snapshot.files &&
          latest.current.answer === snapshot.answer
        )
          setDirty(false);
        setSaved(mt("saved"));
      } catch (e) {
        setError(e instanceof Error ? e.message : mt("could_not_save"));
      } finally {
        saving.current = null;
      }
    })();
    saving.current = operation;
    return operation;
  }
  useEffect(() => {
    if (preview || explicit || !dirty) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [files, answer, dirty, preview, explicit]);
  const selectedClass =
    deliveryClass ??
    (data?.classes.length === 1 ? data.classes[0].classId : undefined);
  async function run(solution = false) {
    setBusy(true);
    setError("");
    try {
      if (active.current) await manualApi.stop(active.current);
      const next = await manualApi.start({
        ...target,
        ...latest.current,
        contentRevision: data!.config.revision,
        revision: draftRevision.current,
        preview,
        solution,
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
    if (!active.current) return;
    setBusy(true);
    try {
      await manualApi.stop(active.current);
      active.current = null;
      setSession((s) => (s ? { ...s, state: "STOPPED" } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("stop_failed"));
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!selectedClass) {
      setError(mt("open_this_activity_from_your_class_to_submit"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const content = JSON.stringify({
        ...latest.current,
        classId: selectedClass,
        selectedOptionIds: choiceSelected,
        displayOrder: loadedChoice?.options.map((o) => o.id),
        revision: explicit
          ? loadedContentRevision.current
          : data!.config.revision,
      });
      if (pendingSubmit.current?.content !== content)
        pendingSubmit.current = { content, key: crypto.randomUUID() };
      await manualApi.submit({
        ...target,
        ...latest.current,
        ...(choice
          ? {
              selectedOptionIds: choiceSelected,
              displayOrder: loadedChoice!.options.map((o) => o.id),
            }
          : {}),
        contentRevision: explicit
          ? loadedContentRevision.current!
          : data!.config.revision,
        revision: draftRevision.current,
        classId: selectedClass,
        requestKey: pendingSubmit.current.key,
      });
      pendingSubmit.current = null;
      if (explicit) {
        setChoiceSelected([]);
        setDirty(false);
        setAnswer("");
      }
      await query.refetch();
      setSaved(
        mt(explicit ? "submitted" : "submitted_awaiting_teacher_review"),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : mt("submit_failed"));
    } finally {
      setBusy(false);
    }
  }
  const path = (m: { type: string; materialId: string }) =>
    m.type === "PDF_DOCUMENT"
      ? routes.academyLearnPdf(slug, m.materialId, { classId: selectedClass })
      : m.type === "PROGRAMMING_EXERCISE"
        ? routes.academyLearnExercise(slug, m.materialId, {
            classId: selectedClass,
          })
        : routes.academyLearnAssessment(slug, m.materialId, m.type, {
            classId: selectedClass,
          });
  const latestAttempt = data?.attempts.find((a) => a.classId === selectedClass);
  const effective = effectiveManualResult(latestAttempt);
  const explanation = useQuery({
    queryKey: [
      "short-answer-explanation",
      latestAttempt?.id,
      latestAttempt?.reviewVersion,
      latestAttempt?.shortAnswerAssessment?.status,
    ],
    queryFn: () =>
      manualApi.explanation({
        ...target,
        classId: selectedClass!,
        submissionId: latestAttempt!.id,
      }),
    enabled: Boolean(
      explicit && latestAttempt && selectedClass && effective?.completed,
    ),
    staleTime: 0,
  });
  const resultLabel = (attempt: NonNullable<typeof latestAttempt>) => {
    const result = effectiveManualResult(attempt);
    if (attempt.reviews[0])
      return `${result!.scoreHundredths / 100} / ${attempt.maximumHundredths / 100} · ${result!.completed ? mt("completed") : mt("needs_revision")}`;
    const assessment =
      attempt.multipleChoiceAssessment ?? attempt.shortAnswerAssessment;
    return assessment?.status === "GRADED"
      ? `${mt(assessment.completed ? "correct" : "incorrect")} · ${assessment.scoreHundredths! / 100} / ${attempt.maximumHundredths / 100}`
      : assessment?.status === "ERROR"
        ? mt("evaluation_unavailable")
        : assessment && assessment.status !== "MANUAL"
          ? mt("evaluating")
          : mt("awaiting_teacher_review");
  };
  if (!data)
    return (
      <main className="p-6" role={query.isError ? "alert" : "status"}>
        {query.isError
          ? mt("material_is_not_available")
          : mt("loading_activity")}
      </main>
    );
  const index = data.materials.findIndex((m) => m.materialId === materialId);
  const previous = data.materials[index - 1],
    next = data.materials[index + 1];
  const attempts = data.attempts.filter((a) => a.classId === selectedClass);
  const attempt = attempts[0],
    review = attempt?.reviews[0];
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink md:h-dvh md:overflow-hidden">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card p-3">
        <Link
          href={routes.academyLearnCourse(slug, data.course.id, { classId })}
        >
          ← {data.course.title}
        </Link>
        <h1 className="flex-1 font-bold">{data.title}</h1>
        <span className="text-xs">
          {mt(
            choice || (short && short.gradingMode !== "MANUAL")
              ? "automatic_graded"
              : "teacher_graded",
          )}{" "}
          {data.config.includeInScore
            ? mt("included_in_score")
            : mt("excluded_from_score")}
        </span>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => {});
          }}
        >
          {mt("fullscreen")}
        </button>
        <button type="button" onClick={() => setDrawer((v) => !v)}>
          {mt("materials")}
        </button>
      </header>
      {explicit && loadedContentRevision.current !== data.config.revision ? (
        <p role="alert" className="p-3 text-danger">
          {mt("content_changed")}
        </p>
      ) : null}
      {error ? (
        <p className="bg-danger/10 p-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          className={
            choice && !loadedInstructions && !attempt && !drawer
              ? "hidden"
              : "max-h-[30vh] overflow-auto border-b border-border bg-card p-5 md:max-h-none md:w-1/3 md:border-r"
          }
        >
          {choice ? (
            <ChoiceRich
              content={loadedInstructions}
              scope={{ ...target, classId: selectedClass, preview }}
            />
          ) : (
            <RichTextFrame
              content={data.config.description}
              title={mt("activity_instructions")}
            />
          )}
          {preview && data.config.solutionFiles ? (
            <details className="mt-4">
              <summary>{mt("view_solution")}</summary>
              <pre className="overflow-auto whitespace-pre-wrap">
                {Object.values(data.config.solutionFiles).join("\n")}
              </pre>
              <button
                type="button"
                disabled={busy || Boolean(running)}
                onClick={() => void run(true)}
              >
                {mt("run_solution")}
              </button>
            </details>
          ) : null}
          {preview && data.config.modelAnswer ? (
            <details>
              <summary>{mt("model_answer_private")}</summary>
              <p className="whitespace-pre-wrap">{data.config.modelAnswer}</p>
            </details>
          ) : null}
          {attempt ? (
            <section className="mt-4 rounded border border-border p-3">
              <h2 className="font-bold">{mt("last_submission")}</h2>
              <p>{new Date(attempt.createdAt).toLocaleString()}</p>
              <p>{resultLabel(attempt)}</p>
              {attempt.shortAnswerAssessment?.status === "ERROR" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void manualApi
                      .retryEvaluation({
                        ...target,
                        classId: attempt.classId,
                        submissionId: attempt.id,
                      })
                      .then(() => query.refetch())
                      .catch((e) => setError(e.message))
                      .finally(() => setBusy(false));
                  }}
                >
                  {mt("retry_evaluation")}
                </button>
              ) : null}
              {review ? (
                <p className="whitespace-pre-wrap">{review.feedback}</p>
              ) : null}
              <details className="mt-3">
                <summary>
                  {mt("submission")} ({attempts.length})
                </summary>
                {attempts.map((old) => (
                  <article
                    className="my-2 rounded border border-border p-2"
                    key={old.id}
                  >
                    <p>
                      {new Date(old.createdAt).toLocaleString()} ·{" "}
                      {resultLabel(old)}
                    </p>
                    <details>
                      <summary>{mt("read_only")}</summary>
                      {old.multipleChoiceAssessment ? (
                        <ChoiceAttempt
                          attempt={old}
                          scope={{ ...target, preview }}
                        />
                      ) : (
                        <pre className="overflow-auto whitespace-pre-wrap">
                          {data.type === "WRITTEN_RESPONSE"
                            ? old.answer
                            : Object.entries(old.files)
                                .map(([name, code]) => `${name}\n${code}`)
                                .join("\n")}
                        </pre>
                      )}
                      {old.multipleChoiceAssessment && old.id !== attempt.id ? (
                        <ChoiceHistoryExplanation
                          attempt={old}
                          scope={{ ...target, preview }}
                        />
                      ) : null}
                    </details>
                    {old.reviews.map((r) => (
                      <p key={r.id}>
                        {mt("version", { version: r.version })} ·{" "}
                        {r.scoreHundredths / 100} · {r.feedback}
                      </p>
                    ))}
                  </article>
                ))}
              </details>
            </section>
          ) : null}
          {explanation.data?.explanation && effective?.completed ? (
            <section data-testid="short-answer-explanation" className="mt-4">
              <h2 className="font-bold">{mt("explanation")}</h2>
              {choice ? (
                <ChoiceRich
                  content={explanation.data.explanation}
                  scope={{
                    ...target,
                    classId: selectedClass,
                    submissionId: attempt?.id,
                  }}
                />
              ) : (
                <RichTextFrame
                  content={explanation.data.explanation}
                  title={mt("explanation")}
                />
              )}
            </section>
          ) : null}
      <VideoResourceLinks academyId={academyId} materialId={materialId} classId={selectedClass} preview={preview}/>
          {drawer ? (
            <nav className="mt-5 grid gap-2">
              {data.materials.map((m) => (
                <Link
                  key={m.materialId}
                  href={path(m)}
                  aria-current={
                    m.materialId === materialId ? "page" : undefined
                  }
                >
                  {m.title}
                </Link>
              ))}
            </nav>
          ) : null}
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {data.type === "TURTLE_EXERCISE" ? (
            <>
              <div className="flex gap-2 overflow-auto bg-editor-bg p-2 text-white">
                {Object.keys(files).map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={selected === name ? "font-bold underline" : ""}
                    onClick={() => setSelected(name)}
                  >
                    {name}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const name = window.prompt(mt("python_file_name"));
                    if (name && !Object.hasOwn(files, name)) {
                      setFiles({ ...files, [name]: "" });
                      setSelected(name);
                    }
                  }}
                >
                  {mt("file")}
                </button>
              </div>
              <div className="flex min-h-[220px] flex-[1] flex-col">
                <CodeEditor
                  code={files[selected] ?? ""}
                  fontSize={14}
                  onChange={(value) => {
                    setFiles({ ...files, [selected]: value });
                    setDirty(true);
                    setSaved(mt("unsaved_changes"));
                  }}
                />
              </div>
            </>
          ) : loadedChoice ? (
            <div className="mx-auto w-full max-w-3xl flex-1 overflow-auto p-5">
              <ChoiceOptions
                definition={loadedChoice}
                selected={choiceSelected}
                onChange={(ids) => {
                  setChoiceSelected(ids);
                  setDirty(true);
                  setSaved(mt("unsaved_changes"));
                }}
                disabled={busy}
                scope={{ ...target, classId: selectedClass, preview }}
              />
            </div>
          ) : (
            <label className="flex flex-1 flex-col p-5">
              {short
                ? `Q. ${short.question}`
                : data.config.hint || mt("your_answer")}
              <textarea
                className="mt-3 min-h-[260px] rounded border border-border bg-card p-3"
                aria-label={mt("your_answer")}
                placeholder={short ? data.config.hint : undefined}
                disabled={busy}
                maxLength={10000}
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  setDirty(true);
                  setSaved(mt("unsaved_changes"));
                }}
              />
            </label>
          )}
          <div className="flex flex-wrap items-center gap-3 border-y border-border bg-card p-3">
            {data.type === "TURTLE_EXERCISE" ? (
              <>
                <button
                  className="rounded bg-brand px-4 py-2 text-white"
                  disabled={busy || Boolean(running)}
                  type="button"
                  onClick={() => void run()}
                >
                  {mt("run")}
                </button>
                <button
                  disabled={busy || !running}
                  type="button"
                  onClick={() => void stop()}
                >
                  {mt("stop")}
                </button>
              </>
            ) : null}
            {!preview ? (
              <>
                {!explicit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                  >
                    {mt("save_code")}
                  </button>
                ) : null}
                {data.config.submitEnabled ? (
                  <button
                    className="rounded border border-border px-4 py-2"
                    type="button"
                    disabled={
                      busy ||
                      data.submissionUnavailable ||
                      !selectedClass ||
                      Boolean(short && answer.length === 0) ||
                      Boolean(choice && choiceSelected.length === 0)
                    }
                    onClick={() => void submit()}
                  >
                    {mt("submit")}
                  </button>
                ) : null}
              </>
            ) : null}
            {!preview && data.classes.length > 1 ? (
              <select
                aria-label={mt("submission_class")}
                className="border border-border bg-card p-2"
                value={selectedClass ?? ""}
                onChange={(e) => setDeliveryClass(e.target.value)}
              >
                <option value="">{mt("choose_class")}</option>
                {data.classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : null}
            {data.submissionUnavailable ? (
              <p role="status" className="text-xs">
                {mt(choice ? "choice_unavailable" : "short_answer_unavailable")}
              </p>
            ) : null}
            <span role="status" className="text-xs">
              {saved} {session?.state}{" "}
              {session?.exitCode !== undefined
                ? mt("exit_code", { code: session.exitCode })
                : null}
              {running
                ? mt("seconds_remaining", {
                    count: Math.max(
                      0,
                      Math.ceil((session!.expiresAt - Date.now()) / 1000),
                    ),
                  })
                : ""}
            </span>
          </div>
          {data.type === "TURTLE_EXERCISE" ? (
            <>
              <div
                role="tablist"
                className="flex gap-4 border-b border-border p-2 md:hidden"
              >
                <button
                  role="tab"
                  aria-selected={executionTab === "drawing"}
                  onClick={() => setExecutionTab("drawing")}
                >
                  {mt("drawing")}
                </button>
                <button
                  role="tab"
                  aria-selected={executionTab === "terminal"}
                  onClick={() => setExecutionTab("terminal")}
                >
                  {mt("terminal")}
                </button>
              </div>
              <div className="flex min-h-[280px] flex-[1] flex-col lg:flex-row">
                <div
                  className={
                    "min-h-[280px] md:min-h-0 min-w-0 flex-1 flex-col md:flex " +
                    (executionTab === "drawing" ? "flex" : "hidden")
                  }
                >
                  {session ? (
                    <GuiViewer session={session} onError={showError} />
                  ) : (
                    <div className="grid flex-1 place-items-center bg-white text-slate-600">
                      {mt("run_python_to_open_the_drawing")}
                    </div>
                  )}
                </div>
                <section
                  className={
                    "min-h-[120px] min-w-0 flex-1 flex-col bg-editor-bg p-3 text-white md:flex " +
                    (executionTab === "terminal" ? "flex" : "hidden")
                  }
                  aria-label={mt("terminal")}
                >
                  <pre
                    className="max-h-[200px] flex-1 overflow-auto whitespace-pre-wrap text-xs"
                    data-testid="turtle-terminal"
                  >
                    {session?.output}
                  </pre>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (session) {
                        void manualApi
                          .input(session.id, input)
                          .then(() => setInput(""))
                          .catch((e) => setError(e.message));
                      }
                    }}
                  >
                    <input
                      className="w-full border-t border-white/20 bg-transparent p-2 text-sm"
                      aria-label={mt("terminal_input")}
                      placeholder={mt("terminal_input")}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      disabled={!running}
                    />
                  </form>
                </section>
              </div>
            </>
          ) : null}
        </section>
      </div>
      <footer className="flex shrink-0 justify-center gap-5 border-t border-border bg-card p-3">
        {previous ? <Link href={path(previous)}>{mt("previous")}</Link> : null}
        <span>
          {index + 1} / {data.materials.length}
        </span>
        {next ? <Link href={path(next)}>{mt("next")}</Link> : null}
      </footer>
    </main>
  );
}
