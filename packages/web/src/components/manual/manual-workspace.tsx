'use client';

import { ArrowLeft, ChevronLeft, ChevronRight, Expand, Send, Save, BookOpen, Menu, LogOut, History, MessageSquareText, ListChecks } from 'lucide-react';
import { WrittenAnswerCard, AssessmentDrawer, AssessmentStatus, assessmentAction, assessmentPrimary } from './assessment-ui';
import { usePracticeTranslation } from "@/components/workspace/use-practice-translation";
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
  const { t: pt } = usePracticeTranslation();
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
  const [executionTab, setExecutionTab] = useState<"drawing" | "terminal">(
    "drawing",
  );
  const [dirty, setDirty] = useState(false);
  const pendingSubmit = useRef<{ key: string; content: string } | null>(null);
  const resultPanel = useRef<HTMLElement | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const draftRevision = useRef(0);
  const loaded = useRef(false);
  const loadedContentRevision = useRef<number | undefined>(undefined);
  const active = useRef<string | null>(null);
  const connectionFailed = useRef(false);
  const latest = useRef({ files, answer });
  // Latest-value ref read only by autosave callbacks, never by render output.
  // eslint-disable-next-line react-hooks/refs
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
    if (!selectedClass && !data?.practice) {
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
      await (data?.practice ? manualApi.submitPractice : manualApi.submit)({
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
        classId: selectedClass!,
        requestKey: pendingSubmit.current.key,
      });
      pendingSubmit.current = null;
      if (explicit) {
        setChoiceSelected([]);
        setDirty(false);
        setAnswer("");
      }
      await query.refetch();
      setSaved(data?.practice ? pt("saved_result") :
        mt(explicit ? "submitted" : "submitted_awaiting_teacher_review"),
      );
      requestAnimationFrame(() => resultPanel.current?.scrollIntoView({ block: 'nearest' }));
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
            preview: preview || undefined,
          });
  const latestAttempt = data?.practice ? data.attempts[0] : data?.attempts.find((a) => a.classId === selectedClass);
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
    if (data?.practice && !attempt.shortAnswerAssessment && !attempt.multipleChoiceAssessment) return pt("saved_result");
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
  const attempts = data.practice ? data.attempts : data.attempts.filter((a) => a.classId === selectedClass);
  const attempt = attempts[0],
    review = attempt?.reviews[0];
  const drawing = data.type === "TURTLE_EXERCISE";
  const instructionHtml = choice ? loadedInstructions : data.config.description;
  const showInstructions = drawing || Boolean(instructionHtml.replace(/<[^>]*>/g, '').trim() || /<(?:img|video|iframe)\b/i.test(instructionHtml) || (preview && data.config.modelAnswer));
  const submissionPanels = <>{attempt ? (
            <section ref={resultPanel} className="mx-5 mb-5 rounded-lg border border-border bg-canvas/50 p-4 sm:mx-6">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-sub"><History aria-hidden className="size-4" />{mt("last_submission")}</h2>
              <p className="mt-1 text-xs text-sub">{new Date(attempt.createdAt).toLocaleString()}</p>
              <div className="mt-3"><AssessmentStatus label={resultLabel(attempt)} completed={effective?.completed} /></div>
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
                <div className="mt-4 border-t border-border pt-4"><h3 className="mb-2 flex items-center gap-2 text-xs font-bold text-sub"><MessageSquareText aria-hidden className="size-4 text-brand" />{mt("feedback")}</h3><p className="whitespace-pre-wrap text-sm leading-7">{review.feedback}</p></div>
              ) : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand">
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
            <section data-testid="short-answer-explanation" className="mx-5 mb-5 rounded-lg border border-success/20 bg-success/5 p-4 sm:mx-6">
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
          ) : null}</>;
  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink md:h-dvh md:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <AssessmentDrawer title={mt('materials')} trigger={<button type="button" aria-label={mt('materials')} className={assessmentAction}><Menu aria-hidden className="size-4" /></button>}>
          <nav aria-label={mt('materials')} className="grid gap-1">
            <p className="mb-3 px-3 text-xs font-semibold text-sub">{data.course.title}</p>
            {data.materials.map((m, i) => <Link key={m.materialId} href={path(m)} aria-current={m.materialId === materialId ? 'page' : undefined}
              className="flex items-start gap-3 rounded-md border border-transparent px-3 py-3 text-sm hover:bg-accent aria-[current=page]:border-brand/20 aria-[current=page]:bg-brand-soft aria-[current=page]:text-brand">
              <span className="mt-0.5 text-xs tabular-nums text-sub">{i + 1}</span><span className="min-w-0 flex-1">{m.title}</span>
              {m.type === 'MULTIPLE_CHOICE' ? <ListChecks aria-hidden className="size-4 shrink-0 text-brand" /> : <BookOpen aria-hidden className="size-4 shrink-0 text-sub" />}
            </Link>)}
          </nav>
        </AssessmentDrawer>
        <Link
          className="flex min-w-0 max-w-[calc(100%-65px)] items-center gap-2 text-sm font-medium text-sub hover:text-brand sm:max-w-60"
          href={routes.academyLearnCourse(slug, data.course.id, { classId: selectedClass })}
        >
          <ArrowLeft aria-hidden className="size-4 shrink-0" /><span className="truncate">{data.course.title}</span>
        </Link>
        <h1 className="min-w-0 w-full text-sm font-bold tracking-tight sm:w-auto sm:flex-1">{data.title}</h1>
        <span className="hidden items-center gap-2 rounded-md bg-brand-soft px-2.5 py-1.5 text-xs font-medium text-brand lg:inline-flex">
          <ListChecks aria-hidden className="size-3.5" />
          {mt(
            choice || (short && short.gradingMode !== "MANUAL")
              ? "automatic_graded"
              : "teacher_graded",
          ).replace(/\s*·\s*$/, '')}{" · "}
          {data.practice ? pt("label") : data.config.includeInScore
            ? mt("included_in_score")
            : mt("excluded_from_score")}
        </span>
        <Link href={routes.academyLearnCourse(slug, data.course.id, { classId: selectedClass })} className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10"><LogOut aria-hidden className="size-4" />{mt('ui.leave')}</Link>
      </header>
      {preview ? <p role="note" className="flex shrink-0 items-center gap-2 border-b border-brand/15 bg-brand-soft px-5 py-3 text-sm text-brand"><BookOpen aria-hidden className="size-4 shrink-0" />{mt("ui.preview_notice")}</p> : null}
      {data.practice ? <p role="note" className="border-b border-brand/15 bg-brand-soft px-4 py-2 text-xs text-brand"><strong>{pt("label")}</strong> · {pt("notice")}</p> : null}
      {/* Assigned when a draft loads, alongside state that re-renders. */}
      {/* eslint-disable-next-line react-hooks/refs */}
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
      <div className={`flex min-h-0 flex-1 flex-col ${drawing ? "md:flex-row" : "gap-4 overflow-y-auto p-4 sm:p-6 md:flex-row md:overflow-hidden md:p-8"}`}>
        <aside
          className={
            !showInstructions
              ? "hidden"
              : drawing ? "shrink-0 overflow-auto border-b border-border bg-card p-5 md:w-[38%] md:max-w-xl md:border-r md:border-b-0 sm:p-7" : "min-h-48 min-w-0 shrink-0 rounded-lg border border-border bg-card p-6 md:min-h-0 md:w-[calc(50%-8px)] md:overflow-y-auto"
          }
        >
          <h2 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sub"><BookOpen aria-hidden className="size-4" />{mt("activity_instructions")}</h2>
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
            <details className="mt-6 rounded-xl border border-border bg-canvas/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-sub">{mt("model_answer_private")}</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{data.config.modelAnswer}</p>
            </details>
          ) : null}
          {drawing ? submissionPanels : null}
      <VideoResourceLinks academyId={academyId} materialId={materialId} classId={selectedClass} preview={preview}/>
        </aside>
        <section aria-label={mt("ui.answer_workspace")} className={`flex min-h-0 min-w-0 flex-1 flex-col ${drawing ? "" : `min-h-[440px] rounded-lg border border-border bg-card md:min-h-0 ${showInstructions ? "" : "mx-auto w-full max-w-3xl"}`}`}>
          {!showInstructions ? <div className="px-6"><VideoResourceLinks academyId={academyId} materialId={materialId} classId={selectedClass} preview={preview} /></div> : null}
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
            <div className="min-h-0 flex-1 overflow-y-auto">
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
              {submissionPanels}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WrittenAnswerCard question={short?.question} hint={data.config.hint} answer={answer} disabled={busy}
                onChange={(value) => { setAnswer(value); setDirty(true); setSaved(mt("unsaved_changes")); }} />
              {submissionPanels}
            </div>
          )}
          <div className={`flex shrink-0 flex-wrap items-center gap-3 ${data.type === "TURTLE_EXERCISE" ? "border-y border-border bg-card p-3" : "mt-auto justify-end border-t border-border bg-canvas/30 px-5 py-4"}`}>
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
            {preview && !drawing ? <button type="button" disabled className={assessmentPrimary}><Send aria-hidden className="size-4" />{mt("submit")}</button> : null}
            {!preview ? (
              <>
                {!explicit ? (
                  <button
                    type="button"
                    className={assessmentAction}
                    disabled={busy || !dirty}
                    onClick={() => void save()}
                  >
                    <Save aria-hidden className="size-4" />{mt(data.type === "WRITTEN_RESPONSE" ? "ui.save_answer" : "save_code")}
                  </button>
                ) : null}
                {data.config.submitEnabled ? (
                  <button
                    className={assessmentPrimary}
                    type="button"
                    disabled={
                      busy ||
                      data.submissionUnavailable ||
                      (!selectedClass && !data.practice) ||
                      Boolean(short && answer.length === 0) ||
                      Boolean(choice && choiceSelected.length === 0)
                    }
                    onClick={() => void submit()}
                  >
                    <Send aria-hidden className="size-4" />{mt(busy ? "ui.submitting" : "submit")}
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
            <span role="status" className={drawing ? "text-xs" : "order-first mr-auto text-xs text-sub"}>
              {saved} {session?.state}{" "}
              {session?.exitCode !== undefined
                ? mt("exit_code", { code: session.exitCode })
                : null}
              {running
                ? mt("seconds_remaining", {
                    count: Math.max(
                      0,
                      // A countdown: session polling re-renders this while a run is active.
                      // eslint-disable-next-line react-hooks/purity
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
      <footer className="relative flex shrink-0 flex-wrap items-center justify-center gap-4 border-t border-border bg-card px-4 py-3 text-sm">
        {previous ? <Link className={assessmentAction} href={path(previous)}><ChevronLeft aria-hidden className="size-4" />{mt("previous")}</Link> : null}
        <span>
          {index + 1} / {data.materials.length}
        </span>
        {next ? <Link className={assessmentPrimary} href={path(next)}>{mt("next")}<ChevronRight aria-hidden className="size-4" /></Link> : null}
        <div className="ml-auto sm:absolute sm:right-4">        <button
          className={assessmentAction}
          aria-label={mt('fullscreen')}
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else
              void document.documentElement
                .requestFullscreen?.()
                .catch(() => {});
          }}
        >
          <Expand aria-hidden className="size-4" /><span className="hidden sm:inline">{mt("fullscreen")}</span>
        </button>
        </div>
      </footer>
    </main>
  );
}
