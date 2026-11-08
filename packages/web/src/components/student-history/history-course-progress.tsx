"use client";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { formatShortDate } from "@cove/i18n/format";
import type { HistorySummary } from "@cove/shared";
import { useLocale } from "@/i18n";
import { TrendingUp, Clock3, Send, Award, BookOpen } from "lucide-react";
export function HistoryCourseProgress({ data }: { data: HistorySummary }) {
  const { t } = useTranslation("teach"),
    locale = useLocale();
  const chartId = React.useId();
  const days = data.learningDays;
  const max = Math.max(1, ...days.map((d) => d.activeSeconds / 60));
  const points = days
    .map(
      (d, i) =>
        `${36 + (i / Math.max(1, days.length - 1)) * 564},${152 - (d.activeSeconds / 60 / max) * 122}`,
    )
    .join(" ");
  const short = (date: string) => formatShortDate(date + "T12:00:00Z", locale);
  return (
    <section
      aria-labelledby="history-course-progress-heading"
      className="space-y-4"
    >
      <h3
        id="history-course-progress-heading"
        className="flex items-center gap-2 text-lg font-bold"
      >
        <TrendingUp className="size-5 text-brand" />
        {t("history.course_progress")}
      </h3>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-bold">
              <Clock3 className="size-4 text-brand" />
              {t("history.daily_time")}
            </h4>
            <p className="mt-1 text-xs text-sub">{t("history.last_14_days")}</p>
          </div>
          <svg
            viewBox="0 0 620 180"
            className="w-full text-brand"
            role="img"
            aria-labelledby={chartId}
          >
            <title id={chartId}>{t("history.daily_time")}</title>
            {[30, 91, 152].map((y, i) => (
              <g key={y}>
                <line
                  x1="36"
                  x2="600"
                  y1={y}
                  y2={y}
                  className="stroke-border"
                />
                <text
                  x="28"
                  y={y + 4}
                  textAnchor="end"
                  className="fill-sub text-[10px]"
                >
                  {Number(((max * (2 - i)) / 2).toFixed(1))}
                </text>
              </g>
            ))}
            {days.length ? (
              <>
                <polygon
                  points={`36,152 ${points} 600,152`}
                  fill="currentColor"
                  opacity="0.07"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                {days.map((d, i) => (
                  <circle
                    key={d.date}
                    cx={36 + (i / Math.max(1, days.length - 1)) * 564}
                    cy={152 - (d.activeSeconds / 60 / max) * 122}
                    r="3.5"
                    fill="currentColor"
                  >
                    <title>
                      {short(d.date)} ·{" "}
                      {t("history.minutes", {
                        count: Math.round(d.activeSeconds / 60),
                      })}
                    </title>
                  </circle>
                ))}
              </>
            ) : null}
            {days
              .filter((_, i) => i === 0 || i === days.length - 1)
              .map((d, i) => (
                <text
                  key={d.date}
                  x={i ? 600 : 36}
                  y="175"
                  textAnchor={i ? "end" : "start"}
                  className="fill-sub text-[10px]"
                >
                  {short(d.date)}
                </text>
              ))}
          </svg>
          <details className="text-xs text-sub">
            <summary className="cursor-pointer font-semibold">
              {t("history.view_daily_time")}
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
              {days.map((d) => (
                <div
                  key={d.date}
                  className="flex flex-wrap justify-between gap-2"
                >
                  <dt>{short(d.date)}</dt>
                  <dd>
                    {t("history.minutes", {
                      count: Math.round(d.activeSeconds / 60),
                    })}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <div className="space-y-4 border-t border-border pt-4">
            <h4 className="flex items-center gap-2 text-sm font-bold">
              <BookOpen className="size-4 text-peer" />
              {t("history.progress_by_course")}
            </h4>
            {data.courseProgress.map((c) => (
              <div key={c.id}>
                <div className="mb-2 flex justify-between gap-3 text-xs">
                  <span className="font-semibold">{c.title}</span>
                  <span className="shrink-0 tabular-nums text-brand">
                    {c.completed} / {c.eligible}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-brand-soft">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${c.eligible ? Math.min(100, (c.completed / c.eligible) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <dl className="divide-y divide-border self-start overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold text-sub">
              <Award className="size-4 text-success" />
              {t("history.average")}
            </dt>
            <dd className="mt-3 text-3xl font-bold tabular-nums text-success">
              {data.averageScore == null
                ? "—"
                : `${Math.round(data.averageScore)}%`}
            </dd>
          </div>
          <div className="p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold text-sub">
              <Clock3 className="size-4 text-warning" />
              {t("history.time")}
            </dt>
            <dd className="mt-3 text-2xl font-bold tabular-nums">
              {data.firstRecordedAt
                ? `${Math.floor(data.activeSeconds / 3600)}h ${Math.floor((data.activeSeconds % 3600) / 60)}m`
                : "—"}
            </dd>
            <p className="mt-2 text-[11px] leading-4 text-sub">
              {t("history.time_hint")}
            </p>
          </div>
          <div className="p-5">
            <dt className="flex items-center gap-2 text-xs font-semibold text-sub">
              <Send className="size-4 text-peer" />
              {t("history.submissions")}
            </dt>
            <dd className="mt-3 text-2xl font-bold tabular-nums">
              {data.programmingSubmissions + data.manualSubmissions}
            </dd>
            <p className="mt-2 text-[11px] leading-4 text-sub">
              {t("history.submissions_breakdown", {
                coding: data.programmingSubmissions,
                manual: data.manualSubmissions,
              })}
            </p>
          </div>
        </dl>
      </div>
    </section>
  );
}
