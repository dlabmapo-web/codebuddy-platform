"use client";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { useTranslation } from "react-i18next";
export const historyAction =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-ink outline-none hover:border-brand/40 hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-40";
export const historyInput =
  "h-9 min-w-0 rounded-lg border border-border bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
export const historyPrimaryAction = historyAction
  .replace("bg-card", "bg-brand")
  .replace("text-ink", "text-white")
  .replace("hover:text-brand", "hover:bg-brand/90");
export function HistoryPager({
  pagination,
  onPage,
}: {
  pagination?: { page: number; pageCount: number; totalCount: number };
  onPage: (page: number) => void;
}) {
  const { t } = useTranslation("teach");
  if (!pagination || pagination.pageCount < 2) return null;
  return (
    <nav
      aria-label={t("history.pages")}
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-sub"
    >
      <button
        type="button"
        className={historyAction}
        disabled={pagination.page <= 1}
        aria-label={t("history.previous")}
        onClick={() => onPage(pagination.page - 1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span>
        {pagination.page} / {pagination.pageCount} · {pagination.totalCount}
      </span>
      <button
        type="button"
        className={historyAction}
        disabled={pagination.page >= pagination.pageCount}
        aria-label={t("history.next")}
        onClick={() => onPage(pagination.page + 1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
}
export function HistoryError({ retry }: { retry: () => void }) {
  const { t } = useTranslation("teach");
  return (
    <div role="alert" className="p-5 text-sm">
      <p>{t("history.error")}</p>
      <button type="button" className={`${historyAction} mt-3`} onClick={retry}>
        <RefreshCw className="size-4" />
        {t("history.retry")}
      </button>
    </div>
  );
}

/** Use the existing Studio selector for history filters, including keyboard/touch behavior. */
export function HistorySelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}) {
  return (
    <ChoiceSelector
      label={label}
      selectedId={value}
      onSelect={(item) => onChange(item.id)}
      list={options.map((item) => ({ id: item.value, name: item.label }))}
      className={className}
    />
  );
}
