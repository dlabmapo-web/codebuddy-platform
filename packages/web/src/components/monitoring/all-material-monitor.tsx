"use client";
import * as React from "react";
import {
  MonitorHistoryHost,
  MonitoringTutorOutlet,
  MonitoringLiveContent,
} from "@/components/student-history/monitor-history";
import { HistoryPresentationContext } from "@/lib/monitoring/history-presentation";
import { useQuery } from "@tanstack/react-query";
import type { MonitoringStudentContext, MaterialType } from "@cove/shared";
import { useMaterialPointerPublisher } from "@/lib/monitoring/use-material-awareness";
import { useObservationWatch } from "@/lib/monitoring/use-observation-watch";
import { orpc } from "@/lib/orpc";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { routes } from "@/lib/routes";
import { WorkspaceCurriculumNavigator } from "@/components/workspace/curriculum-navigator";
import { StudentSwitcher } from "./student-switcher";
import { LiveHelpQueue } from "./help-queue";
import { ObservedMaterialView } from "./observed-material-view";
import { useObservationTranslation } from "./use-observation-translation";
import { CurriculumTrigger } from "@/components/workspace/curriculum-trigger";
import { LiveHeader } from "@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-header";
import { ObservationPresence } from "./observation-presence";
import { LiveWorkspace } from "@/app/(studio)/academy/[academySlug]/teach/classes/[classId]/students/[membershipId]/live/_components/live-workspace";

