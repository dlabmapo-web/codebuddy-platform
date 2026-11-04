import type { SupabaseIdentity } from "../auth/auth.types.js";
import { describe, expect, it, vi } from "vitest";
import {
  historyTotals,
  historyPage,
  StudentWorkHistoryService,
} from "./student-work-history.service.js";
import type { HistoryMaterial } from "@cove/shared";
import type { PrismaService } from "../database/prisma.service.js";
import type { TeacherProgressAccessService } from "./teacher-progress-access.service.js";
import type { TeacherProgressRepository } from "./teacher-progress.repository.js";
import type { TeacherProgressService } from "./teacher-progress.service.js";
const identity = { authUserId: "auth" } as SupabaseIdentity;
const target = {
  academyId: "academy",
  classId: "class",
  membershipId: "member",
  materialId: "material",
};
const member = {
  membershipId: "member",
  userId: "student",
  displayName: "Student",
};
function setup() {
  const material = {
    id: "material",
    title: "Turtle",
    type: "TURTLE_EXERCISE",
    isRequired: true,
    position: 1,
    programmingExercise: null,
    manualMaterial: { revision: 2, includeInScore: true, submitEnabled: true },
    lecture: {
      id: "lecture",
      title: "Lecture",
      position: 1,
      courseModule: {
        id: "module",
        title: "Module",
        position: 1,
        course: { id: "course", title: "Course" },
      },
    },
  };
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "latest" }]),
    material: { findMany: vi.fn().mockResolvedValue([material]) },
    manualMaterial: {
      findUnique: vi.fn().mockResolvedValue({
        runtimeVersion: "current-turtle",
        entryPoint: "main.py",
        assets: [],
      }),
    },
    manualSubmission: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(45),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    videoWatchProgress: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const access = {
    requireClassScope: vi.fn().mockResolvedValue({
      students: [member],
      studentUserIds: ["student"],
      courses: [],
      actor: { userId: "teacher" },
    }),
    requireStudent: vi.fn().mockReturnValue(member),
  };
  const repository = {
    countedAttemptsByExercise: vi.fn().mockResolvedValue([]),
    progressFor: vi.fn().mockResolvedValue([]),
  };
  const reviews = { getSubmissionReview: vi.fn() };
  const service = new StudentWorkHistoryService(
    db as unknown as PrismaService,
    access as unknown as TeacherProgressAccessService,
    repository as unknown as TeacherProgressRepository,
    reviews as unknown as TeacherProgressService,
  );
  return { service, db, access, repository, reviews, material };
}
describe("student saved-work boundary", () => {
  it("includes all visible activity types while retaining academy and class assignment gates", async () => {
    const { service, db } = setup();
    await service.listStudentMaterials(identity, { ...target, page: 1 });
    const where = db.material.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toMatchObject({
      isVisible: true,
      OR: [
        { programmingExercise: { isNot: null } },
        { manualMaterial: { isNot: null } },
        { pdfDocument: { isNot: null } },
        { videoLesson: { isNot: null } },
      ],
      lecture: {
        isVisible: true,
        courseModule: {
          isVisible: true,
          course: { academyId: "academy", isVisible: true },
        },
      },
    });
    expect(where.AND[1]).toEqual({
      lecture: {
        courseModule: {
          course: { classAssignments: { some: { classId: "class" } } },
        },
      },
    });
    expect(where.AND[0]).not.toHaveProperty("programmingExercise");
    expect(db.manualSubmission.findMany.mock.calls[0][0].where.id.in).toEqual([
      "latest",
    ]);
  });
  it("checks current class access before selecting source", async () => {
    const { service, db, access } = setup();
    access.requireClassScope.mockRejectedValue(new Error("revoked"));
    await expect(
      service.getSubmission(identity, {
        ...target,
        kind: "manual",
        submissionId: "attempt",
      }),
    ).rejects.toThrow("revoked");
    expect(db.manualSubmission.findFirst).not.toHaveBeenCalled();
  });
  it("pins manual source reads to class, student and material", async () => {
    const { service, db } = setup();
    db.manualSubmission.findFirst.mockResolvedValue(null);
    await expect(
      service.getSubmission(identity, {
        ...target,
        kind: "manual",
        submissionId: "foreign",
      }),
    ).rejects.toThrow();
    expect(db.manualSubmission.findFirst.mock.calls[0][0].where).toEqual({
      id: "foreign",
      classId: "class",
      userId: "student",
      materialId: "material",
    });
  });
  it("refuses a programming submission belonging to a different selected material", async () => {
    const { service, reviews } = setup();
    reviews.getSubmissionReview.mockResolvedValue({ materialId: "other" });
    await expect(
      service.getSubmission(identity, {
        ...target,
        kind: "programming",
        submissionId: "attempt",
      }),
    ).rejects.toThrow();
  });
  it("paginates beyond the old 30 manual attempts without selecting source", async () => {
    const { service, db } = setup();
    const result = await service.listAttempts(identity, { ...target, page: 3 });
    expect(result.pagination).toEqual({
      page: 3,
      pageCount: 3,
      totalCount: 45,
      pageSize: 20,
    });
    const query = db.manualSubmission.findMany.mock.calls[0][0];
    expect(query.skip).toBe(40);
    expect(query.take).toBe(20);
    expect(result.material).toMatchObject({
      materialId: "material",
      title: "Turtle",
      type: "TURTLE_EXERCISE",
    });
    expect(query.select).not.toHaveProperty("files");
    expect(query.select).not.toHaveProperty("answer");
  });
  it("does not report an old revision as a current score or completion", async () => {
    const { service, db } = setup();
    db.manualSubmission.findMany.mockResolvedValue([
      {
        materialId: "material",
        revision: 1,
        maximumHundredths: 5000,
        createdAt: new Date(),
        reviews: [{ completed: true, scoreHundredths: 5000 }],
        shortAnswerAssessment: null,
        multipleChoiceAssessment: null,
      },
    ]);
    const result = await service.listStudentMaterials(identity, {
      ...target,
      page: 1,
    });
    expect(result.rows[0]).toMatchObject({
      status: "previous_revision",
      score: null,
    });
    expect(JSON.stringify(result)).not.toContain("files");
  });
  it("keeps saved source immutable and strips private assessment definitions", async () => {
    const { service, db } = setup();
    db.manualSubmission.findFirst.mockResolvedValue({
      id: "attempt",
      files: { "main.py": "print(1)" },
      answer: "answer",
      profile: {
        description: "Saved instructions",
        shortAnswer: {
          question: "Q",
          gradingMode: "EXACT",
          expectedAnswer: "SECRET",
        },
      },
      createdAt: new Date(),
      maximumHundredths: 10000,
      reviews: [],
      shortAnswerAssessment: {
        status: "PENDING",
        scoreHundredths: null,
        completed: null,
      },
      multipleChoiceAssessment: null,
    });
    const result = await service.getSubmission(identity, {
      ...target,
      kind: "manual",
      submissionId: "attempt",
    });
    expect(result).toMatchObject({
      kind: "manual",
      files: { "main.py": "print(1)" },
      question: "Q",
      score: null,
    });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("expectedAnswer");
  });
});
describe("history metric definitions", () => {
  const row = (patch: Partial<HistoryMaterial>): HistoryMaterial => ({
    materialId: "m",
    title: "M",
    type: "PROGRAMMING_EXERCISE",
    courseId: "c",
    courseTitle: "C",
    moduleId: "mod",
    moduleTitle: "Module",
    lectureId: "l",
    lectureTitle: "L",
    lectureCompleted: 0,
    lectureEligible: 0,
    required: true,
    includedInScore: true,
    revision: 1,
    status: "completed",
    score: 100,
    maximum: 100,
    submissions: 2,
    latestAt: null,
    watchedMs: null,
    ...patch,
  });
  it("uses actual score maxima and excludes optional reading from assessed completion", () => {
    const result = historyTotals([
      row({}),
      row({ type: "TURTLE_EXERCISE", score: 25, maximum: 50, submissions: 1 }),
      row({
        type: "PDF_DOCUMENT",
        score: null,
        maximum: null,
        submissions: 0,
        status: "unrecorded",
      }),
      row({ required: false, includedInScore: false, score: 0 }),
    ]);
    expect(result).toMatchObject({
      eligible: 2,
      completed: 2,
      averageScore: 75,
      evaluatedItems: 2,
      programmingCompleted: 1,
      manualCompleted: 1,
    });
  });
  it("represents no evaluated work as null, and clamps empty pagination", () => {
    expect(historyTotals([]).averageScore).toBeNull();
    expect(historyPage([], 99).pagination).toMatchObject({
      page: 1,
      pageCount: 0,
      totalCount: 0,
    });
  });
});

