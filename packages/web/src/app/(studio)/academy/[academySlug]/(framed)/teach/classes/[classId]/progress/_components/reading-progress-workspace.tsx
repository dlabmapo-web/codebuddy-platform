"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ReadingProgressResult, ReadingMaterialRow } from "@cove/shared";
import { formatDateTime } from "@cove/i18n/format";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Film,
  FileText,
  ListChecks,
  PenLine,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { orpc } from "@/lib/orpc";
import { useLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { routes } from "@/lib/routes";
import {
  DataGrid,
  EmptyState,
  Meter,
  Pager,
  Panel,
  RegionError,
  RegionLoading,
  Td,
  Th,
} from "./progress-primitives";

type Lens = "students" | "curriculum";
const searchField =
  "h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-[13.5px] text-ink outline-none placeholder:text-sub focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20";
/** The same type tiles the lesson navigator uses, so a material reads alike in both. */
const typeMark = {
  EXPLANATION: { Icon: BookOpen, tone: "bg-brand-soft text-brand" },
  PDF_DOCUMENT: { Icon: FileText, tone: "bg-danger/10 text-danger" },
  MULTIPLE_CHOICE: { Icon: ListChecks, tone: "bg-success/10 text-success" },
  VIDEO_LESSON: { Icon: Film, tone: "bg-brand-soft text-brand" },
  WRITTEN_RESPONSE: { Icon: PenLine, tone: "bg-success/10 text-success" },
} as const;
/** Opened is all a text page or PDF asks; every other kind is completed. */
const isReading = (type: ReadingMaterialRow["type"]) =>
  type === "EXPLANATION" || type === "PDF_DOCUMENT";
const percent = (done: number, total: number) =>
  total ? Math.round((done / total) * 100) : 0;

/**
 * Class progress for a web course: who has opened which material.
 *
 * The same two lenses as the coding report, summary first and drill down,
 * without the attempt and grading columns that only describe submitted code.
 */
export function ReadingProgressWorkspace({
  academyId,
  classId,
  initial,
  initialLens,
}: {
  academyId: string;
  classId: string;
  initial: ReadingProgressResult;
  initialLens: Lens;
}) {
  const { t } = useTranslation("reading-progress");
  const locale = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const [lens, setLens] = useState(initialLens);
  const courseId = initial.courseId ?? "";
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reading-progress", academyId, classId, courseId, lens],
    queryFn: () =>
      orpc.teacherProgress.readingProgress({
        academyId,
        classId,
        courseId,
        lens,
      }),
    initialData: lens === initialLens ? initial : undefined,
    staleTime: 30_000,
    retry: false,
  });
  const data = query.data;
  const changeLens = (value: Lens) => {
    setLens(value);
    setSelectedId(null);
    const next = new URLSearchParams(params.toString());
    next.set("view", value === "students" ? "students" : "problems");
    window.history.replaceState(null, "", "?" + next);
  };
  const needle = search.trim().toLocaleLowerCase();
  const students =
    data?.students
      .filter((s) => s.displayName.toLocaleLowerCase().includes(needle))
      .sort((a, b) =>
        sort === "viewed"
          ? b.viewed - a.viewed || a.displayName.localeCompare(b.displayName)
          : sort === "activity"
            ? (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? "")
            : a.displayName.localeCompare(b.displayName),
      ) ?? [];
  const materials = data?.materials ?? [];
  const lectures = [...new Set(materials.map((m) => m.lectureId))].map(
    (id) => ({ id, rows: materials.filter((m) => m.lectureId === id) }),
  );
  const viewed = materials.reduce((n, m) => n + m.viewed, 0);
  const total = materials.reduce((n, m) => n + m.total, 0);
  const hasQuiz = materials.some((m) => m.type === "MULTIPLE_CHOICE" || m.type === "WRITTEN_RESPONSE");
  const courses = initial.courses.map((c) => ({ id: c.id, name: c.title }));
  const sorts = [
    { id: "name", name: t("reading.sort_name") },
    { id: "viewed", name: t("reading.sort_viewed") },
    { id: "activity", name: t("reading.sort_activity") },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1 rounded-card border border-border bg-card px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-[12.5px] font-bold text-ink">
                {t("reading.class_total")}
              </p>
              <p className="text-[12px] text-sub">
                {t("reading.class_total_caption")}
              </p>
            </div>
            <p className="text-[1.5rem] font-extrabold leading-none tabular-nums">
              {viewed}
              <span className="text-[13px] font-semibold text-sub">
                {" "}
                / {total}
              </span>
            </p>
          </div>
          <Meter
            label={t("reading.class_total")}
            percent={percent(viewed, total)}
          />
        </div>
        {courses.length > 1 ? (
          <div className="w-full sm:w-72">
            <p className="mb-1.5 text-[12px] font-bold text-sub">
              {t("reading.course")}
            </p>
            <ChoiceSelector
              label={t("reading.course")}
              list={courses}
              selectedId={courseId}
              onSelect={(item) => {
                if (item.id === courseId) return;
                const next = new URLSearchParams(params.toString());
                next.delete("course");
                next.append("course", item.id);
                router.push("?" + next);
              }}
            />
          </div>
        ) : null}
      </div>

      <nav aria-label={t("reading.title")}>
        <ul className="inline-flex rounded-lg border border-border bg-card p-1">
          {(["students", "curriculum"] as const).map((value) => (
            <li key={value}>
              <button
                type="button"
                aria-current={lens === value ? "page" : undefined}
                onClick={() => changeLens(value)}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40",
                  lens === value
                    ? "bg-brand text-on-brand"
                    : "text-sub hover:text-ink",
                )}
              >
                {t(`reading.${value}`)}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {query.isError && !data ? (
        <RegionError
          body={t("reading.error")}
          onRetry={() => void query.refetch()}
          title={t("reading.error")}
        />
      ) : !data ? (
        <RegionLoading rows={5} />
      ) : lens === "students" ? (
        <Panel
          title={t("reading.students")}
          actions={
            <>
              <label className="relative block w-48 sm:w-60">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub"
                />
                <input
                  aria-label={t("reading.search")}
                  placeholder={t("reading.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={searchField}
                />
              </label>
              <div className="w-44">
                <ChoiceSelector
                  label={t("reading.sort")}
                  list={sorts}
                  selectedId={sort}
                  onSelect={(item) => setSort(item.id)}
                />
              </div>
            </>
          }
        >
          {students.length ? (
            <DataGrid
              head={
                <>
                  <Th>{t("reading.name")}</Th>
                  <Th>{t("reading.completion")}</Th>
                  {hasQuiz ? <Th numeric>{t("reading.quiz")}</Th> : null}
                  <Th>{t("reading.activity")}</Th>
                </>
              }
            >
              {students.map((s) => (
                <tr
                  key={s.membershipId}
                  className="border-b border-border last:border-0"
                >
                  <Td className="font-semibold text-ink">{s.displayName}</Td>
                  <Td className="min-w-56">
                    <div className="flex items-center gap-3">
                      <span className="w-14 shrink-0 font-mono text-[13px] tabular-nums text-ink">
                        {s.viewed} / {s.total}
                      </span>
                      <div className="min-w-24 flex-1">
                        <Meter
                          label={t("reading.viewed", {
                            viewed: s.viewed,
                            total: s.total,
                          })}
                          percent={percent(s.viewed, s.total)}
                        />
                      </div>
                    </div>
                  </Td>
                  {hasQuiz ? (
                    <Td numeric>
                      {s.quizCorrect} / {s.quizTotal}
                    </Td>
                  ) : null}
                  <Td className="whitespace-nowrap text-sub">
                    {s.lastActivityAt
                      ? formatDateTime(s.lastActivityAt, locale)
                      : "—"}
                  </Td>
                </tr>
              ))}
            </DataGrid>
          ) : (
            <EmptyState title={t("reading.empty")} body={t("reading.empty_body")} />
          )}
        </Panel>
      ) : lectures.length ? (
        lectures.map((lecture, index) => (
          <LectureMaterials
            key={lecture.id}
            academyId={academyId}
            classId={classId}
            defaultOpen={index === 0}
            rows={lecture.rows}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ))
      ) : (
        <Panel title={t("reading.materials")}>
          <EmptyState title={t("reading.empty")} body={t("reading.empty_body")} />
        </Panel>
      )}
    </div>
  );
}

function LectureMaterials({
  academyId,
  classId,
  defaultOpen,
  rows,
  selectedId,
  onSelect,
}: {
  academyId: string;
  classId: string;
  defaultOpen: boolean;
  rows: ReadingMaterialRow[];
  selectedId: string | null;
  onSelect: (materialId: string | null) => void;
}) {
  const { t } = useTranslation("reading-progress");
  const slug = useAcademySlug();
  const [open, setOpen] = useState(defaultOpen);
  const done = rows.reduce((n, m) => n + m.viewed, 0);
  const all = rows.reduce((n, m) => n + m.total, 0);
  const rowClass =
    "flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40";
  return (
    <section className="rounded-card border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40"
      >
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-sub transition-transform",
            !open && "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-ink">
          {rows[0].lectureTitle}
        </span>
        <span className="font-mono text-[13px] tabular-nums text-sub">
          {done} / {all}
        </span>
        <span className="hidden w-40 sm:block">
          <Meter label={rows[0].lectureTitle} percent={percent(done, all)} />
        </span>
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((material) => {
            const { Icon, tone } = typeMark[material.type];
            const reading = isReading(material.type);
            // Quizzes, written work and videos have their own class report;
            // reading lists its students here.
            const inline = reading;
            const selected = selectedId === material.materialId;
            const content = (
              <>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    tone,
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">
                    {material.title}
                  </span>
                  <span className="block text-[12px] text-sub">
                    {t(`reading.type_${material.type}`)}
                  </span>
                </span>
                <span className="w-44 shrink-0">
                  <span className="mb-1.5 block text-right text-[12.5px] tabular-nums text-sub">
                    {t(reading ? "reading.viewed_by" : "reading.completed_by", {
                      viewed: material.viewed,
                      total: material.total,
                    })}
                  </span>
                  <Meter
                    label={material.title}
                    percent={percent(material.viewed, material.total)}
                  />
                </span>
                {inline ? (
                  <ChevronDown
                    aria-hidden
                    className={cn(
                      "size-4 shrink-0 text-sub transition-transform",
                      !selected && "-rotate-90",
                    )}
                  />
                ) : (
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-sub" />
                )}
              </>
            );
            return (
              <li key={material.materialId}>
                {inline ? (
                  <button
                    type="button"
                    aria-expanded={selected}
                    className={cn(rowClass, selected && "bg-canvas")}
                    onClick={() =>
                      onSelect(selected ? null : material.materialId)
                    }
                  >
                    {content}
                  </button>
                ) : (
                  <Link
                    aria-label={`${material.title} · ${t("reading.open_report")}`}
                    className={rowClass}
                    href={`${routes.academy(slug)}/teach/classes/${classId}/${material.type === "VIDEO_LESSON" ? "videos" : "manual"}/${material.materialId}`}
                  >
                    {content}
                  </Link>
                )}
                {selected ? (
                  <MaterialStudents
                    academyId={academyId}
                    classId={classId}
                    material={material}
                    onClose={() => onSelect(null)}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/** Who has opened one text page or PDF, shown under the row that was opened. */
function MaterialStudents({
  academyId,
  classId,
  material,
  onClose,
}: {
  academyId: string;
  classId: string;
  material: ReadingMaterialRow;
  onClose: () => void;
}) {
  const { t } = useTranslation("reading-progress");
  const locale = useLocale();
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "viewed" | "notViewed">("all");
  const [page, setPage] = useState(1);
  // One request per pause in typing, not one per key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(draft.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);
  const query = useQuery({
    queryKey: [
      "reading-material-students",
      academyId,
      classId,
      material.materialId,
      q,
      filter,
      page,
    ],
    queryFn: () =>
      orpc.teacherProgress.readingMaterialStudents({
        academyId,
        classId,
        materialId: material.materialId,
        q,
        filter,
        page,
      }),
    placeholderData: (previous) => previous,
    retry: false,
  });
  const data = query.data;
  const statusLabel = t("reading.filter");
  const filters = [
    { id: "all" as const, name: t("reading.all") },
    { id: "viewed" as const, name: t("reading.filter_viewed") },
    { id: "notViewed" as const, name: t("reading.notViewed") },
  ];
  return (
    <section
      aria-label={t("reading.students_for", { title: material.title })}
      className="border-t border-border bg-canvas/60 px-4 py-3"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative block w-full sm:w-60">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sub"
          />
          <input
            className={searchField}
            aria-label={t("reading.search")}
            placeholder={t("reading.search")}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <div className="w-full sm:w-44">
          <ChoiceSelector
            label={statusLabel}
            list={filters}
            selectedId={filter}
            onSelect={(item) => {
              setFilter(item.id);
              setPage(1);
            }}
          />
        </div>
        <button
          type="button"
          aria-label={t("reading.close")}
          onClick={onClose}
          className="ml-auto grid size-8 place-items-center rounded-md border border-border bg-card text-sub transition-colors hover:border-brand hover:text-brand"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {query.isError && !data ? (
          <RegionError
            body={t("reading.error")}
            onRetry={() => void query.refetch()}
            title={t("reading.error")}
          />
        ) : !data ? (
          <RegionLoading rows={3} />
        ) : data.rows.length ? (
          <>
            <DataGrid
              head={
                <>
                  <Th>{t("reading.name")}</Th>
                  <Th>{statusLabel}</Th>
                </>
              }
            >
              {data.rows.map((s) => (
                <tr
                  key={s.membershipId}
                  className="border-b border-border last:border-0"
                >
                  <Td className="font-semibold text-ink">{s.displayName}</Td>
                  <Td
                    className={cn(
                      "whitespace-nowrap",
                      s.firstViewedAt ? "text-success" : "text-sub",
                    )}
                  >
                    {s.firstViewedAt
                      ? formatDateTime(s.firstViewedAt, locale)
                      : t("reading.not_viewed_yet")}
                  </Td>
                </tr>
              ))}
            </DataGrid>
            <Pager
              onPageChange={setPage}
              page={page}
              pageCount={Math.max(1, Math.ceil(data.total / data.pageSize))}
            />
          </>
        ) : (
          <EmptyState title={t("reading.empty")} body={t("reading.empty_body")} />
        )}
      </div>
    </section>
  );
}
