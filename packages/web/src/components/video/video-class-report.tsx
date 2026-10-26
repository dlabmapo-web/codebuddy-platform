"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
} from "lucide-react";
import type { VideoReportQuery } from "@cove/shared";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { Input } from "@/components/studio/primitives";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { videoApi } from "@/lib/video-api";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useVideoTranslation } from "./use-video-translation";
import { videoActionClass } from "./video-author-section";
import { videoTime } from "./video-progress-format";
import {
  VideoViewingStatusBadge,
  VideoWatchedBar,
} from "./video-viewing-progress";

export function VideoClassViewingReport({
  academyId,
  materialId,
  classId,
}: {
  academyId: string;
  materialId: string;
  classId: string;
}) {
  const { t, i18n } = useVideoTranslation();
  const slug = useAcademySlug();
  const [draft, setDraft] = useState("");
  const [filter, setFilter] = useState<
    Pick<VideoReportQuery, "page" | "search" | "status">
  >({ page: 1, search: "", status: "ALL" });
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setFilter((value) =>
          value.search === draft ? value : { ...value, search: draft, page: 1 },
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [draft]);
  const query = useQuery({
    queryKey: ["video-class-report", academyId, materialId, classId, filter],
    queryFn: () =>
      videoApi.report({ academyId, materialId, classId, ...filter }),
    placeholderData: (previous) =>
      previous?.class.id === classId && previous.material.id === materialId
        ? previous
        : undefined,
    refetchInterval: 10000,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const report = query.isError ? undefined : query.data;
  const accessDenied =
    query.isError &&
    [401, 403, 404].includes((query.error as { status?: number }).status ?? 0);
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const statuses: Array<{ id: VideoReportQuery["status"]; name: string }> = [
    { id: "ALL", name: t("all_viewing_states") },
    { id: "NOT_STARTED", name: t("viewing_not_started") },
    { id: "IN_PROGRESS", name: t("viewing_in_progress") },
    { id: "COMPLETED", name: t("completed") },
  ];
  return (
    <main className="min-h-dvh bg-canvas p-4 text-ink sm:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          className="inline-flex items-center gap-2 text-sm font-medium text-sub hover:text-brand"
          href={routes.academyTeachClass(slug, classId)}
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("back_to_class")}
        </Link>
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-sub">
              {report
                ? `${report.class.name} · ${report.course.title}`
                : t("history")}
            </p>
            <h1 className="text-2xl font-bold tracking-tight">
              {t("class_viewing_report")}
            </h1>
            {report ? (
              <p className="mt-2 text-sm text-sub">
                {report.material.title} <span className="mx-1">·</span>{" "}
                {videoTime(report.material.durationMs / 1000)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className={videoActionClass}
              href={routes.academyLearnVideo(slug, materialId, { classId })}
            >
              {t("open_video")}
            </Link>
            <button
              type="button"
              className={videoActionClass}
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                aria-hidden
                className={cn(
                  "size-4",
                  query.isFetching && "animate-spin motion-reduce:animate-none",
                )}
              />
              {t("refresh_report")}
            </button>
          </div>
        </header>
        {query.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-danger/20 bg-card p-5 text-sm text-danger"
          >
            {t(accessDenied ? "report_access_denied" : "report_unavailable")}{" "}
            <button
              className="ml-2 font-semibold underline"
              onClick={() => void query.refetch()}
            >
              {t("retry")}
            </button>
          </div>
        ) : null}
        {!report && query.isPending ? (
          <p
            role="status"
            className="rounded-xl border border-border bg-card p-6 text-sm text-sub"
          >
            {t("loading_report")}
          </p>
        ) : null}
        {report ? (
          <>
            <section
              aria-label={t("class_summary")}
              className="grid grid-cols-2 gap-3 lg:grid-cols-4"
            >
              {[
                {
                  label: t("total_students"),
                  value: report.summary.students,
                  color: "text-ink",
                },
                {
                  label: t("viewing_not_started"),
                  value: report.summary.notStarted,
                  color: "text-sub",
                },
                {
                  label: t("viewing_in_progress"),
                  value: report.summary.inProgress,
                  color: "text-brand",
                },
                {
                  label: t("completed"),
                  value: report.summary.completed,
                  color: "text-success",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-card p-5"
                >
                  <p className="text-xs font-medium text-sub">{item.label}</p>
                  <p
                    className={cn(
                      "mt-2 text-3xl font-bold tabular-nums",
                      item.color,
                    )}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </section>
            <section
              className="overflow-hidden rounded-xl border border-border bg-card"
              aria-label={t("learner_viewing_details")}
            >
              <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
                <label className="relative min-w-48 flex-1">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-3 size-4 text-sub"
                  />
                  <Input
                    aria-label={t("search_students")}
                    className="pl-9"
                    value={draft}
                    maxLength={128}
                    placeholder={t("search_students")}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </label>
                <div className="w-full sm:w-48">
                  <ChoiceSelector
                    label={t("filter_viewing_status")}
                    list={statuses}
                    selectedId={filter.status}
                    onSelect={(item) =>
                      setFilter((value) => ({
                        ...value,
                        page: 1,
                        status: item.id,
                      }))
                    }
                    className="h-10"
                  />
                </div>
              </div>
              <div
                className={cn(
                  "overflow-x-auto",
                  query.isPlaceholderData && "opacity-60",
                )}
                aria-busy={query.isFetching}
              >
                <table className="w-full min-w-[780px] text-left text-sm">
                  <caption className="sr-only">
                    {t("learner_viewing_details")}
                  </caption>
                  <thead className="border-b border-border bg-surface text-xs text-sub">
                    <tr>
                      {[
                        t("learner"),
                        t("viewing_status"),
                        t("watch_percent"),
                        t("watched_duration"),
                        t("last_position"),
                        t("last_recorded"),
                      ].map((heading) => (
                        <th
                          key={heading}
                          scope="col"
                          className="whitespace-nowrap px-5 py-3 font-semibold"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.rows.map((row) => (
                      <tr key={row.userId} className="hover:bg-canvas/50">
                        <th
                          scope="row"
                          className="max-w-60 break-words px-5 py-4 font-semibold"
                        >
                          {row.learnerName || t("learner")}
                        </th>
                        <td className="px-5 py-4">
                          <VideoViewingStatusBadge status={row.status} />
                        </td>
                        <td className="px-5 py-4">
                          <VideoWatchedBar
                            watchedMs={row.watchedMs}
                            durationMs={report.material.durationMs}
                          />
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs tabular-nums">
                          {videoTime(row.watchedMs / 1000)}{" "}
                          <span className="text-sub">
                            / {videoTime(report.material.durationMs / 1000)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs tabular-nums text-sub">
                          {row.positionMs === null
                            ? "—"
                            : videoTime(row.positionMs / 1000)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs text-sub">
                          {row.updatedAt ? formatDate(row.updatedAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!report.rows.length ? (
                  <p role="status" className="p-8 text-center text-sm text-sub">
                    {t(
                      report.summary.students
                        ? "no_matching_students"
                        : "empty_roster",
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-sub">
                <p>
                  {t("report_results", {
                    start: report.filteredCount
                      ? (report.page - 1) * report.pageSize + 1
                      : 0,
                    end: Math.min(
                      report.page * report.pageSize,
                      report.filteredCount,
                    ),
                    total: report.filteredCount,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className={videoActionClass}
                    disabled={query.isPlaceholderData || report.page <= 1}
                    onClick={() =>
                      setFilter((value) => ({
                        ...value,
                        page: report.page - 1,
                      }))
                    }
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                    {t("previous")}
                  </button>
                  <button
                    className={videoActionClass}
                    disabled={
                      query.isPlaceholderData ||
                      report.page * report.pageSize >= report.filteredCount
                    }
                    onClick={() =>
                      setFilter((value) => ({
                        ...value,
                        page: report.page + 1,
                      }))
                    }
                  >
                    {t("next")}
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </section>
            <div className="flex flex-wrap justify-between gap-3 text-xs leading-5 text-sub">
              <p className="max-w-2xl">{t("unique_time_explanation")}</p>
              <p>
                {t("report_updated", { time: formatDate(report.updatedAt) })}
              </p>
            </div>
            {!report.trackingAvailable ? (
              <p className="text-sm text-sub">{t("tracking_disabled")}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