function MonitorContent(props: {
  academyId: string;
  classId: string;
  membershipId: string;
  context: MonitoringStudentContext;
  teacherMembershipRef: string | null;
  canEditProblem?: boolean;
  initialMaterialId?: string | null;
}) {
  const { academyId, classId, membershipId, context } = props;
  const slug = useAcademySlug();
  const { t } = useObservationTranslation();
  const watch = useObservationWatch({ academyId, classId, membershipId });
  const [selected, setSelected] = React.useState<string | null>(
    props.initialMaterialId ?? context.exercise?.exercise.materialId ?? null,
  );
  const [outline, setOutline] = React.useState(true);
  const [alignment, setAlignment] = React.useState(0);
  const [codeAttached, setCodeAttached] = React.useState(false);
  const [initialized, setInitialized] = React.useState(false);
  const transition = React.useRef<(() => Promise<boolean>) | null>(null);
  const current = watch.snapshot;
  const currentRef = React.useRef(current);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);
  const displayRef = React.useRef(selected ?? current?.materialId ?? null);
  React.useEffect(() => {
    displayRef.current = selected ?? current?.materialId ?? null;
  }, [selected, current?.materialId]);
  React.useEffect(() => {
    const pop = () => {
      const id = new URL(location.href).searchParams.get("materialId");
      if ((id ?? currentRef.current?.materialId ?? null) === displayRef.current)
        return;
      void (async () => {
        if (transition.current && !(await transition.current())) return;
        setSelected(id ?? currentRef.current?.materialId ?? null);
        setCodeAttached(false);
      })();
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const id = selected ?? current?.materialId ?? null;
  const historyPresentation = React.useContext(HistoryPresentationContext);

  const material = useQuery({
    queryKey: ["observed-material", academyId, classId, membershipId, id],
    queryFn: () =>
      orpc.monitoring.getObservedMaterial({
        academyId,
        classId,
        membershipId,
        materialId: id!,
      }),
    enabled: Boolean(id) && !codeAttached && watch.state !== "revoked",
    retry: false,
  });
  const shown = material.data;
  const emptyRoster = useQuery({
    queryKey: ["monitor-empty-outline", academyId, classId, membershipId],
    queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }),
    enabled: !id && watch.state !== "revoked",
    retry: false,
    gcTime: 0,
  });
  const seed = emptyRoster.data?.exercises[0]?.materialId;
  const emptyCurriculum = useQuery({
    queryKey: [
      "monitor-empty-curriculum",
      academyId,
      classId,
      membershipId,
      seed,
    ],
    queryFn: () =>
      orpc.monitoring.getStudentCurriculum({
        academyId,
        classId,
        membershipId,
        materialId: seed!,
      }),
    enabled: !id && Boolean(seed) && watch.state !== "revoked",
    retry: false,
    gcTime: 0,
  });
  const navigator =
    shown?.navigator ?? (!id ? emptyCurriculum.data : undefined);
  const revokeHistory = historyPresentation?.revoke;
  React.useEffect(() => {
    if (watch.state === "revoked") revokeHistory?.();
  }, [watch.state, revokeHistory]);
  const setHistoryMaterial = historyPresentation?.setMaterial;
  React.useEffect(() => {
    if (!codeAttached)
      setHistoryMaterial?.(id, navigator?.course.id, shown?.type, shown?.title);
  }, [
    id,
    navigator?.course.id,
    shown?.type,
    shown?.title,
    codeAttached,
    setHistoryMaterial,
  ]);
  const prepareMaterialChange = historyPresentation?.prepareMaterialChange;
  const select = React.useCallback(
    async (materialId: string, type?: MaterialType) => {
      if (prepareMaterialChange?.() === false) return;
      if (
        type !== "PROGRAMMING_EXERCISE" &&
        transition.current &&
        !(await transition.current())
      )
        return;
      const url = new URL(location.href);
      url.searchParams.set("materialId", materialId);
      window.history.pushState(null, "", url);
      setSelected(materialId);
      setAlignment((value) => value + 1);
      setCodeAttached(type === "PROGRAMMING_EXERCISE");
    },
    [prepareMaterialChange],
  );
  const setLeaveGuard = historyPresentation?.setLeaveGuard;
  const registerTransition = React.useCallback(
    (prepare: (() => Promise<boolean>) | null) => {
      transition.current = prepare;
      setLeaveGuard?.(prepare);
    },
    [setLeaveGuard],
  );
  // Freeze initial selection. Student movement never takes over staff reading.
  if ((!initialized || !selected) && current?.materialId) {
    setInitialized(true);
    if (!selected) setSelected(current.materialId);
    setCodeAttached(
      current.type === "PROGRAMMING_EXERCISE" &&
        (!selected || selected === current.materialId),
    );
  }
  if (!codeAttached && shown?.type === "PROGRAMMING_EXERCISE")
    setCodeAttached(true);
  useMaterialPointerPublisher({
    socket: watch.socket,
    academyId,
    classId,
    membershipId,
    materialId: id,
    enabled:
      watch.state === "live" &&
      id === current?.materialId &&
      current?.type !== "PROGRAMMING_EXERCISE",
  });
  const isCurrent = Boolean(
    id &&
    current?.materialId === id &&
    current.state !== "OFFLINE" &&
    current.state !== "RECONNECTING",
  );
  const liveWork =
    isCurrent && watch.state === "live" ? (current?.work ?? null) : null;
  const shownWork = liveWork ?? (id ? (watch.lastWork[id] ?? null) : null);
  const lastSeen = Boolean(!liveWork && id && watch.lastWork[id]);
  if (watch.state === "revoked")
    return (
      <main role="alert" className="p-6">
        {t("observation.access_denied")}
      </main>
    );
  if (codeAttached)
    return (
      <LiveWorkspace
        {...props}
        selectedMaterialId={id ?? undefined}
        onCodeSelected={(materialId) => {
          const url = new URL(location.href);
          url.searchParams.set("materialId", materialId);
          window.history.pushState(null, "", url);
          setSelected(materialId);
        }}
        onSelectMaterial={select}
        onRegisterTransition={registerTransition}
        observation={current}
        observationAwareness={watch.awareness}
        observationConnection={watch.state}
        onReturnToObserved={() => {
          if (current?.materialId && current.type)
            void select(current.materialId, current.type);
        }}
      />
    );
  return (
    <main
      className="flex h-dvh flex-col bg-canvas text-ink"
      data-testid="all-material-monitor"
    >
      <ObservationPresence
        awareness={watch.awareness}
        materialId={id}
        name={
          context.student.displayName ?? context.student.email ?? membershipId
        }
      />
      <LiveHeader
        classId={classId}
        context={context}
        connection={watch.state}
        exercise={null}
        materialTitle={shown?.title}
        unsaved={false}
        saveStatus={t("observation.read_only")}
        curriculum={
          <CurriculumTrigger
            open={outline}
            panelId="observation-curriculum"
            onToggle={() => setOutline((value) => !value)}
            path={id ? (navigator?.path ?? null) : null}
          />
        }
        studentSwitcher={
          <StudentSwitcher
            academyId={academyId}
            classId={classId}
            membershipId={membershipId}
            name={
              context.student.displayName ??
              context.student.email ??
              membershipId
            }
            className={context.class.name}
          />
        }
        liveStatus={
          current?.materialId
            ? t("observation.student_on", {
                title: current.path?.exercise.title,
              })
            : t("observation.no_material")
        }
        helpQueue={
          <LiveHelpQueue
            academyId={academyId}
            classId={classId}
            currentMembershipId={membershipId}
          />
        }
        answer={
          current?.materialId && current.type ? (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold"
              onClick={() => void select(current.materialId!, current.type!)}
            >
              {t("observation.return_live")}
            </button>
          ) : null
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <MonitoringLiveContent>
          <WorkspaceCurriculumNavigator
            context={navigator ?? null}
            error={
              !id &&
              (emptyRoster.isError ||
                emptyCurriculum.isError ||
                (emptyRoster.isSuccess && !seed))
            }
            unavailable={!id && emptyRoster.isSuccess && !seed}
            onRetry={
              !id
                ? () => {
                    void emptyRoster.refetch();
                    if (seed) void emptyCurriculum.refetch();
                  }
                : undefined
            }
            displayedMaterialId={id ?? ""}
            liveMaterialId={
              current?.state !== "OFFLINE" ? current?.materialId : null
            }
            open={outline}
            panelId="observation-curriculum"
            onClose={() => setOutline(false)}
            footer={{
              href: `${routes.academy(slug)}/teach/classes/${classId}`,
              label: t("workspace.back"),
            }}
            onSelect={(materialId) => {
              const nav = navigator;
              let type: MaterialType = "PROGRAMMING_EXERCISE";
              for (const courseModule of nav?.course.modules ?? [])
                for (const lecture of courseModule.lectures) {
                  if (
                    lecture.documents?.some(
                      (item) => item.materialId === materialId,
                    )
                  )
                    type = "PDF_DOCUMENT";
                  if (
                    lecture.videos?.some(
                      (item) => item.materialId === materialId,
                    )
                  )
                    type = "VIDEO_LESSON";
                  const manual = lecture.manualMaterials?.find(
                    (item) => item.materialId === materialId,
                  );
                  if (manual) type = manual.type;
                }
              void select(materialId, type);
            }}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto">
            {!id ? (
              <div
                role={
                  emptyRoster.isError || emptyCurriculum.isError
                    ? "alert"
                    : "status"
                }
                className="p-5 text-sm text-sub"
              >
                {emptyRoster.isError || emptyCurriculum.isError
                  ? t("observation.load_failed")
                  : t("observation.choose_material")}{" "}
                {emptyRoster.isError || emptyCurriculum.isError ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      void emptyRoster.refetch();
                      if (seed) void emptyCurriculum.refetch();
                    }}
                  >
                    {t("observation.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {watch.error ? (
              <p role="alert" className="p-4">
                {t("observation.load_failed")}
              </p>
            ) : null}
            {id &&
              (material.isError ? (
                <div role="alert" className="p-5">
                  {t("observation.load_failed")}{" "}
                  <button
                    className="underline"
                    onClick={() => void material.refetch()}
                  >
                    {t("observation.retry")}
                  </button>
                </div>
              ) : shown ? (
                <ObservedMaterialView
                  key={shown.materialId}
                  academyId={academyId}
                  classId={classId}
                  membershipId={membershipId}
                  material={shown}
                  work={shownWork}
                  lastSeen={lastSeen}
                  live={isCurrent && watch.state === "live"}
                  alignRevision={alignment}
                />
              ) : (
                <p role="status" className="p-5">
                  {t("observation.loading")}
                </p>
              ))}
          </div>
        </MonitoringLiveContent>
        <MonitoringTutorOutlet />
      </div>
    </main>
  );
}

export function AllMaterialMonitor(
  props: React.ComponentProps<typeof MonitorContent>,
) {
  return (
    <MonitorHistoryHost
      academyId={props.academyId}
      classId={props.classId}
      membershipId={props.membershipId}
      name={props.context.student.displayName ?? props.membershipId}
    >
      <MonitorContent {...props} />
    </MonitorHistoryHost>
  );
}
