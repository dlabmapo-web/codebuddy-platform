// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { TutorStudentWork } from "./tutor-student-work";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  preview: vi.fn(),
  live: vi.fn(),
  run: vi.fn(),
  stop: vi.fn(),
  clear: vi.fn(),
  change: null as null | ((value: string) => void),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/orpc", () => ({
  orpc: {
    studentWorkHistory: { listAttempts: mocks.list },
    monitoring: {
      getExercisePreview: mocks.preview,
      getStudentContext: mocks.live,
    },
  },
}));
vi.mock("./submission-workspace", () => ({
  DraftWorkspace: (p: {
    membershipId: string;
    preview?: { studentCode: string };
    material?: { type: string };
  }) => (
    <p data-testid="draft-work">
      {p.membershipId}/{p.preview?.studentCode ?? p.material?.type}
    </p>
  ),
  SubmissionWorkspace: (p: { membershipId: string; submissionId: string }) => (
    <p data-testid="selected-work">
      {p.membershipId}/{p.submissionId}
    </p>
  ),
}));
vi.mock("@/components/studio/choice-selector", () => ({
  ChoiceSelector: () => null,
}));
vi.mock("@/components/monitoring/observed-material-view", () => ({
  ObservedMaterialView: () => null,
}));
vi.mock("@/components/studio/rich-text-frame", () => ({
  RichTextFrame: () => null,
}));
vi.mock("@/components/workspace/terminal-panel", () => ({
  TerminalPanel: () => null,
}));
vi.mock("@/lib/workspace/use-python-runner", () => ({
  usePythonRunner: () => ({
    run: mocks.run,
    stop: mocks.stop,
    clear: mocks.clear,
    ready: true,
    running: false,
    lines: [],
    awaitingInput: false,
    supported: true,
  }),
}));
vi.mock("next/dynamic", () => ({
  default: () => (p: { value: string; onChange: (s: string) => void }) => {
    mocks.change = p.onChange;
    return <pre data-testid="private-editor">{p.value}</pre>;
  },
}));
const pagination = { page: 1, pageCount: 1, totalCount: 1, pageSize: 20 };
const attempt = (id: string) => ({
  id,
  kind: "programming",
  createdAt: "2026-11-04T00:00:00Z",
  score: 100,
  maximum: 100,
  completed: true,
  status: "PASSED",
  currentRevision: true,
});
const props = {
  academyId: "academy",
  classId: "class",
  membershipId: "A",
  materialId: "same-exercise",
  materialType: "PROGRAMMING_EXERCISE" as const,
  name: "Student",
  queryScope: "viewer",
  onRegisterGuard: vi.fn(),
  onBack: vi.fn(),
};
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host),
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = async (membershipId: string) =>
    act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <TutorStudentWork {...props} membershipId={membershipId} />
        </QueryClientProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
  return {
    host,
    render,
    dispose: async () => {
      await act(() => root.unmount());
      client.clear();
      host.remove();
    },
  };
}
it("pins the selected student/material and ignores a late attempt response from the previous student", async () => {
  let release!: (value: unknown) => void;
  mocks.list.mockImplementation(({ membershipId }: { membershipId: string }) =>
    membershipId === "A"
      ? new Promise((resolve) => {
          release = resolve;
        })
      : Promise.resolve({
          attempts: [attempt("B-latest"), attempt("B-old")],
          pagination,
        }),
  );
  const ui = await mount();
  try {
    await ui.render("A");
    await ui.render("B");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(
      ui.host.querySelector('[data-testid="selected-work"]')?.textContent,
    ).toBe("B/B-latest");
    await act(async () => {
      release({ attempts: [attempt("A-latest")], pagination });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(
      ui.host.querySelector('[data-testid="selected-work"]')?.textContent,
    ).toBe("B/B-latest");
    expect(mocks.list).toHaveBeenCalledWith({
      academyId: "academy",
      classId: "class",
      membershipId: "B",
      materialId: "same-exercise",
      page: 1,
    });
    expect(mocks.live).not.toHaveBeenCalled();
  } finally {
    await ui.dispose();
  }
});
it("opens unsubmitted saved code as a private draft without starting a live watch or changing its source", async () => {
  mocks.list.mockResolvedValue({
    attempts: [],
    pagination: { ...pagination, totalCount: 0, pageCount: 0 },
  });
  const saved = {
    studentCode: 'print("saved")',
    exercise: {
      title: "Problem",
      description: "Instructions",
      starterCode: 'print("starter")',
    },
  };
  mocks.preview.mockResolvedValue(saved);
  const ui = await mount();
  try {
    await ui.render("offline");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(
      ui.host.querySelector('[data-testid="draft-work"]')?.textContent,
    ).toBe('offline/print("saved")');
    expect(saved.studentCode).toBe('print("saved")');
    expect(mocks.live).not.toHaveBeenCalled();
    expect(mocks.preview).toHaveBeenCalledWith({
      academyId: "academy",
      classId: "class",
      membershipId: "offline",
      materialId: "same-exercise",
    });
  } finally {
    await ui.dispose();
  }
});
