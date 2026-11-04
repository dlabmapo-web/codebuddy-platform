"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  FileCode2,
  Menu,
  History,
  ShieldCheck,
  BookOpen,
  CheckCircle2,
  Terminal,
  Turtle,
  ListChecks,
  FileX2,
} from "lucide-react";
import { formatDateTime } from "@cove/i18n/format";
import { useLocale, useLayoutTranslation } from "@/i18n";
import type {
  HistorySubmission,
  ManualSession,
  MonitoringExercisePreview,
  ObservedMaterial,
} from "@cove/shared";
import { orpc } from "@/lib/orpc";
import { manualApi } from "@/lib/manual-api";
import { usePythonRunner } from "@/lib/workspace/use-python-runner";
import { TerminalPanel } from "@/components/workspace/terminal-panel";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { ChoiceOptions } from "@/components/manual/choice-options";
import { GuiViewer } from "@/components/manual/gui-viewer";
import { useManualTranslation } from "@/components/manual/use-manual-translation";
import { WorkspaceResizeHandle } from "@/components/manual/workspace-resize-handle";
import { DrawingLayoutControl } from "@/components/manual/drawing-panel-controls";
import manualStyles from "@/components/manual/manual-workspace.module.css";
import { QuizFeedback } from "@/components/workspace/quiz-feedback";
import { WorkspaceCurriculumNavigator } from "@/components/workspace/curriculum-navigator";
import { ProblemStatement } from "@/components/workspace/problem-statement";
import { GradingNotice } from "@/components/pdf/grading-notice";
import { ExerciseReferencePane } from "@/components/pdf/exercise-reference-pane";
import { FontSizeControls } from "@/components/workspace/font-size-controls";
import { useEditorPreferences } from "@/lib/workspace/use-editor-preferences";
import { useSplitPane } from "@/lib/workspace/use-split-pane";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { routes } from "@/lib/routes";
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from "@/lib/monaco/theme";
import {
  historyAction,
  historyPrimaryAction,
  HistoryError,
} from "./history-ui";

const Editor = dynamic(() => import("@/lib/monaco/editor"), { ssr: false });
const difficultyStyles = {
  EASY: "bg-success/10 text-success",
  MEDIUM: "bg-warning/10 text-warning",
  HARD: "bg-danger/10 text-danger",
} as const;
type Props = {
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
  submissionId: string;
  kind: "programming" | "manual";
  queryScope: string;
  onRegisterGuard: (guard: (() => boolean) | null) => void;
  active: boolean;
  onBack: () => void;
  backLabel?: string;
  headerActions?: React.ReactNode;
  onSelectMaterial?: (id: string) => void;
  embedded?: boolean;
};
export function SubmissionWorkspace(props: Props) {
  const { t } = useTranslation("teach");
  const query = useQuery({
    queryKey: [
      "student-history",
      props.queryScope,
      "submission",
      props.academyId,
      props.classId,
      props.membershipId,
      props.materialId,
      props.submissionId,
      props.kind,
    ],
    queryFn: () =>
      orpc.studentWorkHistory.getSubmission({
        academyId: props.academyId,
        classId: props.classId,
        membershipId: props.membershipId,
        materialId: props.materialId,
        submissionId: props.submissionId,
        kind: props.kind,
      }),
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: props.active ? 30000 : false,
  });
  return (
    <>
      {query.isError ? (
        <>
          <button
            type="button"
            className={`${historyAction} m-4 self-start`}
            onClick={props.onBack}
          >
            {props.backLabel ?? t("history.back_history")}
          </button>
          <HistoryError retry={() => void query.refetch()} />
        </>
      ) : query.data ? (
        <ReviewCopy {...props} data={query.data} />
      ) : (
        <p role="status" className="p-6">
          {t("history.loading")}
        </p>
      )}
    </>
  );
}
type ProgrammingReview = Extract<
  HistorySubmission,
  { kind: "programming" }
>["review"];
type ManualReview = Extract<HistorySubmission, { kind: "manual" }>;
// Presentation data is not a persisted submission. Drafts have no invented ID,
// timestamp, result or score; both sources share exactly the same workspace.
type ReviewData =
  | {
      kind: "programming";
      draft?: "saved" | "starter";
      review: Pick<
        ProgrammingReview,
        "code" | "language" | "problemTitle" | "studentName"
      > &
        Partial<ProgrammingReview>;
    }
  | (Pick<
      ManualReview,
      | "kind"
      | "type"
      | "studentName"
      | "title"
      | "files"
      | "entryPoint"
      | "description"
      | "answer"
      | "question"
      | "choice"
    > &
      Partial<ManualReview> & {
        draft?: "saved" | "starter";
        includeInScore?: boolean;
      });
