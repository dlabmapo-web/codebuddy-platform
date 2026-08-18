import { describe, expect, it } from "vitest";

import { resolveOverviewPeriod } from "./teacher-overview.js";
import {
  academyProfileCompletion,
  activeLearnerRate,
  buildStudentGrowth,
  classGaps,
  compareIncompleteClasses,
  growthChangePercent,
  exerciseCompletion,
  invitationIsExpiring,
  isSupportedTimeZone,
  previousPeriodOf,
  selectHighlightClass,
  updateAcademyProfileInputSchema,
  type ClassComparisonRow,
  type IncompleteClass,
} from "./manager-overview.js";

const SEOUL = "Asia/Seoul";

describe("exerciseCompletion", () => {
  it("keeps unattempted assigned work in the denominator", () => {
    expect(exerciseCompletion({
      solvedProblems: 2,
      enrolledStudents: 2,
      assignedExercises: 5,
    })).toBe(20);
  });

  it("has no measurement without students or assigned exercises", () => {
    expect(exerciseCompletion({
      solvedProblems: 0,
      enrolledStudents: 2,
      assignedExercises: 0,
    })).toBeNull();
  });
});

describe("academyProfileCompletion", () => {
  const filled = {
    addressLine1: "12 Mapo-daero",
    locality: "Seoul",
    contactPhone: "02-000-0000",
    contactEmail: "hello@example.com",
  };

  it("reports a fully filled profile as complete", () => {
    expect(academyProfileCompletion(filled)).toEqual({
      isComplete: true,
      missing: [],
    });
  });

  it("names every empty required field", () => {
    expect(
      academyProfileCompletion({
        ...filled,
        addressLine1: null,
        contactEmail: null,
      }),
    ).toEqual({
      isComplete: false,
      missing: ["addressLine1", "contactEmail"],
    });
  });

  it("treats whitespace as unset", () => {
    expect(
      academyProfileCompletion({ ...filled, contactPhone: "   " }).missing,
    ).toEqual(["contactPhone"]);
  });
});

describe("activeLearnerRate", () => {
  it("publishes both sides of the fraction", () => {
    expect(activeLearnerRate({ activeStudents: 7, enrolledStudents: 20 })).toEqual({
      state: "measured",
      percent: 35,
      activeStudents: 7,
      enrolledStudents: 20,
    });
  });

  it("says there are no students rather than reporting nought percent", () => {
    const rate = activeLearnerRate({ activeStudents: 0, enrolledStudents: 0 });
    expect(rate.state).toBe("no_students");
    expect(rate.percent).toBeNull();
  });

  it("reports nought percent when a roster exists and nobody worked", () => {
    expect(activeLearnerRate({ activeStudents: 0, enrolledStudents: 12 })).toMatchObject(
      { state: "measured", percent: 0 },
    );
  });

  it("cannot exceed one hundred percent when the two counts disagree", () => {
    expect(
      activeLearnerRate({ activeStudents: 14, enrolledStudents: 10 }).percent,
    ).toBe(100);
  });
});

describe("classGaps", () => {
  it("reports every missing prerequisite at once", () => {
    expect(
      classGaps({
        hasActiveTeacher: false,
        enrolledStudents: 0,
        assignedCourses: 0,
      }),
    ).toEqual(["no_teacher", "no_students", "no_course"]);
  });

  it("reports nothing for a class that is ready to teach", () => {
    expect(
      classGaps({
        hasActiveTeacher: true,
        enrolledStudents: 8,
        assignedCourses: 1,
      }),
    ).toEqual([]);
  });

  it("puts the missing teacher first", () => {
    expect(
      classGaps({
        hasActiveTeacher: false,
        enrolledStudents: 3,
        assignedCourses: 0,
      }),
    ).toEqual(["no_teacher", "no_course"]);
  });
});