describe("private draft Turtle authorization", () => {
  it("uses the authorized material profile without inventing or selecting a submission", async () => {
    const { service, db } = setup();
    const grant = await service.authorizeReviewRun(identity, {
      ...target,
      kind: "manual",
      reviewId: "private",
      files: {},
    });
    expect(grant.savedProfile).toEqual({ runtimeVersion: "current-turtle" });
    expect(db.manualMaterial.findUnique).toHaveBeenCalledWith({
      where: { materialId: "material" },
    });
    expect(db.manualSubmission.findFirst).not.toHaveBeenCalled();
  });
  it("refuses draft execution after class access is revoked", async () => {
    const { service, db, access } = setup();
    access.requireClassScope.mockRejectedValue(new Error("revoked"));
    await expect(
      service.authorizeReviewRun(identity, {
        ...target,
        kind: "manual",
        reviewId: "private",
        files: {},
      }),
    ).rejects.toThrow("revoked");
    expect(db.manualMaterial.findUnique).not.toHaveBeenCalled();
  });
});

describe("history profile and course progress", () => {
  it("uses class enrollment rather than first activity and scopes daily learning to the selected course", async () => {
    const { service, db, access } = setup();
    access.requireClassScope.mockResolvedValue({
      students: [member],
      studentUserIds: ["student"],
      courses: [{ id: "course", title: "Course" }],
      className: "Class",
      actor: { userId: "teacher" },
    } as never);
    const enrolledAt = new Date("2025-12-02T00:00:00Z");
    const aggregate = vi.fn().mockResolvedValue({
      _sum: { activeSeconds: 120 },
      _min: { firstActiveAt: new Date("2026-10-01T00:00:00Z") },
      _max: { lastActiveAt: null },
    });
    const groupBy = vi
      .fn()
      .mockImplementation(async ({ where }) => [
        { localDate: where.localDate.lte, _sum: { activeSeconds: 120 } },
      ]);
    const enrollment = vi.fn().mockResolvedValue({ enrolledAt });
    Object.assign(db, {
      studentClassCourseLearningDay: { aggregate, groupBy },
      academyMembership: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ user: { email: "student@example.com" } }),
      },
      classEnrollment: { findUnique: enrollment },
    });
    const result = await service.getStudentSummary(identity, {
      ...target,
      courseId: "course",
    });
    expect(result.enrolledAt).toBe(enrolledAt.toISOString());
    expect(result.firstRecordedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(result.courseProgress).toEqual([
      { id: "course", title: "Course", completed: 0, eligible: 1 },
    ]);
    expect(result.learningDays).toHaveLength(14);
    expect(result.learningDays.at(-1)?.activeSeconds).toBe(120);
    expect(result.learningDays[0].activeSeconds).toBe(0);
    expect(groupBy.mock.calls[0][0].where).toMatchObject({
      academyId: "academy",
      classId: "class",
      membershipId: "member",
      courseId: { in: ["course"] },
    });
    expect(enrollment).toHaveBeenCalledWith({
      where: {
        classId_membershipId: { classId: "class", membershipId: "member" },
      },
      select: { enrolledAt: true },
    });
    expect(result.totalScore).toBe(0);
    expect(result.maximumScore).toBe(0);
  });
});