type PrivateProps = Omit<Props, "submissionId" | "kind"> & {
  submissionId?: string;
};
export function DraftWorkspace({
  preview,
  material,
  name,
  ...props
}: PrivateProps & {
  preview?: MonitoringExercisePreview;
  material?: ObservedMaterial;
  name: string;
}) {
  const data: ReviewData = preview
    ? {
        kind: "programming",
        draft: preview.studentCode === null ? "starter" : "saved",
        review: {
          code: preview.studentCode ?? preview.exercise.starterCode,
          language: "PYTHON",
          problemTitle: preview.exercise.title,
          studentName: name,
          statement: preview.exercise.description,
        },
      }
    : {
        kind: "manual",
        draft: material!.saved ? "saved" : "starter",
        type: material!.type,
        studentName: name,
        title: material!.title,
        description: material!.description,
        includeInScore: material!.includeInScore,
        files: material!.saved?.files ?? material!.files ?? {},
        entryPoint: material!.entryPoint ?? "main.py",
        answer: material!.saved?.answer ?? "",
        question: material!.question,
        choice: null,
      };
  return <ReviewCopy {...props} data={data} />;
}
function ReviewCopy({ data, ...props }: PrivateProps & { data: ReviewData }) {
  const { t } = useTranslation("teach"),
    locale = useLocale();
  const { t: tc } = useLayoutTranslation("courses");
  const { t: mt } = useManualTranslation();
  const { t: tl } = useTranslation("learn");
  const original = React.useMemo(
    () =>
      data.kind === "programming"
        ? { "main.py": data.review.code }
        : data.files,
    [data],
  );
  const [files, setFiles] = React.useState(original),
    [file, setFile] = React.useState(
      data.kind === "programming" ? "main.py" : data.entryPoint,
    );
  const runner = usePythonRunner();
  const [session, setSession] = React.useState<ManualSession | null>(null),
    [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState(""),
    [input, setInput] = React.useState("");
  const [reviewId] = React.useState(() => crypto.randomUUID());
  const current = React.useRef<string | null>(null),
    generation = React.useRef(0);
  const dirty = JSON.stringify(files) !== JSON.stringify(original);
  const turtle = data.kind === "manual" && data.type === "TURTLE_EXERCISE";
  const coding = data.kind === "programming" && !data.review.quiz;
  const noWork = data.draft === "starter";
  const preferences = useEditorPreferences();
  const {
    containerRef: paneRef,
    size: statementWidth,
    dividerProps,
  } = useSplitPane({
    axis: "horizontal",
    initial: turtle ? 32 : 46,
    min: 25,
    max: 70,
  });
  const [outputTab, setOutputTab] = React.useState<"run" | "result">("run");
  const [drawingLayout, setDrawingLayout] = React.useState("below");
  const [drawingShare, setDrawingShare] = React.useState(45);
  const [turtleTab, setTurtleTab] = React.useState("code");
  const {
    containerRef: outputRef,
    size: outputHeight,
    dividerProps: outputDivider,
  } = useSplitPane({ axis: "vertical", initial: 250, min: 150, max: 700 });
  const [panelOpen, setPanelOpen] = React.useState(true);
  const panelId = React.useId();
  const slug = useAcademySlug();
  const target = {
    academyId: props.academyId,
    classId: props.classId,
    membershipId: props.membershipId,
    materialId: props.materialId,
  };
  const curriculum = useQuery({
    queryKey: ["review-curriculum", props.queryScope, target],
    queryFn: () => orpc.monitoring.getStudentCurriculum(target),
    retry: false,
    gcTime: 0,
  });
  const reference = useQuery({
    queryKey: ["review-reference", props.queryScope, target],
    // This public preview is used only for the statement and examples. Its
    // studentCode never enters the editor: that comes from the selected submission.
    queryFn: () => orpc.monitoring.getExercisePreview(target),
    enabled: data.kind === "programming",
    retry: false,
    gcTime: 0,
  });
  const executable =
    turtle ||
    (coding &&
      ["python", "python3"].includes(data.review.language.toLowerCase()));
  const title =
    data.kind === "programming" ? data.review.problemTitle : data.title;
  const student =
    data.kind === "programming" ? data.review.studentName : data.studentName;
  const score = data.kind === "programming" ? data.review.score : data.score;
  const completed =
    data.kind === "programming" ? data.review.accepted : data.completed;
  const maximum = data.kind === "programming" ? 100 : (data.maximum ?? 100);
  const stopPython = runner.stop;
  const stop = React.useCallback(() => {
    generation.current++;
    setBusy(false);
    stopPython();
    if (current.current) {
      const id = current.current;
      current.current = null;
      void manualApi.stopReview(id).catch(() => {});
    }
    setSession(null);
  }, [stopPython]);
  const onRegisterGuard = props.onRegisterGuard;
  React.useEffect(() => {
    onRegisterGuard(() => !dirty || window.confirm(t("history.discard")));
    return () => onRegisterGuard(null);
  }, [dirty, onRegisterGuard, t]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  React.useEffect(() => {
    if (!props.active) {
      generation.current++;
      stopPython();
      if (current.current) {
        const id = current.current;
        current.current = null;
        void manualApi.stopReview(id).catch(() => {});
      }
    }
  }, [props.active, stopPython]);
  React.useEffect(
    () => () => {
      generation.current++;
      if (current.current)
        void manualApi.stopReview(current.current).catch(() => {});
    },
    [],
  );
  const sessionId = session?.id;
  const sessionState = session?.state;
  React.useEffect(() => {
    if (
      !sessionId ||
      !props.active ||
      !["QUEUED", "STARTING", "RUNNING", "WAITING_INPUT"].includes(
        sessionState ?? "",
      )
    )
      return;
    let cancelled = false,
      inFlight = false;
    const id = sessionId;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void manualApi
        .reviewStatus(id)
        .then((next) => {
          if (!cancelled && current.current === id) setSession(next);
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e.message);
            if ([401, 403, 404].includes(e.status)) stop();
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
  }, [sessionId, sessionState, props.active, stop]);
  async function run(stdin?: string) {
    setOutputTab("run");
    setError("");
    if (!turtle) {
      void runner.run(
        files["main.py"] ?? "",
        stdin === undefined ? undefined : { stdin },
      );
      return;
    }
    setBusy(true);
    const request = ++generation.current;
    try {
      if (current.current) await manualApi.stopReview(current.current);
      current.current = null;
      const next = await manualApi.startReview({
        academyId: props.academyId,
        classId: props.classId,
        membershipId: props.membershipId,
        materialId: props.materialId,
        submissionId: props.submissionId,
        kind: "manual",
        reviewId,
        files,
      });
      if (request !== generation.current) {
        void manualApi.stopReview(next.id).catch(() => {});
        return;
      }
      current.current = next.id;
      setSession(next);
    } catch (e) {
      if (request === generation.current)
        setError(e instanceof Error ? e.message : t("history.run_error"));
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  const running = turtle
    ? Boolean(
        session &&
        ["QUEUED", "STARTING", "RUNNING", "WAITING_INPUT"].includes(
          session.state,
        ),
      )
    : runner.running;
  return (
    <section
      className="flex h-full min-h-0 flex-col"
      data-testid="historical-submission"
    >
      <header className="shrink-0 border-b border-border bg-card px-3 py-2.5">
        {props.embedded ? (
          <div
            className="flex flex-wrap items-center gap-3"
            data-testid="embedded-review-header"
          >
            <button
              type="button"
              className={historyAction}
              aria-label={props.backLabel ?? t("history.return_monitoring")}
              onClick={() => {
                stop();
                props.onBack();
              }}
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              className={historyAction}
              aria-label={t("history.materials")}
              aria-expanded={panelOpen}
              onClick={() => setPanelOpen(!panelOpen)}
            >
              <Menu className="size-4" />
            </button>
            <span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-peer-soft font-bold text-peer"
              aria-hidden
            >
              {[...student][0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{student}</p>
              <p className="text-xs text-sub">
                {data.draft
                  ? t(noWork ? "history.no_saved_work" : "history.saved_draft")
                  : formatDateTime(
                      data.kind === "programming"
                        ? data.review.createdAt!
                        : data.createdAt!,
                      locale,
                    )}
              </p>
            </div>
            {score != null ? (
              <span className="rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success">
                {score} / {maximum}
              </span>
            ) : null}
            {noWork ? null : (
              <span className="flex items-center gap-1 rounded-full bg-peer-soft px-2 py-1 text-xs font-semibold text-peer">
                <ShieldCheck className="size-3.5" />
                {t("history.private_badge")}
              </span>
            )}
            {props.headerActions}
          </div>
        ) : (
          <>
            <div className="flex min-w-0 flex-wrap items-center gap-2 md:flex-nowrap">
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink"
                aria-label={props.backLabel ?? t("history.back_history")}
                title={props.backLabel ?? t("history.back_history")}
                onClick={() => {
                  stop();
                  props.onBack();
                }}
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-sub hover:bg-canvas"
                aria-label={t("history.materials")}
                aria-expanded={panelOpen}
                aria-controls={panelId}
                onClick={() => setPanelOpen(!panelOpen)}
              >
                <Menu className="size-4" />
              </button>
              {!props.embedded ? (
                <p className="hidden min-w-0 max-w-xs truncate text-xs font-semibold text-sub lg:block">
                  {reference.data
                    ? `${reference.data.breadcrumb.course.title} › ${reference.data.breadcrumb.lecture.title}`
                    : (curriculum.data?.course.title ?? t("history.title"))}
                </p>
              ) : null}
              <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-peer-soft text-base font-bold text-peer"
                  aria-hidden
                >
                  {[...student][0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{student}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-sub">
                    <History className="size-3" />
                    {t("history.title")}
                  </p>
                </div>
              </div>
              {!noWork ? (
                <span
                  title={t("history.private_hint")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-peer-soft px-3 py-1.5 text-xs font-semibold text-peer"
                >
                  <ShieldCheck className="size-3.5" />
                  {t("history.private_badge")}
                </span>
              ) : null}
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-2.5">
              <div className="min-w-0 flex-1 basis-52">
                <p className="truncate text-xs text-sub">
                  {data.draft
                    ? t(
                        noWork
                          ? "history.no_saved_work"
                          : "history.saved_draft",
                      )
                    : formatDateTime(
                        data.kind === "programming"
                          ? data.review.createdAt!
                          : data.createdAt!,
                        locale,
                      )}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-base font-bold leading-6">
                    {title}
                  </h1>
                  {reference.data ? (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${difficultyStyles[reference.data.exercise.difficulty]}`}
                    >
                      {tc(
                        `exercise.difficulty.${reference.data.exercise.difficulty}`,
                      )}
                    </span>
                  ) : null}
                  {score != null ? (
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${completed ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
                    >
                      {completed ? <CheckCircle2 className="size-3" /> : null}
                      {score} / {maximum}
                    </span>
                  ) : null}
                </div>
              </div>
              {props.headerActions}
            </div>
          </>
        )}
      </header>
      {data.kind === "manual" && data.explanation ? (
        <details className="border-b border-border px-5 py-3">
          <summary className="cursor-pointer text-sm font-semibold">
            {t("history.explanation")}
          </summary>
          <RichTextFrame
            title={t("history.explanation")}
            content={data.explanation}
          />
        </details>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="border-b border-danger/20 bg-danger/5 p-3 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {turtle ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-2 text-xs font-semibold text-brand">
          <ListChecks className="size-4" />
          {mt("teacher_graded").replace(/\s*·\s*$/, "")} ·{" "}
          {mt(
            data.kind === "manual" && data.includeInScore
              ? "included_in_score"
              : "excluded_from_score",
          )}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1">
        <WorkspaceCurriculumNavigator
          context={curriculum.data ?? null}
          displayedMaterialId={props.materialId}
          open={panelOpen}
          panelId={panelId}
          dockAt="lg"
          error={curriculum.isError}
          footer={{
            href:
              routes.academyTeachProgress(slug, props.classId) +
              "?view=students&student=" +
              props.membershipId,
            label: t("history.back_history"),
          }}
          onClose={() => setPanelOpen(false)}
          onRetry={() => void curriculum.refetch()}
          onSelect={(id) => {
            if (id !== props.materialId) props.onSelectMaterial?.(id);
          }}
          disabled={!props.onSelectMaterial}
        />
        <div
          ref={paneRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto lg:flex-row lg:overflow-hidden"
        >
          <div
            className="min-h-40 min-w-0 shrink-0 overflow-auto border-r border-border bg-card lg:min-h-0"
            style={{ flexBasis: `${statementWidth}%` }}
          >
            {data.kind === "programming" && reference.data ? (
              <>
                <GradingNotice exercise={reference.data.exercise} />
                <ExerciseReferencePane
                  key={props.materialId}
                  academyId={props.academyId}
                  exercise={reference.data.exercise}
                  teacher
                  preview
                >
                  <ProblemStatement
                    exercise={reference.data.exercise}
                    revealedHints={reference.data.exercise.hints.length}
                  />
                </ExerciseReferencePane>
              </>
            ) : (
              <div className="p-5">
                <h3 className="mb-4 flex items-center gap-2.5 border-b border-border pb-3 text-xs font-bold uppercase text-sub">
                  <span className="grid size-7 place-items-center rounded-lg bg-peer-soft text-peer">
                    <BookOpen className="size-4" />
                  </span>
                  {t(
                    data.kind === "programming"
                      ? "history.current_instructions"
                      : "history.instructions",
                  )}
                </h3>
                <RichTextFrame
                  title={t("history.instructions")}
                  content={
                    data.kind === "programming"
                      ? (data.review.statement ?? "")
                      : data.description
                  }
                />
                {data.kind === "programming" && reference.isError ? (
                  <HistoryError retry={() => void reference.refetch()} />
                ) : null}
              </div>
            )}
            {data.kind === "programming" && !data.draft ? (
              <details className="m-5 rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {t("history.saved_result")}
                </summary>
                <p className="mt-3 text-sm">
                  {data.review.passedCount ?? 0} / {data.review.totalCount ?? 0}{" "}
                  · {data.review.hiddenPassed ?? 0} /{" "}
                  {data.review.hiddenTotal ?? 0} {t("history.hidden_tests")}
                </p>
                {(data.review.cases ?? [])
                  .filter((c) => c.isSample)
                  .map((c) => (
                    <div key={c.position} className="mt-3 text-xs">
                      <p>{c.outcome}</p>
                      <pre className="whitespace-pre-wrap rounded bg-canvas p-2">
                        {c.actualOutput ?? ""}
                      </pre>
                    </div>
                  ))}
              </details>
            ) : data.kind === "manual" && data.feedback ? (
              <p className="mt-4 whitespace-pre-wrap text-sm text-sub">
                {data.feedback}
              </p>
            ) : null}
          </div>
          <div
            aria-hidden
            className="hidden w-1 shrink-0 cursor-col-resize bg-border hover:bg-brand/40 lg:block"
            {...dividerProps}
          />
          {noWork ? (
            <section
              data-testid="history-no-work"
              className="flex min-h-80 min-w-0 flex-1 flex-col items-center justify-center gap-4 bg-editor-bg p-8 text-center text-white"
            >
              <span className="grid size-16 place-items-center rounded-2xl bg-white/5 text-white/50">
                <FileX2 className="size-8" />
              </span>
              <h2 className="text-lg font-bold">
                {t("history.no_saved_work")}
              </h2>
              <p className="max-w-sm text-sm leading-6 text-white/60">
                {t("history.no_saved_work_hint", { name: student })}
              </p>
            </section>
          ) : coding || turtle ? (
            <div
              ref={outputRef}
              className={
                turtle
                  ? manualStyles.workspace
                  : "flex min-h-96 min-w-0 flex-1 flex-col bg-editor-bg lg:min-h-0"
              }
              data-testid={
                turtle ? "private-turtle-workspace" : "private-coding-workspace"
              }
              data-layout={drawingLayout}
              data-tab={turtleTab}
              style={
                turtle
                  ? ({
                      "--editor-track": `${drawingShare}fr`,
                      "--result-track": `${100 - drawingShare}fr`,
                    } as React.CSSProperties)
                  : undefined
              }
            >
              <div
                className={`${turtle ? manualStyles.files : ""} flex shrink-0 overflow-auto border-b border-white/10 bg-editor-bg`}
              >
                {coding ? (
                  <span className="self-center px-3 py-2 font-mono text-xs text-white/60">
                    {tl("workspace.language_python")}
                  </span>
                ) : null}
                {!coding &&
                  Object.keys(files).map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={name === file}
                      className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs text-white/80 ${name === file ? "border-brand" : "border-transparent"}`}
                      onClick={() => setFile(name)}
                    >
                      <FileCode2 className="size-4" />
                      {name}
                    </button>
                  ))}
                <div className="ml-auto flex items-center px-3">
                  <FontSizeControls {...preferences} />
                </div>
              </div>
              <div className={turtle ? manualStyles.editor : "min-h-36 flex-1"}>
                <Editor
                  beforeMount={registerPaircodeTheme}
                  language={
                    data.kind === "programming"
                      ? data.review.language.toLowerCase()
                      : "python"
                  }
                  theme="paircode-dark"
                  height="100%"
                  value={files[file] ?? ""}
                  onChange={(value) =>
                    setFiles((old) => ({ ...old, [file]: value ?? "" }))
                  }
                  options={{
                    ariaLabel: t("history.private_editor"),
                    readOnly: !props.active,
                    automaticLayout: true,
                    fontFamily: EDITOR_FONT_FAMILY,
                    fontSize: preferences.fontSize,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
              {!turtle ? (
                <div
                  className="hidden h-1 shrink-0 cursor-row-resize bg-border hover:bg-brand/40 lg:block"
                  {...outputDivider}
                />
              ) : null}
              <div
                className={`${turtle ? manualStyles.controls : ""} flex shrink-0 flex-wrap items-center gap-2 border-y border-white/10 bg-editor-bg px-3 py-2`}
              >
                {!turtle ? (
                  <div
                    className="mr-auto flex self-stretch gap-4"
                    role="tablist"
                    aria-label={t("history.output_panels")}
                  >
                    <button
                      role="tab"
                      aria-selected={outputTab === "run"}
                      onClick={() => setOutputTab("run")}
                      className="border-b-2 border-transparent py-1 text-xs font-semibold text-white/60 aria-selected:border-brand aria-selected:text-white"
                    >
                      {t("history.your_run")}
                    </button>
                    {!data.draft ? (
                      <button
                        role="tab"
                        aria-selected={outputTab === "result"}
                        onClick={() => setOutputTab("result")}
                        className="border-b-2 border-transparent py-1 text-xs font-semibold text-white/60 aria-selected:border-peer aria-selected:text-white"
                      >
                        {t("history.saved_result")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {coding
                  ? reference.data?.exercise.sampleTestCases?.map((c, i) => (
                      <button
                        key={c.position}
                        type="button"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 px-2 text-xs font-semibold text-white/80 hover:bg-white/20 disabled:opacity-40"
                        disabled={
                          !props.active ||
                          !executable ||
                          running ||
                          !runner.ready
                        }
                        onClick={() => void run(c.input)}
                      >
                        <Play className="size-3" />
                        {t("history.sample_test", { number: i + 1 })}
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  className={historyPrimaryAction}
                  disabled={
                    !props.active ||
                    !executable ||
                    busy ||
                    running ||
                    (!turtle && !runner.ready)
                  }
                  onClick={() => void run()}
                >
                  <Play className="size-4" />
                  {busy ? t("history.preparing") : t("history.run")}
                </button>
                {running || busy ? (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1 px-2 text-xs text-white/80"
                    onClick={stop}
                  >
                    <Square className="size-3.5" />
                    {t("history.stop")}
                  </button>
                ) : null}
                <button
                  type="button"
                  title={t(
                    data.draft ? "history.reset_draft" : "history.reset",
                  )}
                  aria-label={t(
                    data.draft ? "history.reset_draft" : "history.reset",
                  )}
                  className="grid size-8 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={() => {
                    if (!dirty || window.confirm(t("history.discard"))) {
                      stop();
                      setFiles(original);
                      runner.clear();
                    }
                  }}
                >
                  <RotateCcw className="size-3.5" />
                </button>
              </div>
              {turtle ? (
                <>
                  <div
                    role="tablist"
                    aria-label={t("history.output_panels")}
                    className={`${manualStyles.tabs} flex gap-4 border-b border-border p-2 md:hidden`}
                  >
                    {(["code", "drawing", "terminal"] as const).map((tab) => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={turtleTab === tab}
                        onClick={() => setTurtleTab(tab)}
                      >
                        {t(`history.panel_${tab}`)}
                      </button>
                    ))}
                  </div>
                  <WorkspaceResizeHandle
                    value={drawingShare}
                    onChange={setDrawingShare}
                  />
                  <div className={manualStyles.results}>
                    <section
                      className={`${manualStyles.drawing} bg-card`}
                      aria-label={t("history.panel_drawing")}
                    >
                      {!session ? (
                        <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-border px-3 text-xs font-semibold">
                          <Turtle className="size-4 text-peer" />
                          <span className="mr-auto">
                            {t("history.panel_drawing")}
                          </span>
                          <DrawingLayoutControl
                            value={drawingLayout}
                            onChange={setDrawingLayout}
                          />
                        </div>
                      ) : null}
                      <div className="flex min-h-0 flex-1 flex-col">
                        {session ? (
                          <GuiViewer
                            session={session}
                            onError={setError}
                            layout={drawingLayout}
                            onLayoutChange={setDrawingLayout}
                            onStop={stop}
                          />
                        ) : (
                          <div className="grid min-h-0 flex-1 place-content-center justify-items-center gap-3 p-5 text-center">
                            <span className="grid size-14 place-items-center rounded-2xl bg-peer-soft text-peer">
                              <Turtle className="size-7" />
                            </span>
                            <p className="max-w-56 text-xs leading-5 text-sub">
                              {t("history.drawing_hint")}
                            </p>
                          </div>
                        )}
                      </div>
                    </section>
                    <section
                      className={`${manualStyles.terminal} bg-editor-bg text-white`}
                      aria-label={t("history.panel_terminal")}
                    >
                      <div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3 text-xs font-semibold text-white/65">
                        <Terminal className="size-4" />
                        {t("history.panel_terminal")}
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs text-white/80">
                        {session?.output ?? t("history.code_not_run")}
                      </pre>
                      <form
                        className="flex gap-2 border-t border-white/10 p-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (session && running)
                            void manualApi
                              .reviewInput(session.id, input)
                              .then(() => setInput(""))
                              .catch((e) => setError(e.message));
                        }}
                      >
                        <input
                          aria-label={t("history.terminal_input")}
                          placeholder={t("history.terminal_input")}
                          className="min-w-0 flex-1 bg-transparent px-1 py-2 text-xs outline-none disabled:opacity-40"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          disabled={!running}
                        />
                        <button
                          className="text-xs text-white/70 disabled:opacity-40"
                          disabled={!running}
                        >
                          {t("history.send")}
                        </button>
                      </form>
                    </section>
                  </div>
                </>
              ) : (
                <div
                  className="flex min-h-32 shrink-0 flex-col"
                  style={{ height: outputHeight }}
                >
                  <p className="shrink-0 border-b border-white/10 px-3 py-2 font-mono text-[11px] text-white/45">
                    {t("history.private_hint")}
                  </p>
                  {outputTab === "result" && data.kind === "programming" ? (
                    <div className="min-h-0 flex-1 overflow-auto p-4 text-xs text-white/80">
                      <p>
                        {score ?? "—"} / {maximum}
                      </p>
                      {(data.review.cases ?? [])
                        .filter((c) => c.isSample)
                        .map((c) => (
                          <pre
                            key={c.position}
                            className="mt-3 whitespace-pre-wrap"
                          >
                            {c.outcome}
                            {"\n"}
                            {c.actualOutput}
                          </pre>
                        ))}
                    </div>
                  ) : (
                    <div className="min-h-0 flex-1">
                      <TerminalPanel
                        lines={runner.lines}
                        awaitingInput={runner.awaitingInput}
                        supported={runner.supported}
                        onSubmitInput={runner.submitInput}
                        onEndInput={runner.endInput}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-auto bg-canvas p-5">
              {data.kind === "programming" && data.review.quiz ? (
                <QuizFeedback quiz={data.review.quiz} />
              ) : data.kind === "manual" && data.choice ? (
                <ChoiceOptions
                  definition={{
                    ...data.choice.definition,
                    options: data.choice.displayOrder
                      .map((id) =>
                        data.choice!.definition.options.find(
                          (o) => o.id === id,
                        )!,
                      )
                      .filter(Boolean),
                  }}
                  selected={data.choice.selectedOptionIds}
                  disabled
                  onChange={() => {}}
                  scope={{
                    academyId: props.academyId,
                    materialId: props.materialId,
                    classId: props.classId,
                    submissionId: props.submissionId,
                    preview: true,
                  }}
                />
              ) : data.kind === "manual" ? (
                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-bold">
                    {data.question ?? t("history.answer")}
                  </h3>
                  <p className="mt-4 min-h-36 whitespace-pre-wrap rounded-lg border border-border bg-canvas p-4 text-sm">
                    {data.answer || t("history.empty_answer")}
                  </p>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