describe("compareIncompleteClasses", () => {
  const build = (partial: Partial<IncompleteClass>): IncompleteClass => ({
    classId: "00000000-0000-4000-8000-000000000001",
    className: "Python A",
    gaps: ["no_course"],
    enrolledStudents: 5,
    ...partial,
  });

  it("puts the class missing most first", () => {
    const rows = [
      build({ gaps: ["no_course"] }),
      build({ gaps: ["no_teacher", "no_students", "no_course"], className: "B" }),
    ].sort(compareIncompleteClasses);
    expect(rows[0].className).toBe("B");
  });

  it("breaks a tie on the emptiest class, then the name", () => {
    const rows = [
      build({ className: "Zulu", enrolledStudents: 2 }),
      build({ className: "Alpha", enrolledStudents: 2 }),
      build({ className: "Mike", enrolledStudents: 0 }),
    ].sort(compareIncompleteClasses);
    expect(rows.map((row) => row.className)).toEqual(["Mike", "Alpha", "Zulu"]);
  });
});

describe("invitationIsExpiring", () => {
  const now = new Date("2026-08-18T03:00:00.000Z");

  it("flags an invitation inside the seven day window", () => {
    expect(
      invitationIsExpiring({ expiresAt: new Date("2026-08-22T03:00:00Z"), now }),
    ).toBe(true);
  });

  it("leaves an invitation outside the window alone", () => {
    expect(
      invitationIsExpiring({ expiresAt: new Date("2026-09-01T03:00:00Z"), now }),
    ).toBe(false);
  });

  it("keeps flagging an invitation that already lapsed", () => {
    expect(
      invitationIsExpiring({ expiresAt: new Date("2026-08-01T03:00:00Z"), now }),
    ).toBe(true);
  });
});

describe("previousPeriodOf", () => {
  it("returns the equal length period immediately before", () => {
    const period = resolveOverviewPeriod({
      range: "7d",
      now: new Date("2026-08-18T03:00:00.000Z"),
      timeZone: SEOUL,
    });
    expect(period.startDate).toBe("2026-08-12");
    expect(previousPeriodOf(period)).toEqual({
      startDate: "2026-08-05",
      endDate: "2026-08-11",
    });
  });

  it("has no baseline for an all time range", () => {
    const period = resolveOverviewPeriod({
      range: "all",
      now: new Date("2026-08-18T03:00:00.000Z"),
      timeZone: SEOUL,
    });
    expect(previousPeriodOf(period)).toBeNull();
  });
});

describe("buildStudentGrowth", () => {
  const period = resolveOverviewPeriod({
    range: "7d",
    now: new Date("2026-08-18T03:00:00.000Z"),
    timeZone: SEOUL,
  });

  it("draws every day in the period, including the quiet ones", () => {
    const growth = buildStudentGrowth({
      joinsByDate: [
        { date: "2026-08-13", joined: 2 },
        { date: "2026-08-18", joined: 1 },
      ],
      period,
      previousJoined: 2,
    });
    expect(growth.days).toHaveLength(7);
    expect(growth.days.map((day) => day.joined)).toEqual([0, 2, 0, 0, 0, 0, 1]);
    expect(growth.joined).toBe(3);
    expect(growth.changePercent).toBe(50);
  });

  it("takes an all time axis from the earliest join", () => {
    const allTime = resolveOverviewPeriod({
      range: "all",
      now: new Date("2026-08-18T03:00:00.000Z"),
      timeZone: SEOUL,
    });
    const growth = buildStudentGrowth({
      joinsByDate: [{ date: "2026-08-16", joined: 4 }],
      period: allTime,
      previousJoined: null,
    });
    expect(growth.days.map((day) => day.date)).toEqual([
      "2026-08-16",
      "2026-08-17",
      "2026-08-18",
    ]);
    expect(growth.changePercent).toBeNull();
  });

  it("still draws an axis for an academy nobody has joined", () => {
    const allTime = resolveOverviewPeriod({
      range: "all",
      now: new Date("2026-08-18T03:00:00.000Z"),
      timeZone: SEOUL,
    });
    const growth = buildStudentGrowth({
      joinsByDate: [],
      period: allTime,
      previousJoined: null,
    });
    expect(growth.days).toEqual([{ date: "2026-08-18", joined: 0 }]);
  });
});

