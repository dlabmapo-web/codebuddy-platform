// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryWorkspace } from "./history-workspace";

const setup = vi.hoisted(() => {
  const pending = () => new Promise(() => undefined);
  return {
    search: "",
    replace: vi.fn(),
    push: vi.fn(),
    reads: {
      listStudentRoster: vi.fn(pending),
      listMaterialStudents: vi.fn(pending),
      getStudentSummary: vi.fn(pending),
      listStudentMaterials: vi.fn(pending),
      listAttempts: vi.fn(pending),
    },
  };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (s: string) => s }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(setup.search),
  useRouter: () => ({ replace: setup.replace, push: setup.push }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="saved-review" />,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "teacher" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));
vi.mock("@/lib/orpc", () => ({ orpc: { studentWorkHistory: setup.reads } }));
vi.mock("@/components/studio/academy-route-provider", () => ({
  useAcademySlug: () => "academy",
}));
vi.mock("./history-materials", () => ({ HistoryMaterialGroups: () => null }));
vi.mock("./history-overview", () => ({ HistoryStudentOverview: () => null }));

const ids = {
  academy: "00000000-0000-4000-8000-000000000001",
  klass: "00000000-0000-4000-8000-000000000002",
  student: "00000000-0000-4000-8000-000000000003",
  material: "00000000-0000-4000-8000-000000000004",
  attempt: "00000000-0000-4000-8000-000000000005",
};
let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
async function mount(search: string) {
  setup.search = search;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient();
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <HistoryWorkspace academyId={ids.academy} classId={ids.klass} standalone />
      </QueryClientProvider>,
    );
  });
  // The session resolves, then the content mounts and runs its effects.
  await act(async () => undefined);
  return host;
}

it("opens an old review bookmark on the student-work page without drawing or reading the review first", async () => {
  const host = await mount(`view=students&student=${ids.student}&reviewMaterial=${ids.material}&attempt=${ids.attempt}`);

  expect(setup.replace).toHaveBeenCalledTimes(1);
  const target = new URL(setup.replace.mock.calls[0]![0], "http://localhost");
  expect(target.pathname).toContain(`/students/${ids.student}/work/${ids.material}`);
  expect(target.searchParams.get("attempt")).toBe(ids.attempt);
  // Nothing a click could land on before the page is replaced, and no reads.
  expect(host.querySelector('[data-testid="student-history-workspace"]')).toBeNull();
  expect(host.querySelector('[data-testid="saved-review"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe("history.loading");
  for (const read of Object.values(setup.reads)) expect(read).not.toHaveBeenCalled();
});

it("still shows the history workspace for a student without a bookmarked attempt", async () => {
  const host = await mount(`view=students&student=${ids.student}&reviewMaterial=${ids.material}`);

  expect(setup.replace).not.toHaveBeenCalled();
  expect(host.querySelector('[data-testid="student-history-workspace"]')).not.toBeNull();
  expect(setup.reads.listStudentRoster).toHaveBeenCalledTimes(1);
  expect(setup.reads.listAttempts).toHaveBeenCalledTimes(1);
});
