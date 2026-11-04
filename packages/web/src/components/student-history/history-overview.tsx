"use client";
import { useTranslation } from "react-i18next";
import type { HistorySummary } from "@cove/shared";
import { formatDate, formatDateTime } from "@cove/i18n/format";
import { useLocale } from "@/i18n";
import {
  BookOpenCheck,
  Award,
  CalendarDays,
  CheckCircle2,
  Flag,
} from "lucide-react";
import { HistorySelect } from "./history-ui";
import { HistoryCourseProgress } from "./history-course-progress";
export function HistoryStudentOverview({
  data,
  course,
  onCourseChange,
}: {
  data: HistorySummary;
  course: string;
  onCourseChange: (id: string) => void;
}) {
  const { t } = useTranslation("teach"),
    locale = useLocale();
  const complete = data.eligible > 0 && data.completed >= data.eligible;
  const percent = data.eligible
    ? Math.min(100, Math.round((data.completed / data.eligible) * 100))
    : 0;
  return (
    <div className="space-y-7" data-testid="history-student-overview">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="h-1 bg-brand" />
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 basis-60 items-center gap-4">
              <span
                className="grid size-16 shrink-0 place-items-center rounded-full bg-peer-soft text-2xl font-bold text-peer"
                aria-hidden
              >
                {[...data.student.name][0]}
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-extrabold break-words">
                  {data.student.name}
                </h3>
                <p className="mt-1 break-all text-sm text-sub">
                  {data.student.identifier}
                </p>
                <p className="mt-1 text-xs text-sub">{data.className}</p>
              </div>
            </div>
            <HistorySelect
              label={t("history.course")}
              className="w-full sm:w-64"
              value={course}
              onChange={onCourseChange}
              options={[
                { value: "", label: t("history.all_courses") },
                ...data.courses.map((c) => ({ value: c.id, label: c.title })),
              ]}
            />
          </div>
          <dl className="mt-6 flex flex-col overflow-hidden rounded-xl border border-border text-sm sm:flex-row">
            <dt className="flex items-center gap-2 bg-canvas px-4 py-3 font-semibold text-sub sm:w-44 sm:shrink-0">
              <CalendarDays className="size-4 text-brand" />
              {t("history.enrollment_time")}
            </dt>
            <dd className="px-4 py-3" data-testid="history-enrollment">
              {data.enrolledAt ? (
                <>
                  <time dateTime={data.enrolledAt}>
                    {formatDate(data.enrolledAt, locale)}
                  </time>
                  <span className="px-2 text-sub">~</span>
                  {t("history.unlimited")}
                </>
              ) : (
                t("history.not_recorded")
              )}
            </dd>
          </dl>
        </div>
      </section>
      <section
        aria-labelledby="history-completion-heading"
        className="space-y-4"
      >
        <h3
          id="history-completion-heading"
          className="flex items-center gap-2 text-lg font-bold"
        >
          <BookOpenCheck className="size-5 text-brand" />
          {t("history.course_completion")}
        </h3>
        <div
          className={`flex items-start gap-4 rounded-xl border p-5 ${complete ? "border-success/20 bg-success/5" : "border-brand/15 bg-brand-soft/40"}`}
        >
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-full ${complete ? "bg-success/10 text-success" : "bg-brand-soft text-brand"}`}
          >
            {complete ? (
              <CheckCircle2 className="size-6" />
            ) : (
              <Flag className="size-5" />
            )}
          </span>
          <div>
            <p className="font-bold">
              {t(
                complete
                  ? "history.completion_met"
                  : data.eligible
                    ? "history.completion_pending"
                    : "history.no_requirements",
              )}
            </p>
            <p className="mt-1 text-xs leading-5 text-sub">
              {t("history.completion_hint")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-brand/15 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <BookOpenCheck className="size-5 text-brand" />
                {t("history.completion")}
              </span>
              <strong className="text-2xl tabular-nums text-brand">
                {percent}
                <span className="ml-1 text-sm">%</span>
              </strong>
            </div>
            <div
              role="progressbar"
              aria-label={t("history.completion")}
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="mt-4 h-2 overflow-hidden rounded-full bg-brand-soft"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-sub">
              {data.completed} / {data.eligible} ·{" "}
              {t("history.required_exercises")}
            </p>
          </div>
          <div className="rounded-xl border border-success/20 bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Award className="size-5 text-success" />
                {t("history.total_score")}
              </span>
              <strong className="text-2xl tabular-nums text-success">
                {data.evaluatedItems ? data.totalScore : "—"}
              </strong>
            </div>
            <p className="mt-4 text-xs text-sub">
              {data.evaluatedItems
                ? t("history.score_maximum", { maximum: data.maximumScore })
                : t("history.no_evaluated_work")}
            </p>
            <p className="mt-2 text-xs text-sub">
              {t("history.evaluated", { count: data.evaluatedItems })}
            </p>
          </div>
        </div>
      </section>
      <HistoryCourseProgress data={data} />
      <p className="text-[11px] text-sub">
        {t("history.updated")}: {formatDateTime(data.asOf, locale)}
      </p>
    </div>
  );
}
