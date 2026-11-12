"use client";
import {
  BookOpen,
  FileText,
  Code2,
  Turtle,
  ListChecks,
  Video,
  PenLine,
  ArrowUpRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@cove/i18n/format";
import { useLocale } from "@/i18n";
import type { HistoryMaterial } from "@cove/shared";
import { HistoryStatus } from "./history-status";
import { historyAction } from "./history-ui";
export function HistoryMaterialGroups({
  materials,
  onSelect,
  onOpenMaterial,
}: {
  materials: HistoryMaterial[];
  onSelect: (id: string) => void;
  onOpenMaterial: (material: HistoryMaterial) => void;
}) {
  const { t } = useTranslation("teach");
  const locale = useLocale();
  const groups = Map.groupBy(
    materials,
    (r) => `${r.courseId}:${r.moduleId}:${r.lectureId}`,
  );
  return (
    <>
      {Array.from(groups.entries()).map(([group, rows]) => (
        <section
          key={group}
          className="mb-5 overflow-hidden rounded-xl border border-border bg-card"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border bg-canvas/50 px-4 py-3">
            <div>
              <p className="text-[11px] text-sub">
                {rows[0].courseTitle} › {rows[0].moduleTitle}
              </p>
              <h4 className="mt-1 text-sm font-bold">{rows[0].lectureTitle}</h4>
            </div>
            <span className="flex items-center gap-2 text-xs font-semibold text-brand">
              <BookOpen className="size-4 shrink-0" />
              {rows[0].lectureCompleted} / {rows[0].lectureEligible}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-[11px] text-sub">
                <tr>
                  <th className="p-3">{t("history.material")}</th>
                  <th className="p-3">{t("history.status")}</th>
                  <th className="hidden p-3 sm:table-cell">
                    {t("history.submissions")}
                  </th>
                  <th className="p-3">{t("history.score")}</th>
                  <th className="p-3">
                    <span className="sr-only">{t("history.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.materialId}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-brand-soft/15"
                  >
                    <td className="p-3">
                      <span className="flex items-start gap-2">
                        <MaterialTypeIcon type={row.type} />
                        <span>
                          <button
                            type="button"
                            className="block text-left font-semibold hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                            onClick={() =>
                              ["PDF_DOCUMENT", "VIDEO_LESSON"].includes(
                                row.type,
                              )
                                ? onOpenMaterial(row)
                                : onSelect(row.materialId)
                            }
                          >
                            {row.title}
                          </button>
                          <span className="text-[11px] text-sub">
                            {t(`history.types.${row.type}`)}
                            {!row.required ? ` · ${t("history.optional")}` : ""}
                            {!row.includedInScore
                              ? ` · ${t("history.excluded")}`
                              : ""}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      <HistoryStatus status={row.status} manualReview={row.manualReview} />
                      {row.type === "PDF_DOCUMENT" ? (
                        <span className="mt-1 block text-[11px] text-sub">
                          {t("history.pdf_unrecorded")}
                        </span>
                      ) : row.watchedMs !== null ? (
                        <span className="block text-[11px] text-sub">
                          {t("history.watched", {
                            minutes: Math.floor(row.watchedMs / 60000),
                          })}
                        </span>
                      ) : null}
                    </td>
                    <td className="hidden p-3 font-mono text-xs sm:table-cell">
                      {row.submissions}
                      {row.latestAt ? (
                        <span className="mt-1 block font-sans text-[11px] text-sub">
                          {formatDateTime(row.latestAt, locale)}
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {row.score === null
                        ? "—"
                        : `${row.score} / ${row.maximum}`}
                    </td>
                    <td className="p-3">
                      {["PDF_DOCUMENT", "VIDEO_LESSON"].includes(row.type) ? (
                        <button
                          type="button"
                          className={historyAction}
                          onClick={() => onOpenMaterial(row)}
                        >
                          {t("history.open_material")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={historyAction}
                          onClick={() => onSelect(row.materialId)}
                        >
                          {t("history.open_work")}
                          <ArrowUpRight className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

function MaterialTypeIcon({ type }: { type: HistoryMaterial["type"] }) {
  const Icon = {
    EXPLANATION: BookOpen,
    PROGRAMMING_EXERCISE: Code2,
    TURTLE_EXERCISE: Turtle,
    MULTIPLE_CHOICE: ListChecks,
    WRITTEN_RESPONSE: PenLine,
    PDF_DOCUMENT: FileText,
    VIDEO_LESSON: Video,
  }[type];
  const colors = {
    EXPLANATION: "bg-brand-soft text-brand",
    PROGRAMMING_EXERCISE: "bg-brand-soft text-brand",
    TURTLE_EXERCISE: "bg-peer-soft text-peer",
    MULTIPLE_CHOICE: "bg-success/10 text-success",
    WRITTEN_RESPONSE: "bg-warning/10 text-warning",
    PDF_DOCUMENT: "bg-danger/10 text-danger",
    VIDEO_LESSON: "bg-brand-soft text-brand",
  };
  return (
    <span
      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg ${colors[type]}`}
    >
      <Icon aria-hidden className="size-4" />
    </span>
  );
}
