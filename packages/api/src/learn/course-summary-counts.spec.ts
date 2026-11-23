import { describe, expect, it } from "vitest";
import { courseSummaryFor, type VisibleCourse } from "./curriculum-outline.service.js";

const pdf = (id: string, placement: "MAIN" | "BOTH" | "SUPPLEMENTARY", state = "READY") => ({
  id, type: "PDF_DOCUMENT", pdfDocument: { placement, asset: { state } },
});

describe("student course card counts (QA S-02)", () => {
  it("counts only PDFs a student opens as a lesson, beside explanations", () => {
    const course = {
      id: "course", title: "Python", description: "",
      modules: [{ lectures: [{ materials: [
        { id: "e", type: "EXPLANATION" },
        pdf("main", "MAIN"), pdf("both", "BOTH"), pdf("extra", "SUPPLEMENTARY"), pdf("pending", "MAIN", "PROCESSING"),
      ] }] }],
    } as unknown as VisibleCourse;
    const { counts } = courseSummaryFor(course, new Map());
    expect(counts.documents).toBe(2);
    expect(counts.explanations).toBe(1);
  });
});
