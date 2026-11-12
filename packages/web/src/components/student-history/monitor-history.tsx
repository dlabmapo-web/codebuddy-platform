"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { History, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MaterialType } from "@cove/shared";
import { HistoryPresentationContext } from "@/lib/monitoring/history-presentation";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { routes } from "@/lib/routes";
import { historyAction } from "./history-ui";
import dynamic from "next/dynamic";
const TutorRoster = dynamic(
  () => import("./tutor-roster").then((m) => m.TutorRoster),
  { ssr: false, loading: TutorLoading },
);
const TutorStudentWork = dynamic(
  () => import("./tutor-student-work").then((m) => m.TutorStudentWork),
  { ssr: false, loading: TutorLoading },
);
function TutorLoading() {
  const { t } = useTranslation("teach");
  return (
    <p role="status" className="p-5 text-sm text-sub">
      {t("history.loading")}
    </p>
  );
}
type Student = { membershipId: string; name: string };
export function MonitorHistoryHost({
  children,
  ...scope
}: {
  children: React.ReactNode;
  academyId: string;
  classId: string;
  membershipId: string;
  name: string;
}) {
  const { t } = useTranslation("teach"),
    slug = useAcademySlug(),
    router = useRouter();
  const [drawer, setDrawer] = React.useState(false);
  const [student, setStudent] = React.useState<Student | null>(null);
  const [material, setMaterialState] = React.useState<{
    id: string | null;
    courseId?: string;
    type?: MaterialType;
    title?: string;
  }>({ id: null });
  const [outlet, registerOutlet] = React.useState<HTMLDivElement | null>(null);
  const gradingGuard = React.useRef<(() => boolean) | null>(null);
  const setGradingGuard = React.useCallback((next: (() => boolean) | null) => {gradingGuard.current = next;}, []);
  const guard = React.useRef<(() => boolean) | null>(null);
  const leave = React.useRef<(() => Promise<boolean>) | null>(null);
  const [nonce] = React.useState(() => crypto.randomUUID());
  const setMaterial = React.useCallback(
    (
      id: string | null,
      courseId?: string,
      type?: MaterialType,
      title?: string,
    ) => {
      setMaterialState((old) =>
        old.id === id &&
        old.courseId === courseId &&
        old.type === type &&
        old.title === title
          ? old
          : { id, courseId, type, title },
      );
    },
    [],
  );
  const setLeaveGuard = React.useCallback(
    (prepare: (() => Promise<boolean>) | null) => {
      leave.current = prepare;
    },
    [],
  );
  const registerGuard = React.useCallback((next: (() => boolean) | null) => {
    guard.current = next;
  }, []);
  const close = React.useCallback(() => {
    if (guard.current?.() === false || gradingGuard.current?.() === false) return false;
    setStudent(null);
    setDrawer(false);
    return true;
  }, []);
  React.useEffect(() => {
    if (!drawer && !student) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (drawer) setDrawer(false);
      else close();
      event.preventDefault();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [drawer, student, close]);
  const selectStudent = React.useCallback(
    (next: Student) => {
      if (!material.id || guard.current?.() === false || gradingGuard.current?.() === false) return;
      setStudent(next);
      setDrawer(false);
    },
    [material.id],
  );
  const beforeNavigate = React.useCallback(async () => {
    if (guard.current?.() === false || gradingGuard.current?.() === false) return false;
    return leave.current ? leave.current() : true;
  }, []);
  React.useEffect(() => {
    const leaving = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        link.hasAttribute("data-tutoring-navigation") ||
        link.href === location.href
      )
        return;
      if (guard.current?.() === false || gradingGuard.current?.() === false) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", leaving, true);
    return () => document.removeEventListener("click", leaving, true);
  }, [student]);
  const open = React.useCallback(
    (mode: "student" | "material") => {
      if (mode === "material") {
        if (gradingGuard.current?.() === false) return;
        if (material.id) setDrawer((value) => !value);
        return;
      }
      void (async () => {
        if (!(await beforeNavigate())) return;
        const p = new URLSearchParams({
          view: "students",
          student: student?.membershipId ?? scope.membershipId,
        });
        if (material.courseId) p.set("course", material.courseId);
        router.push(routes.academyTeachProgress(slug, scope.classId) + "?" + p);
      })();
    },
    [
      material.id,
      material.courseId,
      student?.membershipId,
      scope.membershipId,
      scope.classId,
      router,
      slug,
      beforeNavigate,
    ],
  );
  const revoke = React.useCallback(() => {
    setStudent(null);
    setDrawer(false);
  }, []);
  const setConnection = React.useCallback(() => {}, []);
  const value = React.useMemo(
    () => ({
      covered: Boolean(student || drawer),
      revoke,
      open,
      setMaterial,
      setConnection,
      materialId: material.id,
      selectedStudent: student,
      selectStudent,
      registerOutlet,
      setLeaveGuard,
      setGradingGuard,
      beforeNavigate,
      prepareMaterialChange: close,
    }),
    [
      student,
      drawer,
      revoke,
      open,
      setMaterial,
      setConnection,
      material.id,
      selectStudent,
      setLeaveGuard,
      setGradingGuard,
      beforeNavigate,
      close,
    ],
  );
  return (
    <HistoryPresentationContext.Provider value={value}>
      <div className="h-full">{children}</div>
      {outlet && (student || drawer)
        ? createPortal(
            <div
              className="absolute inset-0 flex min-h-0 flex-col pointer-events-auto"
              data-history-private
              data-testid="inline-tutoring"
            >
              {student && material.id ? (
                <div className="flex h-full min-h-0 flex-col bg-card">
                  <p className="shrink-0 border-b border-border bg-brand-soft px-4 py-2 text-xs font-semibold text-brand">
                    {t("history.monitoring", { name: scope.name })} ·{" "}
                    {t("history.reviewing", { name: student.name })}
                  </p>
                  <TutorStudentWork
                    embedded
                    key={student.membershipId + ":" + material.id}
                    academyId={scope.academyId}
                    classId={scope.classId}
                    membershipId={student.membershipId}
                    materialId={material.id}
                    name={student.name}
                    materialTitle={material.title}
                    materialType={material.type}
                    queryScope={nonce}
                    onRegisterGuard={registerGuard}
                    onBack={close}
                  />
                </div>
              ) : null}
              {drawer ? (
                <div className="absolute inset-0 z-10 flex">
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/20"
                    aria-label={t("history.close_tutoring")}
                    onClick={() => setDrawer(false)}
                  />
                  <aside
                    className="relative flex h-full w-[340px] max-w-[90vw] flex-col border-r border-border bg-card shadow-lg"
                    aria-label={t("history.tutoring")}
                  >
                    <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4">
                      <div>
                        <h2 className="font-bold">{t("history.tutoring")}</h2>
                        <p className="mt-1 text-xs text-sub">
                          {material.title ?? t("history.material")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={historyAction}
                        aria-label={t("history.close_tutoring")}
                        onClick={() => setDrawer(false)}
                      >
                        <X className="size-4" />
                      </button>
                    </header>
                    {material.id ? (
                      <TutorRoster
                        academyId={scope.academyId}
                        classId={scope.classId}
                        materialId={material.id}
                        queryScope={nonce}
                        selectedId={student?.membershipId ?? scope.membershipId}
                        onSelect={selectStudent}
                      />
                    ) : null}
                  </aside>
                </div>
              ) : null}
            </div>,
            outlet,
          )
        : null}
    </HistoryPresentationContext.Provider>
  );
}
/** The live owner remains mounted below this local content layer. */
export function MonitoringTutorOutlet() {
  const context = React.useContext(HistoryPresentationContext);
  return (
    <div
      ref={context?.registerOutlet}
      className="pointer-events-none absolute inset-0 z-30"
    />
  );
}
export function MonitoringLiveContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = React.useContext(HistoryPresentationContext);
  return (
    <div
      className="contents"
      inert={context?.covered}
      style={{ visibility: context?.selectedStudent ? "hidden" : undefined }}
    >
      {children}
    </div>
  );
}
export function MonitoringHistoryActions() {
  const context = React.useContext(HistoryPresentationContext),
    { t } = useTranslation("teach");
  if (!context) return null;
  return (
    <>
      <button
        type="button"
        className={historyAction}
        onClick={() => context.open("student")}
      >
        <History className="size-4" />
        {t("history.title")}
      </button>
      <button
        type="button"
        className={historyAction}
        disabled={!context.materialId}
        onClick={() => context.open("material")}
      >
        <Users className="size-4" />
        {t("history.tutoring")}
      </button>
    </>
  );
}
