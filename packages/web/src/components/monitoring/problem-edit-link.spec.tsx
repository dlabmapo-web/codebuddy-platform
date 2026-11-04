// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { MonitoringPublicExercise } from "@cove/shared";
import { HistoryPresentationContext } from "@/lib/monitoring/history-presentation";
import { MonitoringProblemEditLink } from "./problem-edit-link";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: (props: React.ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/components/studio/academy-route-provider", () => ({
  useAcademySlug: () => "academy",
}));

it("keeps the workspace until pending edits settle and honors a cancelled private-copy exit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  let settle!: (accepted: boolean) => void;
  const prepare = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      }),
  );
  const exercise = {
    breadcrumb: {
      course: { id: "displayed-course" },
      lecture: { id: "displayed-lecture" },
    },
    exercise: { materialId: "displayed-problem" },
  } as MonitoringPublicExercise;
  try {
    await act(() =>
      root.render(
        <HistoryPresentationContext.Provider
          value={{
            covered: false,
            revoke: vi.fn(),
            setConnection: vi.fn(),
            open: vi.fn(),
            setMaterial: vi.fn(),
            beforeNavigate: prepare,
          }}
        >
          <MonitoringProblemEditLink canEdit exercise={exercise} />
        </HistoryPresentationContext.Provider>,
      ),
    );
    const link = element.querySelector("a")!;
    await act(() => link.click());
    expect(push).not.toHaveBeenCalled();
    await act(async () => settle(false));
    expect(push).not.toHaveBeenCalled();
    await act(() => link.click());
    expect(push).not.toHaveBeenCalled();
    await act(async () => settle(true));
    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/academy/academy/content/courses/displayed-course/lectures/displayed-lecture/exercises/displayed-problem",
    );
  } finally {
    await act(() => root.unmount());
    element.remove();
    vi.unstubAllGlobals();
    push.mockReset();
  }
});
