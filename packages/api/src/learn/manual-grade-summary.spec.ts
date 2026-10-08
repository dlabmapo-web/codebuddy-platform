import { describe, it, expect } from "vitest";
import {
  manualGradeSummaryFor,
  type ProgressByMaterial,
} from "./curriculum-outline.service.js";
type Course = Parameters<typeof manualGradeSummaryFor>[0];
const course = {
  modules: [
    {
      lectures: [
        {
          materials: [
            {
              id: "reviewed",
              manualMaterial: {
                includeInScore: true,
                maximumHundredths: 10000,
              },
            },
            {
              id: "pending",
              manualMaterial: { includeInScore: true, maximumHundredths: 5000 },
            },
            {
              id: "not-submitted",
              manualMaterial: { includeInScore: true, maximumHundredths: 2000 },
            },
            {
              id: "excluded",
              manualMaterial: {
                includeInScore: false,
                maximumHundredths: 10000,
              },
            },
          ],
        },
      ],
    },
  ],
} as unknown as Course;
describe("manual course assessment projection", () => {
  it("counts published scores and frozen maxima, excludes practice and distinguishes pending from unsubmitted", () => {
    const statuses: ProgressByMaterial = new Map([
      [
        "reviewed",
        {
          status: "SOLVED",
          bestScore: 0,
          scoreHundredths: 8750,
          maximumHundredths: 10000,
        },
      ],
      [
        "pending",
        { status: "IN_PROGRESS", bestScore: 0, maximumHundredths: 6000 },
      ],
      [
        "excluded",
        { status: "IN_PROGRESS", bestScore: 0, maximumHundredths: 10000 },
      ],
    ]);
    expect(manualGradeSummaryFor(course, statuses)).toEqual({
      maximumHundredths: 18000,
      scoreHundredths: 8750,
      reviewed: 1,
      pending: 1,
    });
  });
  it("treats a published zero as reviewed rather than awaiting review", () => {
    const statuses: ProgressByMaterial = new Map([
      [
        "reviewed",
        {
          status: "IN_PROGRESS",
          bestScore: 0,
          scoreHundredths: 0,
          maximumHundredths: 10000,
        },
      ],
    ]);
    expect(manualGradeSummaryFor(course, statuses)).toEqual({
      maximumHundredths: 17000,
      scoreHundredths: 0,
      reviewed: 1,
      pending: 0,
    });
  });
});
