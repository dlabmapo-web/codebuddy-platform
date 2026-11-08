"use client";

import { useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MonitoringPublicExercise } from "@cove/shared";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { createContentPaths } from "@/components/studio/content-paths";
import { HistoryPresentationContext } from "@/lib/monitoring/history-presentation";

/** Authoring targets the displayed problem, independently of the student's live location. */
export function MonitoringProblemEditLink({
  canEdit,
  exercise,
}: {
  canEdit: boolean;
  exercise: MonitoringPublicExercise | null;
}) {
  const slug = useAcademySlug();
  const router = useRouter();
  const history = useContext(HistoryPresentationContext);
  const { t } = useTranslation("monitoring");
  if (!canEdit || !exercise) return null;
  const href = createContentPaths(slug, "academy").exercise(
    exercise.breadcrumb.course.id,
    exercise.breadcrumb.lecture.id,
    exercise.exercise.materialId,
  );
  return (
    <Link
      href={href}
      prefetch={false}
      data-monitoring-class-exit
      data-tutoring-navigation
      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-ink outline-none hover:border-brand/40 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40"
      onClick={async (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        if (history?.beforeNavigate && !(await history.beforeNavigate()))
          return;
        router.push(href);
      }}
    >
      <Pencil aria-hidden className="size-4" />
      {t("workspace.edit_problem")}
    </Link>
  );
}
