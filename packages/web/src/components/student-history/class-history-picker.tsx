"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowRight, Search, Users, History, BookOpen } from "lucide-react";
import { orpc } from "@/lib/orpc";
import { routes } from "@/lib/routes";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { historyInput, HistoryError, HistoryPager } from "./history-ui";
export function ClassHistoryPicker({ academyId }: { academyId: string }) {
  const { t } = useTranslation("teach"),
    slug = useAcademySlug(),
    [q, setQ] = React.useState(""),
    [settled, setSettled] = React.useState(""),
    [page, setPage] = React.useState(1),
    [nonce] = React.useState(() => crypto.randomUUID());
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);
  const query = useQuery({
    queryKey: ["student-history", nonce, "classes", academyId, settled, page],
    queryFn: () =>
      orpc.studentWorkHistory.listClasses({ academyId, q: settled, page }),
    retry: false,
    gcTime: 0,
  });
  return (
    <div data-testid="history-class-picker" className="space-y-5">
      <label className="flex max-w-lg items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-sm">
        <Search className="size-4 text-sub" />
        <input
          className={`${historyInput} h-12 flex-1 border-0 bg-transparent px-0`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("history.search_classes")}
          aria-label={t("history.search_classes")}
        />
      </label>
      <div className="flex items-center gap-2 text-xs font-semibold text-sub">
        <BookOpen className="size-4 text-brand" />
        {t("history.classes_count", {
          count: query.data?.pagination.totalCount ?? 0,
        })}
      </div>
      {query.isError ? (
        <HistoryError retry={() => void query.refetch()} />
      ) : query.isPending ? (
        <p role="status">{t("history.loading")}</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.rows.map((c, index) => (
            <li key={c.id}>
              <Link
                href={`${routes.academyTeachProgress(slug, c.id)}?view=students`}
                className="group flex h-full min-h-48 flex-col items-start rounded-2xl border border-border bg-card p-5 shadow-sm outline-none transition-colors hover:border-brand/40 hover:bg-brand-soft/20 focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                <span
                  className={`mb-4 grid size-11 place-items-center rounded-xl ${["bg-brand-soft text-brand", "bg-peer-soft text-peer", "bg-success/10 text-success", "bg-warning/10 text-warning"][index % 4]}`}
                >
                  <Users aria-hidden className="size-5" />
                </span>
                <span className="mb-4 line-clamp-2 flex-1 text-base font-bold leading-6">
                  {c.title}
                </span>
                <span className="mt-auto flex w-full items-center justify-between border-t border-border pt-3 text-xs font-semibold text-brand">
                  <span className="flex items-center gap-2">
                    <History className="size-4" />
                    {t("history.open_history")}
                  </span>
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {query.data?.rows.length === 0 ? (
        <p className="p-5 text-sm text-sub">{t("history.no_classes")}</p>
      ) : null}
      <HistoryPager pagination={query.data?.pagination} onPage={setPage} />
    </div>
  );
}
