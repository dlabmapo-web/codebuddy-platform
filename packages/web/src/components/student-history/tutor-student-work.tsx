"use client";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@cove/i18n/format";
import type { MaterialType } from "@cove/shared";
import { useLocale } from "@/i18n";
import { orpc } from "@/lib/orpc";
import { ChoiceSelector } from "@/components/studio/choice-selector";
import { ObservedMaterialView } from "@/components/monitoring/observed-material-view";
import { DraftWorkspace, SubmissionWorkspace } from "./submission-workspace";
import { HistoryError, HistoryPager, historyAction } from "./history-ui";
type Props = {
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
  materialType?: MaterialType;
  name: string;
  materialTitle?: string;
  queryScope: string;
  onRegisterGuard: (next: (() => boolean) | null) => void;
  onBack: () => void;
  backLabel?: string;
  onSelectMaterial?: (materialId: string) => void;
  embedded?: boolean;
  initialSubmissionId?: string;
  initialAttemptPage?: number;
};
export function TutorStudentWork(props: Props) {
  const [materialId, setMaterialId] = React.useState(props.materialId);
  return (
    <StudentWorkForMaterial
      key={`${props.membershipId}:${materialId}`}
      {...props}
      materialId={materialId}
      onSelectMaterial={props.onSelectMaterial ?? setMaterialId}
    />
  );
}
function StudentWorkForMaterial(props: Props) {
  const { t } = useTranslation("teach"),
    locale = useLocale();
  const onRegisterGuard = props.onRegisterGuard;
  const guard = React.useRef<(() => boolean) | null>(null);
  const register = React.useCallback(
    (next: (() => boolean) | null) => {
      guard.current = next;
      onRegisterGuard(next);
    },
    [onRegisterGuard],
  );
  const [page, setPage] = React.useState(props.initialAttemptPage ?? 1),
    [selected, setSelected] = React.useState<string | null>(
      props.initialSubmissionId ?? null,
    );
  const { academyId, classId, membershipId, materialId } = props;
  const query = useQuery({
    queryKey: [
      "tutor-attempts",
      props.queryScope,
      academyId,
      classId,
      membershipId,
      materialId,
      page,
    ],
    queryFn: () =>
      orpc.studentWorkHistory.listAttempts({
        academyId,
        classId,
        membershipId,
        materialId,
        page,
      }),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (query.isError)
    return (
      <div className="p-5">
        <button className={historyAction} onClick={props.onBack}>
          {props.backLabel ?? t("history.return_monitoring")}
        </button>
        <HistoryError retry={() => void query.refetch()} />
      </div>
    );
  if (query.isPending)
    return (
      <p role="status" className="p-5">
        {t("history.loading")}
      </p>
    );
  const attempt =
    query.data.attempts.find((a) => a.id === selected) ??
    query.data.attempts[0];
  const changePage = (next: number) => {
    if (guard.current?.() !== false) {
      setSelected(null);
      setPage(next);
    }
  };
  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="tutor-student-work"
    >
      {attempt ? (
        <>
          <SubmissionWorkspace
            key={attempt.id}
            {...props}
            submissionId={attempt.id}
            kind={attempt.kind}
            active
            onRegisterGuard={register}
            onSelectMaterial={(id) => {
              if (guard.current?.() !== false) props.onSelectMaterial?.(id);
            }}
            backLabel={props.backLabel ?? t("history.return_monitoring")}
            headerActions={
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <div className="w-56 max-w-full">
                  <ChoiceSelector
                    label={t("history.attempts")}
                    selectedId={attempt.id}
                    list={query.data.attempts.map((a, i) => ({
                      id: a.id,
                      name: `${page === 1 && i === 0 ? t("history.latest") + " · " : ""}${formatDateTime(a.createdAt, locale)}`,
                    }))}
                    onSelect={(item) => {
                      if (guard.current?.() !== false) setSelected(item.id);
                    }}
                  />
                </div>
                <HistoryPager
                  pagination={query.data.pagination}
                  onPage={changePage}
                />
              </div>
            }
          />
        </>
      ) : (
        <UnsubmittedWork
          {...props}
          materialType={query.data.material?.type ?? props.materialType}
          onRegisterGuard={register}
        />
      )}
    </div>
  );
}
function UnsubmittedWork(props: Props) {
  const { t } = useTranslation("teach");
  const { academyId, classId, membershipId, materialId } = props;
  const programming = props.materialType === "PROGRAMMING_EXERCISE";
  const query = useQuery({
    queryKey: [
      "tutor-saved-draft",
      props.queryScope,
      academyId,
      classId,
      membershipId,
      materialId,
      programming,
    ],
    queryFn: async () =>
      programming
        ? {
            kind: "code" as const,
            data: await orpc.monitoring.getExercisePreview({
              academyId,
              classId,
              membershipId,
              materialId,
            }),
          }
        : {
            kind: "material" as const,
            data: await orpc.monitoring.getObservedMaterial({
              academyId,
              classId,
              membershipId,
              materialId,
            }),
          },
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (query.isError)
    return (
      <div className="p-5">
        <button className={historyAction} onClick={props.onBack}>
          {props.backLabel ?? t("history.return_monitoring")}
        </button>
        <HistoryError retry={() => void query.refetch()} />
      </div>
    );
  if (!query.data)
    return (
      <p role="status" className="p-5">
        {t("history.loading")}
      </p>
    );
  return query.data.kind === "code" ? (
    <DraftWorkspace {...props} preview={query.data.data} active />
  ) : query.data.data.type === "TURTLE_EXERCISE" ? (
    <DraftWorkspace {...props} material={query.data.data} active />
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-border p-4">
        <button className={historyAction} onClick={props.onBack}>
          {props.backLabel ?? t("history.return_monitoring")}
        </button>
        <div>
          <h2 className="font-bold">
            {props.name} · {query.data.data.title}
          </h2>
          <p className="text-xs text-sub">{t("history.draft_only")}</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <ObservedMaterialView
          {...props}
          material={query.data.data}
          work={null}
          live={false}
          alignRevision={0}
        />
      </div>
    </div>
  );
}
