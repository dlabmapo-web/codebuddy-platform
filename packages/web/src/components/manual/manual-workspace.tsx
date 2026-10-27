'use client';

import { Send, Save, BookOpen, History, MessageSquareText, ListChecks, FileCode2, Play, Square, Terminal, Turtle, Expand } from 'lucide-react';
import { useStudentPresence } from '@/lib/monitoring/student-presence';
import { LessonHeader, LessonFooter } from '@/components/workspace/lesson-chrome';
import { WorkspaceCurriculumNavigator } from '@/components/workspace/curriculum-navigator';
import { CurriculumTrigger } from '@/components/workspace/curriculum-trigger';
import { useNavigatorPanel } from '@/lib/workspace/use-navigator-panel';
import { useMaterialNavigation } from '@/components/workspace/use-material-navigation';
import { useLayoutTranslation } from '@/i18n';
import { useRouter } from 'next/navigation';
import { ManualStaffActions } from './manual-staff-actions';
import { SubmissionSummary } from '@/components/workspace/submission-summary';
import { useSubmissionStatus } from '@/components/workspace/use-submission-status';
import { WrittenAnswerCard, AssessmentStatus, assessmentAction, assessmentPrimary } from './assessment-ui';
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
import { useQuery } from "@tanstack/react-query";
import { effectiveManualResult, type ManualSession } from "@cove/shared";
import { manualApi } from "@/lib/manual-api";
import { CodeEditor } from "@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/code-editor";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { GuiViewer } from "./gui-viewer";
import { AddSourceFile } from './add-source-file';
import { Button } from '@/components/studio/button';
import { DrawingIconButton, DrawingLayoutControl } from './drawing-panel-controls';
import { WorkspaceResizeHandle } from './workspace-resize-handle';
import styles from './manual-workspace.module.css';
import type { CSSProperties } from 'react';
import { executionTranslationKey } from './execution-state';
export function ManualWorkspace({
  academyId,
  materialId,
  userId,
  classId,
  preview = false,
}: {
  academyId: string;
  materialId: string;
  userId: string;
  classId?: string;
  preview?: boolean;
}) {
  const { t: mt } = useManualTranslation();
  const { t: pt } = usePracticeTranslation();
  const router = useRouter();
  const { t: lt } = useLayoutTranslation('learn');
  const [deliveryClass, setDeliveryClass] = useState(classId);
  const target = { academyId, materialId };
  const query = useQuery({
    queryKey: ["manual", userId, academyId, materialId, preview, deliveryClass],
    queryFn: () =>
      manualApi.read({ ...target, preview, classId: deliveryClass }),
    retry: false, staleTime: 0, refetchOnWindowFocus: true,
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
  const [executionTab, setExecutionTab] = useState<"code" | "drawing" | "terminal">(
    "code",
  );
  const [drawingLayout, setDrawingLayout] = useState('below');
  const [editorShare, setEditorShare] = useState(40);
  const [solutionRun, setSolutionRun] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const generation = useRef(0);
  const [dirty, setDirty] = useState(false);
  const pendingSubmit = useRef<{ key: string; content: string } | null>(null);
  const resultPanel = useRef<HTMLElement | null>(null);
  const saving = useRef<Promise<boolean> | null>(null);
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
      generation.current++;
      if (active.current) void manualApi.stop(active.current).catch(() => {});
    },
    [],
  );
  useEffect(() => {
    if (
      !session ||
      !["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT", "DISPLAYING"].includes(
        session.state,
      )
    )
      return;
    let cancelled = false;
    const currentGeneration = generation.current;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void manualApi
        .status(session.id)
        .then((next) => {
          if (!cancelled && currentGeneration === generation.current && active.current === next.id) {
            setSession(next);
            if (connectionFailed.current) {
              connectionFailed.current = false;
              setError("");
            }
          }
        })
        .catch((e) => {
          if (!cancelled && currentGeneration === generation.current) {
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
    ["RUNNING", "STARTING", "QUEUED", "WAITING_INPUT", "DISPLAYING"].includes(session.state);
  async function save() {
    if ((preview && !data?.practice) || explicit) return true;
    if (saving.current) return saving.current;
    const snapshot = latest.current;
    const operation = (async () => {
      setError("");
      try {
        const result = await manualApi.draft({
          ...target,
          ...latest.current,
          revision: draftRevision.current, preview, contentRevision: loadedContentRevision.current,
        });
        draftRevision.current = result.revision;
        if (
          latest.current.files === snapshot.files &&
          latest.current.answer === snapshot.answer
        )
          setDirty(false);
        setSaved(mt("saved"));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : mt("could_not_save"));
        return false;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = operation;
    return operation;
  }
  useEffect(() => {
    if ((preview && !data?.practice) || explicit || !dirty) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [files, answer, dirty, preview, explicit, data?.practice]);
  const selectedClass =
    deliveryClass ??
    (data?.classes.length === 1 ? data.classes[0].classId : undefined);
  const latestStatus = useSubmissionStatus({
    queryKey: ['manual-latest', userId, academyId, materialId, selectedClass, preview, data?.practice ?? false, data?.config.revision],
    read: signal => manualApi.latestSubmission({ academyId, materialId, classId: selectedClass, preview }, signal),
    enabled: Boolean(data?.config.submitEnabled && data.participation?.mode !== 'inspection'),
    seed: data?.latestSubmission,
    onTerminal: () => { void query.refetch(); },
  });
  const navigation = useMaterialNavigation({ academyId, materialId, classId: selectedClass, preview, courseId: data?.course.id, materials: data?.materials });
  const { open: panelOpen, panelId, triggerRef, toggle: togglePanel, close: closePanel } = useNavigatorPanel('material-course-outline', Boolean(data && data.type !== 'TURTLE_EXERCISE'), Boolean(data));
  async function navigateMaterial(id?: string, href?: string) {
    if (busy) return;
    if (dirty && explicit && !window.confirm(mt('discard_answer'))) return;
    if (dirty && !explicit && !await save()) return;
    if (active.current) {
      try { await manualApi.stop(active.current); active.current = null; }
      catch (error) { setError(error instanceof Error ? error.message : mt('stop_failed')); return; }
    }
    if (href) router.push(href); else if (id) navigation.navigate(id);
  }
  const { setOpenMaterial } = useStudentPresence();
  const presenceCourseId = !preview && !data?.practice ? data?.course.id : undefined;
  useEffect(() => {
    if (!presenceCourseId || !selectedClass) return;
    setOpenMaterial({ materialId, courseId: presenceCourseId, classId: selectedClass });
    return () => setOpenMaterial(null);
  }, [materialId, presenceCourseId, selectedClass, setOpenMaterial]);
  async function run(solution = false) {
    setSolutionRun(solution);
    const current = ++generation.current;
    setBusy(true);
    setPreparing(true);
    setError("");
    setInput('');
    setSession(null);
    try {
      if (active.current) await manualApi.stop(active.current);
      active.current = null;
      if (current !== generation.current) return;
      const next = await manualApi.start({
        ...target,
        ...latest.current,
        contentRevision: loadedContentRevision.current ?? data!.config.revision,
        revision: draftRevision.current,
        preview,
        solution,
      });
      if (current !== generation.current) { await manualApi.stop(next.id); return; }
      active.current = next.id;
      setSession(next);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : mt("run_failed"));
    } finally {
      if (current === generation.current) { setBusy(false); setPreparing(false); }
    }
  }
  async function stop() {
    generation.current++;
    setPreparing(false);
    if (!active.current) { setBusy(false); return; }
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
        revision: loadedContentRevision.current,
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
        contentRevision: loadedContentRevision.current ?? data!.config.revision,
        ...(data?.practice ? { preview } : {}),
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
    if (data?.practice && !result && (!attempt.shortAnswerAssessment || attempt.shortAnswerAssessment.status === "MANUAL") && !attempt.multipleChoiceAssessment) return pt("saved_result");
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
    <main className="relative flex h-dvh flex-col overflow-hidden bg-canvas text-ink">
      <LessonHeader courseTitle={data.course.title} lectureTitle={navigation.context?.path.lecture.title} title={data.title}
        leaveHref={navigation.courseHref}
        curriculum={<CurriculumTrigger compact ref={triggerRef} open={panelOpen} panelId={panelId} onToggle={togglePanel} path={navigation.context?.path ?? null} />}>
        {data.practice ? <span className="hidden rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand sm:inline-flex">{pt('label')}</span> : null}
        <ManualStaffActions academyId={academyId} data={data} classId={selectedClass} onRunSolution={preview && drawing ? () => void run(true) : undefined} runDisabled={busy || Boolean(running)} />
      </LessonHeader>
      {preview ? <p role="note" className={`flex shrink-0 items-center gap-2 border-b border-brand/15 bg-brand-soft px-5 text-brand ${drawing ? "py-1.5 text-xs" : "py-3 text-sm"}`}><BookOpen aria-hidden className="size-4 shrink-0" />{mt(data.practice ? "ui.preview_practice_notice" : "ui.preview_notice")}</p> : null}
      {data.practice ? <p role="note" className="border-b border-brand/15 bg-brand-soft px-4 py-2 text-xs text-brand"><strong>{pt("label")}</strong> · {pt("notice")}</p> : null}
      {/* Assigned when a draft loads, alongside state that re-renders. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      {loadedContentRevision.current !== undefined && loadedContentRevision.current !== data.config.revision ? (
        <p role="alert" className="p-3 text-danger">
          {mt("content_changed")}
        </p>
      ) : null}
      {error ? (
        <p className="bg-danger/10 p-3 text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <WorkspaceCurriculumNavigator context={navigation.context} displayedMaterialId={materialId} open={panelOpen} panelId={panelId}
          onClose={closePanel} onSelect={id => void navigateMaterial(id)} disabled={busy} error={navigation.failed} unavailable={navigation.unavailable} onRetry={navigation.retry}
          footer={{ href: navigation.courseHref, label: lt('navigator.footer_student') }} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div role="status" className="flex shrink-0 items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-1.5 text-xs font-semibold text-brand">
        <ListChecks aria-hidden className="size-4" />{mt(choice || (short && short.gradingMode !== 'MANUAL') ? 'automatic_graded' : 'teacher_graded').replace(/\s*·\s*$/, '')} · {mt(data.config.includeInScore ? 'included_in_score' : 'excluded_from_score')}
      </div>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${drawing ? "md:flex-row" : "gap-4 overflow-y-auto p-4 sm:p-6 md:flex-row md:overflow-hidden md:p-8"}`}>
        <aside
          className={
            !showInstructions
              ? "hidden"
              : drawing ? "max-h-[25dvh] shrink-0 overflow-auto border-b border-border bg-card p-5 md:max-h-none md:w-[32%] md:max-w-xl md:resize-x md:border-r md:border-b-0 sm:p-7" : "min-h-48 min-w-0 shrink-0 rounded-lg border border-border bg-card p-6 md:min-h-0 md:w-[calc(50%-8px)] md:overflow-y-auto"
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
          {preview && data.config.modelAnswer ? (
            <details className="mt-6 rounded-xl border border-border bg-canvas/60 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-sub">{mt("model_answer_private")}</summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{data.config.modelAnswer}</p>
            </details>
          ) : null}
          {drawing ? submissionPanels : null}
      <VideoResourceLinks academyId={academyId} materialId={materialId} classId={selectedClass} preview={preview}/>
        </aside>
        <section aria-label={mt("ui.answer_workspace")} data-layout={drawingLayout} data-tab={executionTab} style={{ '--editor-track': `${editorShare}fr`, '--result-track': `${100 - editorShare}fr` } as CSSProperties} className={drawing ? styles.workspace : `flex min-h-0 min-w-0 flex-1 flex-col min-h-[440px] rounded-lg border border-border bg-card md:min-h-0 ${showInstructions ? "" : "mx-auto w-full max-w-3xl"}`}>
          {!showInstructions ? <div className="px-6"><VideoResourceLinks academyId={academyId} materialId={materialId} classId={selectedClass} preview={preview} /></div> : null}
          {data.type === "TURTLE_EXERCISE" ? (
            <>
              <div className={`${styles.files} flex min-h-11 items-center overflow-x-auto border-b border-border bg-editor-bg text-sm text-white/70`}>
                {Object.keys(files).map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={selected === name}
                    className="inline-flex h-11 shrink-0 items-center gap-2 border-r border-b-2 border-r-white/10 border-b-transparent px-4 text-sm outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand aria-pressed:border-b-brand aria-pressed:bg-white/5 aria-pressed:text-white"
                    onClick={() => setSelected(name)}
                  >
                    <FileCode2 aria-hidden className="size-4 text-brand" />{name}
                  </button>
                ))}
                <div className="ml-1"><AddSourceFile className="text-white/65 hover:bg-white/10 hover:text-white" files={files} onAdd={name => {
                  setFiles({ ...files, [name]: '' }); setSelected(name);
                  setDirty(true); setSaved(mt('unsaved_changes'));
                }} /></div>
              </div>
              <div className={styles.editor}>
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
          <div className={`flex shrink-0 flex-wrap items-center gap-2 ${data.type === "TURTLE_EXERCISE" ? `${styles.controls} min-h-12 border-y border-border bg-card px-3 py-1.5` : "mt-auto justify-end border-t border-border bg-canvas/30 px-5 py-4"}`}>
            {data.type === "TURTLE_EXERCISE" ? (
              <>
                <button
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || Boolean(running)}
                  type="button"
                  onClick={() => void run()}
                >
                  <Play aria-hidden className="size-3.5" />{mt("run")}
                </button>
                <Button variant="ghost" size="sm" className="h-9"
                  disabled={!preparing && (busy || !running)}
                  type="button"
                  onClick={() => void stop()}
                >
                  <Square aria-hidden className="size-3.5" />{mt("stop")}
                </Button>
              </>
            ) : null}

            {(!preview || data.practice) ? (
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
                      data.participation?.canSubmit === false ||
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
            {preview && !data.practice && data.config.submitEnabled ? <button type="button" disabled className={assessmentPrimary}><Send aria-hidden className="size-4" />{mt('submit')}</button> : null}
            {data.participation?.reason ? <p role="status" className="text-xs text-sub">{mt(`submission_reason.${data.participation.reason}`)}</p> : null}
            {data.config.submitEnabled && data.participation?.mode !== 'inspection' ? <SubmissionSummary latest={latestStatus.data} failed={latestStatus.isError} onRefresh={() => void latestStatus.refetch()} refreshing={latestStatus.isFetching} /> : null}
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
            <span role="status" className={drawing ? "ml-auto text-xs text-sub" : "order-first mr-auto text-xs text-sub"}>
              {solutionRun && <span className="mr-2 rounded bg-brand-soft px-2 py-1 font-semibold text-brand">{mt("solution_result")}</span>}
              {saved} {preparing ? mt('execution.preparing') : session ? mt(executionTranslationKey(session.state)) : ''}{" "}
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
                className={`${styles.tabs} flex gap-4 border-b border-border p-2 md:hidden`}
                aria-label={mt('workspace_panels')}
              >
                <button role="tab" aria-selected={executionTab === 'code'} onClick={() => setExecutionTab('code')}>{mt('code')}</button>
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
              <WorkspaceResizeHandle value={editorShare} onChange={setEditorShare} />
              <div className={styles.results}>
                <div
                  className={styles.drawing}
                >
                  {session ? (
                    <GuiViewer key={session.id} session={session} onError={showError} onStop={() => void stop()} layout={drawingLayout} onLayoutChange={setDrawingLayout} />
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col bg-white">
                      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-border bg-card px-3 text-xs">
                        <strong className="mr-auto font-semibold">{mt("drawing")}</strong>
                        <DrawingLayoutControl value={drawingLayout} onChange={setDrawingLayout} />
                        <DrawingIconButton label={mt("expand_drawing")} disabled><Expand aria-hidden /></DrawingIconButton>
                      </div>
                      <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 p-4 text-center text-slate-500">
                        <Turtle aria-hidden className="size-9 text-slate-300" /><p className="text-xs">{mt("run_python_to_open_the_drawing")}</p>
                      </div>
                    </div>
                  )}
                </div>
                <section
                  className={`${styles.terminal} bg-editor-bg text-white`}
                  aria-label={mt("terminal")}
                >
                  <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs font-semibold text-white/65"><Terminal aria-hidden className="size-3.5" />{mt("terminal")}</div>
                  <pre
                    className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed"
                    data-testid="turtle-terminal"
                  >
                    {session?.output || (!session ? mt("code_not_run") : "")}
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
                      className="w-full border-t border-white/15 bg-transparent px-3 py-2.5 text-xs outline-none placeholder:text-white/40 focus:ring-2 focus:ring-inset focus:ring-brand disabled:cursor-not-allowed disabled:opacity-40"
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
      </div>
      </div>
      <LessonFooter
        previous={navigation.previous ? { onClick: () => void navigateMaterial(undefined, navigation.previous!.href) } : null}
        next={navigation.next ? { onClick: () => void navigateMaterial(undefined, navigation.next!.href) } : null}
        index={navigation.index} total={navigation.total} disabled={busy} />
    </main>
  );
}
