// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HistorySummary } from "@cove/shared";
import { HistoryStudentOverview } from "./history-overview";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("./history-ui", () => ({ HistorySelect: () => null }));
afterEach(() => vi.unstubAllGlobals());
const summary: HistorySummary = {
  student: {
    membershipId: "member",
    name: "Selected student",
    identifier: "student@example.com",
  },
  className: "Class",
  courses: [],
  modules: [],
  lectures: [],
  asOf: "2026-11-04T00:00:00Z",
  enrolledAt: null,
  completed: 0,
  eligible: 0,
  programmingCompleted: 0,
  manualCompleted: 0,
  programmingSubmissions: 0,
  manualSubmissions: 0,
  averageScore: null,
  evaluatedItems: 0,
  activeSeconds: 0,
  firstRecordedAt: null,
  lastActiveAt: null,
  latestSubmissionAt: null,
  totalScore: 0,
  maximumScore: 0,
  courseProgress: [],
  learningDays: [],
};
it.each([false, true])(
  "keeps enrollment and completion claims tied to recorded facts (complete=%s)",
  async (complete) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const data = complete
      ? {
          ...summary,
          enrolledAt: "2025-12-02T00:00:00Z",
          completed: 2,
          eligible: 2,
        }
      : summary;
    try {
      await act(() =>
        root.render(
          <HistoryStudentOverview
            data={data}
            course=""
            onCourseChange={() => {}}
          />,
        ),
      );
      expect(host.textContent).toContain("Selected student");
      expect(host.textContent).toContain("student@example.com");
      expect(host.textContent).toContain(
        complete ? "history.completion_met" : "history.no_requirements",
      );
      expect(
        host
          .querySelector('[role="progressbar"]')
          ?.getAttribute("aria-valuenow"),
      ).toBe(complete ? "100" : "0");
      const enrollment = host.querySelector(
        '[data-testid="history-enrollment"]',
      )!;
      expect(enrollment.textContent).toContain(
        complete ? "Dec 2, 2025" : "history.not_recorded",
      );
      if (!complete)
        expect(enrollment.textContent).not.toContain("history.unlimited");
      expect(host.querySelector('svg[role="img"] title')?.textContent).toBe(
        "history.daily_time",
      );
    } finally {
      await act(() => root.unmount());
      host.remove();
    }
  },
);
