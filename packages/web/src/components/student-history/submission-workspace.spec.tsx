// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { HistorySubmission } from "@cove/shared";
import { DraftWorkspace, SubmissionWorkspace } from "./submission-workspace";
const setup = vi.hoisted(() => ({
  read: vi.fn(),
  run: vi.fn(),
  stop: vi.fn(),
  reference: vi.fn(),
  curriculum: vi.fn(),
  manualRun: vi.fn(),
  onChange: null as null | ((s: string) => void),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock("@/i18n", () => ({
  useLocale: () => "en",
  useLayoutTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock("next/dynamic", () => ({
  default: () => (props: { value: string; onChange: (s: string) => void }) => {
    setup.onChange = props.onChange;
    return <pre data-testid="scratch">{props.value}</pre>;
  },
}));
vi.mock("@/lib/manual-api", () => ({
  manualApi: {
    startReview: setup.manualRun,
    stopReview: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    studentWorkHistory: { getSubmission: setup.read },
    monitoring: {
      getExercisePreview: setup.reference,
      getStudentCurriculum: setup.curriculum,
    },
  },
}));
vi.mock("@/components/studio/academy-route-provider", () => ({
  useAcademySlug: () => "academy",
}));
vi.mock("@/components/workspace/curriculum-navigator", () => ({
  WorkspaceCurriculumNavigator: () => <aside data-testid="normal-curriculum" />,
}));
vi.mock("@/components/pdf/grading-notice", () => ({
  GradingNotice: () => null,
}));
vi.mock("@/components/pdf/exercise-reference-pane", () => ({
  ExerciseReferencePane: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock("@/components/workspace/problem-statement", () => ({
  ProblemStatement: ({ exercise }: { exercise: { description: string } }) => (
    <div data-testid="normal-statement">{exercise.description}</div>
  ),
}));
vi.mock("@/components/workspace/font-size-controls", () => ({
  FontSizeControls: () => null,
}));
vi.mock("@/lib/workspace/use-python-runner", () => ({
  usePythonRunner: () => ({
    run: setup.run,
    stop: setup.stop,
    clear: vi.fn(),
    ready: true,
    running: false,
    lines: [],
    supported: true,
    awaitingInput: false,
    submitInput: vi.fn(),
    endInput: vi.fn(),
  }),
}));
vi.mock("@/components/studio/rich-text-frame", () => ({
  RichTextFrame: () => null,
}));
vi.mock("@/components/workspace/terminal-panel", () => ({
  TerminalPanel: () => null,
}));
vi.mock("@/components/manual/gui-viewer", () => ({ GuiViewer: () => null }));
vi.mock("@/components/manual/choice-options", () => ({
  ChoiceOptions: () => null,
}));
vi.mock("@/components/workspace/quiz-feedback", () => ({
  QuizFeedback: () => null,
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setup.run.mockReset();
  setup.stop.mockReset();
  setup.read.mockReset();
  setup.reference.mockReset();
  setup.curriculum.mockReset();
});
it("runs an editable private copy, guards discard and keeps the fetched submission unchanged", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const original: Extract<HistorySubmission, { kind: "programming" }> = {
    kind: "programming",
    review: {
      submissionId: "attempt",
      materialId: "material",
      membershipId: "student",
      studentName: "Student",
      problemTitle: "Saved problem",
      courseTitle: "Course",
      moduleTitle: "Module",
      lectureTitle: "Lecture",
      outlineNumber: null,
      accepted: true,
      runtimeMs: null,
      solveElapsedSec: null,
      createdAt: "2026-11-04T00:00:00Z",
      code: 'print("original")',
      language: "PYTHON",
      score: 100,
      cases: [],
      statement: "",
      passedCount: 0,
      totalCount: 0,
      hiddenPassed: 0,
      hiddenTotal: 0,
    },
  };
  setup.read.mockResolvedValue(original);
  setup.reference.mockResolvedValue({
    studentCode: 'print("current student draft must not replace history")',
    breadcrumb: { course: { title: "Course" }, lecture: { title: "Lecture" } },
    exercise: {
      description: "Full current statement with examples",
      hints: [],
      difficulty: "EASY",
    },
  });
  setup.curriculum.mockResolvedValue(null);
  const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    }),
    host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const guard = { current: null as (() => boolean) | null };
  const register = (next: (() => boolean) | null) => {
    guard.current = next;
  };
  try {
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <SubmissionWorkspace
            academyId="academy"
            classId="class"
            membershipId="student"
            materialId="material"
            submissionId="attempt"
            kind="programming"
            queryScope="viewer"
            onRegisterGuard={register}
            active
            onBack={() => {}}
          />
        </QueryClientProvider>,
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(host.querySelector('[data-testid="scratch"]')?.textContent).toBe(
      'print("original")',
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(
      host.querySelector('[data-testid="normal-statement"]')?.textContent,
    ).toBe("Full current statement with examples");
    expect(host.querySelector('[data-testid="scratch"]')?.textContent).toBe(
      'print("original")',
    );
    expect(setup.reference).toHaveBeenCalledWith({
      academyId: "academy",
      classId: "class",
      membershipId: "student",
      materialId: "material",
    });
    await act(() => setup.onChange?.('print("private")'));
    const run = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent === "history.run",
    )!;
    await act(() => run.click());
    expect(setup.run).toHaveBeenCalledWith('print("private")', undefined);
    expect(original.review.code).toBe('print("original")');
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    expect(guard.current?.()).toBe(false);
  } finally {
    await act(() => root.unmount());
    client.clear();
    host.remove();
  }
});

it.each(["PROGRAMMING_EXERCISE", "TURTLE_EXERCISE"] as const)(
  "gives an unsubmitted %s a full private workspace and isolates its run",
  async (type) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const preview = {
      studentCode: 'print("saved draft")',
      exercise: {
        title: "Draft problem",
        starterCode: "",
        description: "Instructions",
        hints: [],
        difficulty: "EASY",
        sampleTestCases: [],
      },
      breadcrumb: {
        course: { title: "Course" },
        lecture: { title: "Lecture" },
      },
    };
    const material = {
      type,
      title: "Turtle draft",
      description: "Draw a circle",
      files: { "main.py": "import turtle" },
      saved: { files: { "main.py": "import turtle\nturtle.circle(40)" } },
      entryPoint: "main.py",
      question: null,
    };
    setup.reference.mockResolvedValue(preview);
    setup.curriculum.mockResolvedValue(null);
    setup.manualRun.mockResolvedValue({
      id: "private",
      state: "FINISHED",
      output: "private result",
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const source =
      type === "PROGRAMMING_EXERCISE"
        ? preview.studentCode
        : material.saved.files["main.py"];
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <DraftWorkspace
              academyId="academy"
              classId="class"
              membershipId="offline"
              materialId="material"
              name="Offline student"
              queryScope="private"
              active
              onBack={() => {}}
              onRegisterGuard={() => {}}
              {...(type === "PROGRAMMING_EXERCISE"
                ? { preview: preview as never }
                : { material: material as never })}
            />
          </QueryClientProvider>,
        ),
      );
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
      expect(
        host.querySelector('[data-testid="normal-curriculum"]'),
      ).not.toBeNull();
      expect(host.textContent).toContain("Offline student");
      expect(host.textContent).not.toContain("observation.waiting_response");
      expect(host.querySelector('[data-testid="scratch"]')?.textContent).toBe(
        source,
      );
      await act(() => setup.onChange?.('print("private draft test")'));
      const run = [...host.querySelectorAll("button")].find(
        (b) => b.textContent === "history.run",
      )!;
      await act(async () => run.click());
      if (type === "TURTLE_EXERCISE") {
        expect(setup.manualRun).toHaveBeenCalledWith(
          expect.objectContaining({
            membershipId: "offline",
            materialId: "material",
            files: { "main.py": 'print("private draft test")' },
          }),
        );
        expect(
          setup.manualRun.mock.calls.at(-1)?.[0].submissionId,
        ).toBeUndefined();
      } else
        expect(setup.run).toHaveBeenCalledWith(
          'print("private draft test")',
          undefined,
        );
      expect(
        type === "PROGRAMMING_EXERCISE"
          ? preview.studentCode
          : material.saved.files["main.py"],
      ).toBe(source);
    } finally {
      await act(() => root.unmount());
      client.clear();
      host.remove();
    }
  },
);

it.each(["PROGRAMMING_EXERCISE", "TURTLE_EXERCISE"] as const)(
  "shows an empty work panel instead of pretending starter code is student work for %s",
  async (type) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    setup.reference.mockResolvedValue(null);
    setup.curriculum.mockResolvedValue(null);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host),
      client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    try {
      await act(async () =>
        root.render(
          <QueryClientProvider client={client}>
            <DraftWorkspace
              academyId="academy"
              classId="class"
              membershipId="empty"
              materialId="material"
              name="Empty student"
              queryScope="empty"
              active
              embedded
              onBack={() => {}}
              onRegisterGuard={() => {}}
              {...(type === "PROGRAMMING_EXERCISE"
                ? {
                    preview: {
                      studentCode: null,
                      exercise: {
                        title: "Problem",
                        starterCode: "STARTER",
                        description: "Instructions",
                      },
                    } as never,
                  }
                : {
                    material: {
                      type,
                      title: "Turtle",
                      description: "Draw",
                      files: { "main.py": "STARTER" },
                      saved: null,
                      entryPoint: "main.py",
                      question: null,
                    } as never,
                  })}
            />
          </QueryClientProvider>,
        ),
      );
      expect(
        host.querySelector('[data-testid="history-no-work"]'),
      ).not.toBeNull();
      expect(host.querySelector('[data-testid="scratch"]')).toBeNull();
      expect(host.textContent).toContain("Empty student");
      expect(host.textContent).not.toContain("STARTER");
      expect(
        [...host.querySelectorAll("button")].some(
          (b) => b.textContent === "history.run",
        ),
      ).toBe(false);
      expect(
        host.querySelector('[data-testid="embedded-review-header"]'),
      ).not.toBeNull();
      expect(host.querySelector("h1")).toBeNull();
    } finally {
      await act(() => root.unmount());
      client.clear();
      host.remove();
    }
  },
);
