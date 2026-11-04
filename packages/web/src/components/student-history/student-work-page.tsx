"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAcademySlug } from "@/components/studio/academy-route-provider";
import { routes } from "@/lib/routes";
import { TutorStudentWork } from "./tutor-student-work";

/** Full viewport review, outside StudioShell. No collaboration document is opened. */
export function StudentWorkPage(props: {
  academyId: string;
  classId: string;
  membershipId: string;
  materialId: string;
  name: string;
  returnTo?: string;
  initialSubmissionId?: string;
  initialAttemptPage?: number;
}) {
  const router = useRouter(),
    slug = useAcademySlug(),
    { t } = useTranslation("teach");
  const guard = React.useRef<(() => boolean) | null>(null);
  const [nonce] = React.useState(() => crypto.randomUUID());
  const register = React.useCallback((next: (() => boolean) | null) => {
    guard.current = next;
  }, []);
  const dashboard = routes.academyTeachProgress(slug, props.classId);
  // Only return to this class's dashboard; a query parameter cannot redirect elsewhere.
  const back =
    props.returnTo === dashboard || props.returnTo?.startsWith(dashboard + "?")
      ? props.returnTo
      : dashboard + "?view=students&student=" + props.membershipId;
  React.useEffect(() => {
    const href = location.href;
    const checkpoint = () =>
      window.history.pushState(
        { ...window.history.state, coveReviewCheckpoint: nonce },
        "",
        href,
      );
    // A same-URL history entry lets Back reach the guard while this workspace
    // is still mounted. A pop to another Next route can unmount it first.
    if (window.history.state?.coveReviewCheckpoint !== nonce) checkpoint();
    const pop = (event: PopStateEvent) => {
      if (location.href !== href) return;
      event.stopImmediatePropagation();
      if (guard.current?.() === false) checkpoint();
      else window.history.back();
    };
    window.addEventListener("popstate", pop, true);
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
        link.hasAttribute("download") ||
        link.href === location.href
      )
        return;
      if (guard.current?.() === false) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener("click", leaving, true);
    return () => {
      window.removeEventListener("popstate", pop, true);
      document.removeEventListener("click", leaving, true);
    };
  }, [nonce]);
  return (
    <main
      className="flex h-dvh min-h-0 flex-col overflow-hidden bg-card text-ink"
      data-history-private
      data-testid="student-work-page"
    >
      <TutorStudentWork
        {...props}
        queryScope={nonce}
        onRegisterGuard={register}
        backLabel={t("history.back_history")}
        onBack={() => {
          if (guard.current?.() !== false) router.push(back);
        }}
        onSelectMaterial={(id) => {
          router.push(
            routes.academyTeachStudentWork(
              slug,
              props.classId,
              props.membershipId,
              id,
            ) +
              "?returnTo=" +
              encodeURIComponent(back),
          );
        }}
      />
    </main>
  );
}
