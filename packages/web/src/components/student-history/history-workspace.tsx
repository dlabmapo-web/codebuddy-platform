"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Code2,
  Search,
  Users,
  History,
  Radio,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  materialTypeSchema,
  historyFilterSchema,
  type HistoryMaterial,
} from "@cove/shared";
import { formatDateTime } from "@cove/i18n/format";
import { useLocale } from "@/i18n";
import { orpc } from "@/lib/orpc";
import { routes } from "@/lib/routes";
import { isExplicitAccessDeniedError } from "@/lib/api-errors";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import {
  readHistoryState,
  writeHistoryState,
  type HistoryState,
} from "./history-state";
import {
  historyAction,
  HistorySelect,
  historyInput,
  HistoryError,
  HistoryPager,
} from "./history-ui";
import { HistoryMaterialGroups } from "./history-materials";
import { HistoryStudentOverview } from "./history-overview";
import dynamic from "next/dynamic";
const SubmissionWorkspace = dynamic(
  () => import("./submission-workspace").then((m) => m.SubmissionWorkspace),
  { ssr: false },
);

const MaterialPreview = dynamic(
  () => import("./material-preview").then((m) => m.HistoryMaterialPreview),
  { ssr: false },
);
export type HistoryGuard = React.MutableRefObject<(() => boolean) | null>;
type Props = {
  academyId: string;
  classId: string;
  initialStudentId?: string;
  initialCourseId?: string;
  initialMaterialId?: string;
  initialMode?: "student" | "material";
  standalone?: boolean;
  onRegisterCloseGuard?: (guard: (() => boolean) | null) => void;
  visible?: boolean;
  onClose?: () => void;
};
/** Shared saved-work surface. The monitoring host never navigates its live route. */
export function HistoryWorkspace(props: Props) {
  const { t } = useTranslation("teach");
  const [viewer, setViewer] = React.useState<string | null>(null);
  React.useEffect(() => {
    const auth = createClient().auth;
    let disposed = false;
    const accept = (session: { user: { id: string } } | null) => {
      if (!disposed)
        setViewer(
          session
            ? `${session.user.id}:${document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1] ?? ""}`
            : null,
        );
    };
    void auth.getSession().then(({ data }) => accept(data.session));
    const { data } = auth.onAuthStateChange((_event, session) =>
      accept(session),
    );
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, []);
  return viewer ? (
    <HistoryContent key={viewer} {...props} />
  ) : (
    <p role="status" className="p-5 text-sm text-sub">
      {t("history.loading")}
    </p>
  );
}
function HistoryContent(props: Props) {
  const { t: ts } = useTranslation("sample-check");
  const { t } = useTranslation("teach"),
    locale = useLocale(),
    slug = useAcademySlug();
  const params = useSearchParams();
  const router = useRouter();
  const [nonce] = React.useState(() => crypto.randomUUID());
  const [local, setLocal] = React.useState<HistoryState>(() => ({
    ...readHistoryState(""),
    student: props.initialStudentId ?? "",
    course: props.initialCourseId ?? "",
    material: props.initialMaterialId ?? "",
    mode: props.initialMode ?? "student",
  }));
  const state = props.standalone ? readHistoryState(params.toString()) : local;
  const openWork = React.useCallback(
    (
      materialId: string,
      student = state.student,
      attempt?: string,
      attemptPage = 1,
      replace = false,
    ) => {
      const backParams = new URLSearchParams(params.toString());
      backParams.delete("attempt");
      backParams.delete("attemptKind");
      const query = new URLSearchParams({
        returnTo:
          routes.academyTeachProgress(slug, props.classId) +
          "?" +
          backParams.toString(),
      });
      if (attempt) {
        query.set("attempt", attempt);
        query.set("attemptPage", String(attemptPage));
      }
      router[replace ? "replace" : "push"](
        routes.academyTeachStudentWork(
          slug,
          props.classId,
          student,
          materialId,
        ) +
          "?" +
          query,
      );
    },
    [params, props.classId, router, slug, state.student],
  );
  React.useEffect(() => {
    // Existing bookmarks used to mount a review inside the dashboard card.
    if (props.standalone && state.student && state.material && state.attempt)
      openWork(
        state.material,
        state.student,
        state.attempt,
        state.attemptPage,
        true,
      );
  }, [
    props.standalone,
    state.student,
    state.material,
    state.attempt,
    state.attemptPage,
    openWork,
  ]);
  const [preview, setPreview] = React.useState<Pick<
    HistoryMaterial,
    "materialId" | "title" | "type"
  > | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(Boolean(state.attempt));
  const guard = React.useRef<(() => boolean) | null>(null);
  const scroll = React.useRef<HTMLDivElement>(null);
  const [rosterInput, setRosterInput] = React.useState(state.rosterQ),
    [searchInput, setSearchInput] = React.useState(state.q);
  const key = ["student-history", nonce, props.academyId, props.classId];
  const scope = { academyId: props.academyId, classId: props.classId };
  const update = React.useCallback(
    (patch: Partial<HistoryState>, replace = false) => {
      const changesCopy =
        (patch.student !== undefined && patch.student !== state.student) ||
        (patch.material !== undefined && patch.material !== state.material) ||
        (patch.attempt !== undefined && patch.attempt !== state.attempt);
      if (changesCopy && guard.current?.() === false) return false;
      const next = { ...state, ...patch };
      if (props.standalone) {
        const url = new URL(location.href);
        url.search = writeHistoryState(url.search, next);
        window.history[replace ? "replaceState" : "pushState"](null, "", url);
      } else setLocal(next);
      if ("attempt" in patch) setReviewOpen(Boolean(patch.attempt));
      return true;
    },
    [props.standalone, state],
  );
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (rosterInput !== state.rosterQ)
        update({ rosterQ: rosterInput, rosterPage: 1 }, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [rosterInput, state.rosterQ, update]);
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== state.q) update({ q: searchInput, page: 1 }, true);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, state.q, update]);
  const registerGuard = React.useCallback((next: (() => boolean) | null) => {
    guard.current = next;
  }, []);
  const onRegisterCloseGuard = props.onRegisterCloseGuard;
  React.useEffect(() => {
    onRegisterCloseGuard?.(() => guard.current?.() ?? true);
    return () => onRegisterCloseGuard?.(null);
  }, [onRegisterCloseGuard]);
  const lastLocation = React.useRef("");
  React.useEffect(() => {
    lastLocation.current = location.href;
  }, [params]);
  React.useEffect(() => {
    const pop = () => {
      if (guard.current?.() === false) {
        window.history.pushState(null, "", lastLocation.current);
        return;
      }
      const next = readHistoryState(location.search);
      setRosterInput(next.rosterQ);
      setSearchInput(next.q);
      setReviewOpen(Boolean(next.attempt));
    };
    if (props.standalone) window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [props.standalone]);
  React.useEffect(() => {
    if (!props.standalone) return;
    const leaving = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("download")
      )
        return;
      if (link.href === location.href || guard.current?.() !== false) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", leaving, true);
    return () => document.removeEventListener("click", leaving, true);
  }, [props.standalone]);
  const common = {
    retry: false as const,
    gcTime: 0,
    staleTime: 0,
    refetchInterval: props.visible === false ? (false as const) : 30000,
  };
  const roster = useQuery({
    queryKey: [
      ...key,
      "roster",
      state.mode,
      state.material,
      state.rosterQ,
      state.rosterPage,
      state.submitted,
    ],
    queryFn: () =>
      state.mode === "material" && state.material
        ? orpc.studentWorkHistory.listMaterialStudents({
            ...scope,
            materialId: state.material,
            q: state.rosterQ,
            page: state.rosterPage,
            submitted:
              state.submitted === "all" || !state.submitted
                ? undefined
                : state.submitted === "submitted",
          })
        : orpc.studentWorkHistory.listStudentRoster({
            ...scope,
            q: state.rosterQ,
            page: state.rosterPage,
          }),
    ...common,
  });
  const summary = useQuery({
    queryKey: [...key, "summary", state.student, state.course],
    queryFn: () =>
      orpc.studentWorkHistory.getStudentSummary({
        ...scope,
        membershipId: state.student,
        courseId: state.course || undefined,
      }),
    enabled: Boolean(state.student),
    ...common,
  });
  const filter = historyFilterSchema.parse({
    ...scope,
    membershipId: state.student || "00000000-0000-4000-8000-000000000000",
    courseId: state.course || undefined,
    moduleId: state.module || undefined,
    lectureId: state.lecture || undefined,
    q: state.q,
    page: state.page,
    type: materialTypeSchema.safeParse(state.type).success
      ? state.type
      : undefined,
    status: historyFilterSchema.shape.status.safeParse(
      state.status || undefined,
    ).success
      ? state.status || undefined
      : undefined,
  });
  const materials = useQuery({
    queryKey: [...key, "materials", filter],
    queryFn: () => orpc.studentWorkHistory.listStudentMaterials(filter),
    enabled: Boolean(state.student),
    ...common,
  });
  const attempts = useQuery({
    queryKey: [
      ...key,
      "attempts",
      state.student,
      state.material,
      state.attemptPage,
    ],
    queryFn: () =>
      orpc.studentWorkHistory.listAttempts({
        ...scope,
        membershipId: state.student,
        materialId: state.material,
        page: state.attemptPage,
      }),
    enabled: Boolean(state.student && state.material),
    ...common,
  });
  const data = summary.data;
  const selectedRow =
    materials.data?.rows.find((r) => r.materialId === state.material) ??
    attempts.data?.material;
  const date = (value: string | null) =>
    value ? formatDateTime(value, locale) : "—";
  const denied = [roster, summary, materials, attempts].some(
    (query) => query.isError && isExplicitAccessDeniedError(query.error),
  );
  if (denied)
    return (
      <div role="alert" className="p-6 text-sm">
        {t("history.access_denied")}
      </div>
    );
  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col bg-canvas text-ink"
      data-history-private
      data-testid="student-history-workspace"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2">
          <History aria-hidden className="size-5 text-brand" />
          <h2 className="text-base font-bold">{t("history.title")}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`${historyAction} aria-pressed:border-brand/20 aria-pressed:bg-brand-soft aria-pressed:text-brand`}
            aria-pressed={state.mode === "student"}
            onClick={() => update({ mode: "student" })}
          >
            <Users className="size-4" />
            {t("history.by_student")}
          </button>
          <button
            type="button"
            className={`${historyAction} aria-pressed:border-brand/20 aria-pressed:bg-brand-soft aria-pressed:text-brand`}
            aria-pressed={state.mode === "material"}
            disabled={!state.material}
            onClick={() => update({ mode: "material" })}
          >
            <Code2 className="size-4" />
            {t("history.tutoring")}
          </button>
          {props.standalone ? (
            <Link
              className={historyAction}
              href={routes.academyTeachHistory(slug)}
            >
              <Radio className="size-4" />
              {t("history.class")}
            </Link>
          ) : props.onClose ? (
            <button
              type="button"
              className={historyAction}
              onClick={props.onClose}
            >
              {t("history.return_monitoring")}
            </button>
          ) : null}
        </div>
      </header>
      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          className={`${state.student ? "hidden md:flex" : "flex"} min-h-0 flex-col border-r border-border bg-card`}
          aria-label={t("history.students")}
        >
          <label className="m-4 flex items-center gap-2 rounded-lg border border-border px-3">
            <Search aria-hidden className="size-4 text-sub" />
            <input
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
              aria-label={t("history.search_students")}
              placeholder={t("history.search_students")}
              value={rosterInput}
              onChange={(e) => setRosterInput(e.target.value)}
            />
          </label>
          {state.mode === "material" ? (
            <div className="mx-4 mb-3">
              <HistorySelect
                label={t("history.submission_filter")}
                value={state.submitted}
                onChange={(submitted) => update({ submitted, rosterPage: 1 })}
                options={[
                  { value: "", label: t("history.all_students") },
                  { value: "submitted", label: t("history.submitted") },
                  { value: "not-submitted", label: t("history.not_submitted") },
                ]}
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto px-2 pb-2">
            {roster.isError ? (
              <HistoryError retry={() => void roster.refetch()} />
            ) : roster.isPending ? (
              <p role="status" className="p-4 text-sm text-sub">
                {t("history.loading")}
              </p>
            ) : (
              <ul className="space-y-1">
                {roster.data?.rows.map((s) => (
                  <li key={s.membershipId}>
                    <button
                      type="button"
                      aria-pressed={state.student === s.membershipId}
                      onClick={() => {
                        if (
                          props.standalone &&
                          state.mode === "material" &&
                          state.material
                        ) {
                          openWork(state.material, s.membershipId);
                          return;
                        }
                        update({
                          student: s.membershipId,
                          attempt: "",
                          material:
                            state.mode === "material" ? state.material : "",
                          page: 1,
                          attemptPage: 1,
                        });
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${state.student === s.membershipId ? "bg-brand-soft ring-1 ring-inset ring-brand/20" : "hover:bg-canvas"}`}
                    >
                      <span
                        className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${["bg-peer-soft text-peer", "bg-brand-soft text-brand", "bg-success/10 text-success", "bg-warning/10 text-warning"][s.membershipId.charCodeAt(s.membershipId.length - 1) % 4]}`}
                      >
                        {[...s.name][0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold">
                          {s.name}
                        </span>
                        <span className="block truncate text-xs text-sub">
                          {s.identifier}
                        </span>
                        {"score" in s && typeof s.score === "number" ? (
                          <span className="block text-xs font-semibold text-brand">
                            {s.score} /{" "}
                            {"maximum" in s ? String(s.maximum) : "—"}
                          </span>
                        ) : null}
                        {"submissions" in s ? (
                          <span className="block text-xs text-sub">
                            {Number(s.submissions) > 0
                              ? t("history.submitted")
                              : t("history.not_submitted")}{" "}
                            ·{" "}
                            {t("history.submission_count", {
                              count: Number(s.submissions),
                            })}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {roster.data?.rows.length === 0 ? (
              <p className="p-4 text-sm text-sub">{t("history.no_students")}</p>
            ) : null}
          </div>
          <HistoryPager
            pagination={roster.data?.pagination}
            onPage={(rosterPage) => update({ rosterPage })}
          />
        </aside>
        <div
          ref={scroll}
          className={`${state.student ? "block" : "hidden md:block"} min-h-0 min-w-0 overflow-auto p-4 sm:p-6`}
        >
          {!state.student ? (
            <div className="m-auto max-w-sm p-8 text-center">
              <Users className="mx-auto mb-4 size-10 text-peer" />
              <h3 className="font-bold">{t("history.select_student")}</h3>
              <p className="mt-2 text-sm text-sub">
                {t("history.select_hint")}
              </p>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={`${historyAction} mb-3 self-start md:hidden`}
                onClick={() => update({ student: "", attempt: "" })}
              >
                <ChevronLeft className="size-4" />
                {t("history.students")}
              </button>
              {summary.isError ? (
                <HistoryError retry={() => void summary.refetch()} />
              ) : !data ? (
                <p role="status">{t("history.loading")}</p>
              ) : (
                <>
                  <HistoryStudentOverview
                    data={data}
                    course={state.course}
                    onCourseChange={(course) =>
                      update({
                        course,
                        module: "",
                        lecture: "",
                        page: 1,
                        material: "",
                        attempt: "",
                      })
                    }
                  />
                  <h3 className="mt-7 flex items-center gap-2 text-lg font-bold">
                    <History className="size-5 text-brand" />
                    {t("history.all_materials")}
                  </h3>
                  <div className="my-4 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-3">
                    <input
                      aria-label={t("history.search_materials")}
                      placeholder={t("history.search_materials")}
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className={`${historyInput} min-w-40 flex-1`}
                    />
                    <HistorySelect
                      label={t("history.module")}
                      value={state.module}
                      className="w-full sm:w-40"
                      onChange={(module) =>
                        update({ module, lecture: "", page: 1 })
                      }
                      options={[
                        { value: "", label: t("history.all_modules") },
                        ...data.modules.map((m) => ({
                          value: m.id,
                          label: m.title,
                        })),
                      ]}
                    />
                    <HistorySelect
                      label={t("history.lecture")}
                      value={state.lecture}
                      className="w-full sm:w-40"
                      onChange={(lecture) => update({ lecture, page: 1 })}
                      options={[
                        { value: "", label: t("history.all_lectures") },
                        ...data.lectures
                          .filter(
                            (l) => !state.module || l.moduleId === state.module,
                          )
                          .map((l) => ({ value: l.id, label: l.title })),
                      ]}
                    />
                    <HistorySelect
                      label={t("history.type")}
                      value={state.type}
                      className="w-full sm:w-44"
                      onChange={(type) => update({ type, page: 1 })}
                      options={[
                        { value: "", label: t("history.all_types") },
                        ...materialTypeSchema.options.map((type) => ({
                          value: type,
                          label: t(`history.types.${type}`),
                        })),
                      ]}
                    />
                    <HistorySelect
                      label={t("history.status")}
                      value={state.status}
                      className="w-full sm:w-40"
                      onChange={(status) => update({ status, page: 1 })}
                      options={[
                        { value: "", label: t("history.all_statuses") },
                        ...historyFilterSchema.shape.status
                          .unwrap()
                          .options.map((status) => ({
                            value: status,
                            label: t(`history.statuses.${status}`),
                          })),
                      ]}
                    />
                    <button
                      type="button"
                      className={historyAction}
                      onClick={() => {
                        if (
                          update({
                            q: "",
                            type: "",
                            status: "",
                            module: "",
                            lecture: "",
                            page: 1,
                          })
                        )
                          setSearchInput("");
                      }}
                    >
                      {t("history.clear")}
                    </button>
                  </div>
                  {materials.isError ? (
                    <HistoryError retry={() => void materials.refetch()} />
                  ) : materials.isPending ? (
                    <p role="status">{t("history.loading")}</p>
                  ) : (
                    <>
                      <HistoryMaterialGroups
                        materials={materials.data?.rows ?? []}
                        onOpenMaterial={setPreview}
                        onSelect={(material) => {
                          if (props.standalone) {
                            openWork(material);
                          } else
                            update({ material, attempt: "", attemptPage: 1 });
                        }}
                      />
                      {materials.data?.rows.length === 0 ? (
                        <p className="rounded-lg border border-border bg-card p-6 text-sm text-sub">
                          {t("history.no_work")}
                        </p>
                      ) : null}
                      {materials.data ? (
                        <p className="mb-3 text-xs text-sub">
                          {t("history.page_hint", {
                            shown: materials.data.rows.length,
                            total: materials.data.pagination.totalCount,
                          })}
                        </p>
                      ) : null}
                      <HistoryPager
                        pagination={materials.data?.pagination}
                        onPage={(page) => update({ page })}
                      />
                    </>
                  )}
                </>
              )}
              {state.material ? (
                <section
                  className="mt-4 rounded-xl border border-border bg-card"
                  aria-label={t("history.attempts")}
                >
                  <h4 className="border-b border-border px-4 py-3 text-sm font-bold">
                    {selectedRow?.title ?? t("history.attempts")}
                  </h4>
                  {attempts.isError ? (
                    <HistoryError retry={() => void attempts.refetch()} />
                  ) : attempts.isPending ? (
                    <p role="status" className="p-4">
                      {t("history.loading")}
                    </p>
                  ) : attempts.data?.attempts.length ? (
                    <ul className="divide-y divide-border">
                      {attempts.data.attempts.map((a, index) => (
                        <li
                          key={a.id}
                          className="flex flex-wrap items-center gap-3 px-4 py-3 text-xs"
                        >
                          <span className="min-w-0 flex-1">
                            {date(a.createdAt)}
                            {state.attemptPage === 1 && index === 0 ? (
                              <span className="ml-2 rounded bg-brand-soft px-2 py-1 text-brand">
                                {t("history.latest")}
                              </span>
                            ) : null}
                            {!a.currentRevision ? (
                              <span className="ml-2 text-sub">
                                {t("history.statuses.previous_revision")}
                              </span>
                            ) : null}
                            {a.compileFailed ? (
                              <span className="ml-2 rounded bg-danger/10 px-2 py-1 text-danger">
                                {ts("workspace.compile_error_title")}
                              </span>
                            ) : null}
                            <span className="mt-1 block text-sub">
                              {a.score === null
                                ? t("history.statuses.pending")
                                : `${a.score} / ${a.maximum}`}{" "}
                              ·{" "}
                              {a.completed === null
                                ? t("history.statuses.pending")
                                : t(
                                    a.completed
                                      ? "history.statuses.completed"
                                      : "history.statuses.in_progress",
                                  )}
                            </span>
                          </span>
                          <button
                            type="button"
                            className={historyAction}
                            onClick={() => {
                              if (props.standalone)
                                openWork(
                                  state.material,
                                  state.student,
                                  a.id,
                                  state.attemptPage,
                                );
                              else if (state.attempt === a.id)
                                setReviewOpen(true);
                              else update({ attempt: a.id, kind: a.kind });
                            }}
                          >
                            {t("history.review")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-5 text-sm text-sub">
                      {t("history.no_attempts")}
                      {selectedRow ? (
                        <button
                          type="button"
                          className={`${historyAction} ml-3`}
                          onClick={() => setPreview(selectedRow)}
                        >
                          {t("history.open_material")}
                        </button>
                      ) : null}
                    </p>
                  )}
                  <HistoryPager
                    pagination={attempts.data?.pagination}
                    onPage={(attemptPage) => update({ attemptPage })}
                  />
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
      {preview ? (
        <div className="absolute inset-0 z-30 flex min-h-0 flex-col bg-card">
          <MaterialPreview
            academyId={props.academyId}
            classId={props.classId}
            membershipId={state.student}
            material={preview}
            onBack={() => setPreview(null)}
          />
        </div>
      ) : null}
      {state.student && state.material && state.attempt ? (
        <div
          className={
            reviewOpen
              ? "absolute inset-0 z-20 flex min-h-0 flex-col bg-card"
              : "hidden"
          }
        >
          <SubmissionWorkspace
            key={`${state.student}:${state.material}:${state.attempt}`}
            {...scope}
            membershipId={state.student}
            materialId={state.material}
            submissionId={state.attempt}
            kind={state.kind}
            onRegisterGuard={registerGuard}
            active={reviewOpen && props.visible !== false}
            onBack={() => setReviewOpen(false)}
            queryScope={nonce}
          />
        </div>
      ) : null}
    </div>
  );
}
