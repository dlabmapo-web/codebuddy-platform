import { z } from "zod";
export type HistoryState = {
  student: string;
  course: string;
  material: string;
  attempt: string;
  kind: "programming" | "manual";
  mode: "student" | "material";
  rosterQ: string;
  rosterPage: number;
  q: string;
  page: number;
  attemptPage: number;
  type: string;
  status: string;
  module: string;
  lecture: string;
  submitted: string;
};
const id = (value: string | null) =>
  z.uuid().safeParse(value).success ? value! : "";
const page = (value: string | null) =>
  Math.min(100000, Math.max(1, Number.parseInt(value ?? "1", 10) || 1));
export function readHistoryState(search: string): HistoryState {
  const p = new URLSearchParams(search);
  return {
    student: id(p.get("student")),
    course: id(p.get("course")),
    material: id(p.get("reviewMaterial")),
    attempt: id(p.get("attempt")),
    kind: p.get("attemptKind") === "manual" ? "manual" : "programming",
    mode: p.get("historyMode") === "material" ? "material" : "student",
    rosterQ: (p.get("rosterQ") ?? "").slice(0, 120),
    rosterPage: page(p.get("rosterPage")),
    q: (p.get("q") ?? "").slice(0, 120),
    page: page(p.get("historyPage")),
    attemptPage: page(p.get("attemptPage")),
    type: p.get("type") ?? "",
    status: p.get("workStatus") ?? "",
    module: id(p.get("module")),
    lecture: id(p.get("lecture")),
    submitted: p.get("submitted") ?? "",
  };
}
export function writeHistoryState(search: string, state: HistoryState) {
  const p = new URLSearchParams(search);
  p.set("view", "students");
  for (const [key, value] of Object.entries({
    student: state.student,
    course: state.course,
    reviewMaterial: state.material,
    attempt: state.attempt,
    attemptKind: state.attempt ? state.kind : "",
    historyMode: state.mode === "material" ? "material" : "",
    rosterQ: state.rosterQ,
    rosterPage: state.rosterPage === 1 ? "" : state.rosterPage,
    q: state.q,
    historyPage: state.page === 1 ? "" : state.page,
    attemptPage: state.attemptPage === 1 ? "" : state.attemptPage,
    type: state.type,
    workStatus: state.status,
    module: state.module,
    lecture: state.lecture,
    submitted: state.submitted,
  })) {
    if (value === "") p.delete(key);
    else p.set(key, String(value));
  }
  return p.toString();
}
