"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { orpc } from "@/lib/orpc";
import { HistoryError, HistoryPager, historyInput } from "./history-ui";
export function TutorRoster(props: {
  academyId: string;
  classId: string;
  materialId: string;
  queryScope: string;
  selectedId: string;
  onSelect: (student: { membershipId: string; name: string }) => void;
}) {
  const { t } = useTranslation("teach");
  const [search, setSearch] = React.useState(""),
    [q, setQ] = React.useState(""),
    [page, setPage] = React.useState(1),
    [status, setStatus] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    queryKey: [
      "tutoring-roster",
      props.queryScope,
      props.academyId,
      props.classId,
      props.materialId,
      q,
      page,
      status,
    ],
    queryFn: () =>
      orpc.studentWorkHistory.listMaterialStudents({
        academyId: props.academyId,
        classId: props.classId,
        materialId: props.materialId,
        q,
        page,
        submitted: status ? status === "submitted" : undefined,
      }),
    gcTime: 0,
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-border p-4">
        <input
          className={`${historyInput} w-full`}
          aria-label={t("history.search_students")}
          placeholder={t("history.search_students")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ChoiceSelector
          label={t("history.submission_filter")}
          selectedId={status}
          onSelect={(item) => {
            setStatus(item.id);
            setPage(1);
          }}
          list={[
            { id: "", name: t("history.all_students") },
            { id: "submitted", name: t("history.submitted") },
            { id: "not-submitted", name: t("history.not_submitted") },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {query.isError ? (
          <HistoryError retry={() => void query.refetch()} />
        ) : query.isPending ? (
          <p role="status" className="p-4 text-sm text-sub">
            {t("history.loading")}
          </p>
        ) : (
          <ul className="space-y-1">
            {query.data.rows.map((row) => (
              <li key={row.membershipId}>
                <button
                  type="button"
                  aria-pressed={row.membershipId === props.selectedId}
                  onClick={() => props.onSelect(row)}
                  className={`flex w-full items-start gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${row.membershipId === props.selectedId ? "bg-brand-soft" : "hover:bg-canvas"}`}
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-peer-soft text-sm font-bold text-peer">
                    {[...row.name][0]}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {row.name}
                    </span>
                    <span className="block truncate text-xs text-sub">
                      {row.identifier}
                    </span>
                    <span
                      className={`mt-2 inline-block rounded-md px-2 py-1 text-[11px] font-semibold ${row.submissions ? "bg-success/10 text-success" : "bg-canvas text-sub"}`}
                    >
                      {t(
                        row.submissions
                          ? "history.submitted"
                          : "history.not_submitted",
                      )}
                    </span>
                    {row.score !== null ? (
                      <span className="ml-2 text-xs text-sub">
                        {row.score} / {row.maximum}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.data?.rows.length === 0 ? (
          <p className="p-4 text-sm text-sub">{t("history.no_students")}</p>
        ) : null}
      </div>
      <HistoryPager pagination={query.data?.pagination} onPage={setPage} />
    </>
  );
}
