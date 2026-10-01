"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { LearnExerciseBootstrap } from "@cove/shared";
import { RichTextFrame } from "@/components/studio/rich-text-frame";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { WorkspaceCurriculumNavigator } from "@/components/workspace/curriculum-navigator";
import { useStudentPresence } from "@/lib/monitoring/student-presence";
import { routes } from "@/lib/routes";
import { useDraftAutosave } from "../_hooks/use-draft-autosave";
import { useSolveSession } from "../_hooks/use-solve-session";
import { useSubmission } from "../_hooks/use-submission";
import { WorkspaceHeader } from "./workspace-header";

export function QuizWorkspace({
  academyId,
  bootstrap,
  classId,
  userId,
  returnTo,
}: {
  academyId: string;
  bootstrap: LearnExerciseBootstrap;
  classId: string;
  userId: string;
  returnTo: string | null;
}) {
  const { t } = useTranslation("quiz");
  const router = useRouter();
  const slug = useAcademySlug();
  const { workspace, selectedSubmission } = bootstrap;
  const { exercise } = workspace;
  const session = useSolveSession({
    academyId,
    classId,
    materialId: exercise.materialId,
  });
  const draft = useDraftAutosave({
    academyId,
    classId,
    userId,
    materialId: exercise.materialId,
    serverDraft: workspace.draft,
    starterCode: "",
    historicalCode: selectedSubmission?.code ?? null,
  });
  const submission = useSubmission({
    academyId,
    classId,
    materialId: exercise.materialId,
    solveSessionId: session.solveSessionId,
    reopenSolveSession: session.reopen,
    initialResult: selectedSubmission?.result ?? null,
  });
  const [dismissedResult, setDismissedResult] = React.useState<string | null>(
    null,
  );
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const presence = useStudentPresence();
  const { markActive, setOpenMaterial } = presence;
  React.useEffect(() => {
    setOpenMaterial({
      classId,
      courseId: workspace.breadcrumb.course.id,
      materialId: exercise.materialId,
    });
    markActive();
    return () => setOpenMaterial(null);
  }, [
    classId,
    exercise.materialId,
    markActive,
    setOpenMaterial,
    workspace.breadcrumb.course.id,
  ]);
  const result =
    submission.result?.submissionId !== dismissedResult
      ? submission.result
      : null;
  const feedback = result?.quiz;
  const choices = feedback?.choices ?? exercise.quiz?.choices ?? [];
  const answer = feedback?.selectedChoiceId ?? draft.code;
  const coursePath =
    returnTo ??
    `${routes.academy(slug)}/learn/courses/${workspace.breadcrumb.course.id}`;
  async function navigate(materialId: string) {
    if (submission.submitting) return;
    await draft.flushWithoutPromoting();
    router.push(routes.academyLearnExercise(slug, materialId, { classId }));
  }
  return (
    <div
      className="flex h-dvh flex-col bg-canvas text-ink"
      onPointerDown={markActive}
      onKeyDown={markActive}
    >
      <WorkspaceHeader
        workspace={workspace}
        saveState={draft.saveState}
        reviewing={selectedSubmission}
        solveStartedAt={session.startedAt}
        curriculum={
          <button
            type="button"
            aria-expanded={outlineOpen}
            aria-controls="quiz-outline"
            className="rounded-lg border border-border px-3 py-2"
            onClick={() => setOutlineOpen(!outlineOpen)}
          >
            {t("menu")}
          </button>
        }
      />
      <WorkspaceCurriculumNavigator
        context={bootstrap.navigator}
        displayedMaterialId={exercise.materialId}
        disabled={submission.submitting}
        busyMaterialId={null}
        error={false}
        footer={{ href: coursePath, label: t("course") }}
        onClose={() => setOutlineOpen(false)}
        onRetry={() => router.refresh()}
        onSelect={(id) => void navigate(id)}
        open={outlineOpen}
        panelId="quiz-outline"
      />
      <main className="min-h-0 flex-1 overflow-auto p-5">
        <div className="mx-auto max-w-3xl space-y-5 rounded-xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold">
            {feedback?.title ?? exercise.title}
          </h2>
          <RichTextFrame
            title={exercise.title}
            content={feedback?.description ?? exercise.description}
            padding={0}
            minHeight={24}
          />
          <fieldset
            disabled={submission.submitting || Boolean(feedback)}
            className="space-y-3"
          >
            <legend className="mb-3 text-sm text-sub">{t("select")}</legend>
            {choices.map((choice) => (
              <label
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-canvas p-4"
                key={choice.id}
              >
                <input
                  className="mt-1"
                  type="radio"
                  name="quiz-answer"
                  value={choice.id}
                  checked={answer === choice.id}
                  onChange={() => draft.setCode(choice.id)}
                />
                <span className="whitespace-pre-wrap break-words font-mono text-sm">
                  {choice.text}
                </span>
              </label>
            ))}
          </fieldset>
          {feedback ? (
            <section
              aria-live="polite"
              className="space-y-2 rounded-lg border border-border p-4"
            >
              <p
                className={
                  result?.status === "PASSED"
                    ? "font-bold text-success"
                    : "font-bold text-danger"
                }
              >
                {t(result?.status === "PASSED" ? "correct" : "incorrect")}
              </p>
              <p>{t("score", { score: result?.score ?? 0 })}</p>
              <p>
                {t("correct_choice", {
                  number:
                    choices.findIndex(
                      (choice) => choice.id === feedback.correctChoiceId,
                    ) + 1,
                })}
              </p>
              {feedback.explanation ? (
                <p className="whitespace-pre-wrap">{feedback.explanation}</p>
              ) : null}
              <button
                type="button"
                className="rounded-lg border border-border px-4 py-2"
                onClick={() => {
                  setDismissedResult(result!.submissionId);
                  draft.resetTo("");
                }}
              >
                {t("retry")}
              </button>
            </section>
          ) : (
            <button
              type="button"
              className="rounded-lg bg-brand px-5 py-2 text-white disabled:opacity-50"
              disabled={
                submission.submitting ||
                !choices.some((choice) => choice.id === draft.code)
              }
              onClick={() => {
                void draft.flushNow();
                void submission.submit(draft.code);
              }}
            >
              {t(submission.submitting ? "submitting" : "submit")}
            </button>
          )}
          {submission.error ||
          result?.status === "ERRORED" ||
          result?.status === "CANCELLED" ? (
            <p role="alert" className="text-danger">
              {t("error")}
            </p>
          ) : null}
        </div>
      </main>
      <footer className="flex justify-center gap-5 border-t border-border bg-card p-3">
        <button
          type="button"
          disabled={!workspace.neighbors.previous || submission.submitting}
          onClick={() =>
            workspace.neighbors.previous &&
            void navigate(workspace.neighbors.previous.materialId)
          }
        >
          {t("previous")}
        </button>
        <button
          type="button"
          disabled={!workspace.neighbors.next || submission.submitting}
          onClick={() =>
            workspace.neighbors.next &&
            void navigate(workspace.neighbors.next.materialId)
          }
        >
          {t("next")}
        </button>
      </footer>
    </div>
  );
}