describe("growthChangePercent", () => {
  it("refuses to divide by an empty baseline", () => {
    expect(growthChangePercent(9, 0)).toBeNull();
    expect(growthChangePercent(9, null)).toBeNull();
  });

  it("reports a decline as a negative whole percent", () => {
    expect(growthChangePercent(3, 12)).toBe(-75);
  });
});

describe("selectHighlightClass", () => {
  const build = (partial: Partial<ClassComparisonRow>): ClassComparisonRow => ({
    classId: "00000000-0000-4000-8000-00000000000a",
    className: "Python A",
    teacherName: "Kim",
    enrolledStudents: 10,
    activeStudents: 8,
    activeLearnerRate: 80,
    medianActiveSeconds: 1800,
    exerciseCompletion: 60,
    conceptMastery: 70,
    studentsNeedingAttention: 1,
    lastActivityAt: "2026-08-18T03:00:00.000Z",
    ...partial,
  });

  it("will not highlight a class below the eligibility floor", () => {
    const highlight = selectHighlightClass([
      build({ className: "Tiny", enrolledStudents: 2, activeLearnerRate: 100 }),
      build({ className: "Real", enrolledStudents: 20, activeLearnerRate: 85 }),
    ]);
    expect(highlight?.className).toBe("Real");
  });

  it("breaks a rate tie on concept mastery, then the name", () => {
    const highlight = selectHighlightClass([
      build({ className: "Zulu", conceptMastery: 50 }),
      build({ className: "Alpha", conceptMastery: 90 }),
    ]);
    expect(highlight?.className).toBe("Alpha");
  });

  it("returns nothing when no class was measured", () => {
    expect(
      selectHighlightClass([build({ activeLearnerRate: null })]),
    ).toBeNull();
    expect(selectHighlightClass([])).toBeNull();
  });
});

describe("updateAcademyProfileInputSchema", () => {
  const base = {
    academyId: "00000000-0000-4000-8000-00000000000b",
    addressLine1: "12 Mapo-daero",
    addressLine2: null,
    locality: "Seoul",
    region: null,
    postalCode: "04174",
    countryCode: "kr",
    contactPhone: "02-000-0000",
    contactEmail: "hello@example.com",
    timeZone: "Asia/Seoul",
  };

  it("normalizes a blank field to unset rather than to an empty answer", () => {
    const parsed = updateAcademyProfileInputSchema.parse({
      ...base,
      addressLine2: "   ",
      region: "",
    });
    expect(parsed.addressLine2).toBeNull();
    expect(parsed.region).toBeNull();
  });

  it("upper cases the country code", () => {
    expect(updateAcademyProfileInputSchema.parse(base).countryCode).toBe("KR");
  });

  it("refuses a timezone the runtime cannot resolve", () => {
    expect(
      updateAcademyProfileInputSchema.safeParse({
        ...base,
        timeZone: "Mars/Olympus",
      }).success,
    ).toBe(false);
  });

  it("refuses an address longer than the column", () => {
    expect(
      updateAcademyProfileInputSchema.safeParse({
        ...base,
        addressLine1: "x".repeat(201),
      }).success,
    ).toBe(false);
  });
});

describe("isSupportedTimeZone", () => {
  it("accepts the zones the platform actually serves", () => {
    expect(isSupportedTimeZone("Asia/Seoul")).toBe(true);
    expect(isSupportedTimeZone("UTC")).toBe(true);
  });

  it("rejects a made up zone", () => {
    expect(isSupportedTimeZone("Not/AZone")).toBe(false);
  });
});
