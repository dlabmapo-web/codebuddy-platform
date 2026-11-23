import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { CourseService } from "./course.service.js";

/**
 * QA-004 (2026-11-20): Managers and Team Leads delete a problem, lecture,
 * module or course whether or not students have submitted; the students' work
 * goes with it, in the same transaction. Teachers still cannot delete.
 *
 * Opt-in, against a disposable PostgreSQL with every migration applied:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… \
 *   npx vitest run src/content/delete-with-student-work.integration.spec.ts
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

const createClient = (connectionString: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ emit: "event", level: "query" }] });

describe.skipIf(!databaseUrl)("deleting content that students have submitted to", () => {
  let client: ReturnType<typeof createClient>;
  let courses: CourseService;
  let statements = 0;

  const organizationId = randomUUID();
  const academyId = randomUUID();
  const users = {
    manager: randomUUID(),
    teamLead: randomUUID(),
    teacher: randomUUID(),
    studentA: randomUUID(),
    studentB: randomUUID(),
  };
  const auth = Object.fromEntries(
    Object.keys(users).map((key) => [key, randomUUID()]),
  ) as Record<keyof typeof users, string>;
  const identity = (who: keyof typeof users) =>
    ({ authUserId: auth[who], email: `${auth[who]}@it.test` }) as SupabaseIdentity;
  let classId = "";

  /** One course: Ch1 › L1 › [problem P (2 students), written answer W (1 student)], L2 › [problem Q (none)]. */
  const seed = async (submissionsOnP = 2) => {
    const course = await client.course.create({
      data: { academyId, title: `Delete ${randomUUID()}`, isVisible: true, createdByUserId: users.manager },
    });
    const chapter = await client.courseModule.create({
      data: { courseId: course.id, externalKey: `ch-${randomUUID()}`, title: "Ch1", position: 1, isVisible: true },
    });
    const lecture = async (title: string, position: number) =>
      client.lecture.create({
        data: { courseModuleId: chapter.id, externalKey: `lec-${randomUUID()}`, title, position, isVisible: true },
      });
    const l1 = await lecture("L1", 1);
    const l2 = await lecture("L2", 2);
    const problem = async (lectureId: string, title: string, position: number) =>
      client.material.create({
        data: {
          lectureId, type: "PROGRAMMING_EXERCISE", title, position, isVisible: true,
          programmingExercise: { create: { externalKey: `key-${randomUUID()}`, difficulty: "EASY" } },
        },
      });
    const p = await problem(l1.id, "P", 1);
    const w = await client.material.create({
      data: { lectureId: l1.id, type: "WRITTEN_RESPONSE", title: "W", position: 2, isVisible: true },
    });
    const q = await problem(l2.id, "Q", 1);

    const students = [users.studentA, users.studentB];
    for (let index = 0; index < submissionsOnP; index++) {
      const submission = await client.submission.create({
        data: {
          userId: students[index % 2]!, materialId: p.id, sourceMaterialId: p.id, courseId: course.id, classId,
          gradingRevision: 1, language: "PYTHON", timeLimitMs: 1000, memoryLimitMb: 256,
          code: "print(1)", status: "PASSED", totalCount: 1, passedCount: 1, score: 100,
          engineVersion: "fixture", problemTitle: "P", courseTitle: course.title, moduleTitle: "Ch1",
          lectureTitle: "L1", modulePosition: 1, lecturePosition: 1, problemPosition: 1,
        },
      });
      await client.programmingSubmissionReview.create({
        data: {
          submissionId: submission.id, reviewerId: users.manager, reviewerName: "Manager", version: 1,
          requestId: randomUUID(), scoreHundredths: 10000, completed: true, feedback: "Good", reason: "",
        },
      });
    }
    const manual = await client.manualSubmission.create({
      data: {
        materialId: w.id, userId: users.studentA, classId, files: [], profile: {}, revision: 1,
        maximumHundredths: 10000, includeInScore: true, requestKey: randomUUID(),
      },
    });
    await client.manualReview.create({
      data: { submissionId: manual.id, reviewerId: users.manager, scoreHundredths: 5000, completed: true, feedback: "", version: 1 },
    });
    return { courseId: course.id, moduleId: chapter.id, l1: l1.id, l2: l2.id, p: p.id, w: w.id, q: q.id };
  };

  const remaining = async (courseId: string) => ({
    submissions: await client.submission.count({ where: { courseId } }),
    manual: await client.manualSubmission.count({ where: { material: { lecture: { courseModule: { courseId } } } } }),
  });

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => { statements += 1; });
    const prisma = client as unknown as PrismaService;
    courses = new CourseService(
      prisma,
      new AcademyAccessService(prisma, new SupportGrantResolver(prisma)),
      new AuditService(),
      { revokeClass: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await client.organization.create({ data: { id: organizationId, name: "IT", slug: `it-${organizationId.slice(0, 8)}` } });
    await client.academy.create({ data: { id: academyId, organizationId, name: "IT", slug: `it-${academyId.slice(0, 8)}`, status: "ACTIVE" } });
    for (const [key, id] of Object.entries(users) as Array<[keyof typeof users, string]>) {
      await client.user.create({
        data: { id, authUserId: auth[key], status: "ACTIVE", email: `${auth[key]}@it.test`, username: `${key.slice(0, 4)}${id.slice(0, 6)}` },
      });
    }
    const roles = { manager: "MANAGER", teamLead: "TEAM_LEAD", teacher: "TEACHER", studentA: "STUDENT", studentB: "STUDENT" } as const;
    for (const [key, role] of Object.entries(roles) as Array<[keyof typeof users, (typeof roles)[keyof typeof roles]]>) {
      await client.academyMembership.create({ data: { academyId, userId: users[key], role, status: "ACTIVE" } });
    }
    classId = (await client.class.create({ data: { academyId, name: "IT class", createdByUserId: users.manager } })).id;
  }, 60_000);

  beforeEach(() => { statements = 0; });

  afterAll(async () => {
    await client?.$disconnect();
  });

  it("counts the students' work a delete would remove, inside the course only", async () => {
    const ids = await seed();
    const impact = (target: Parameters<CourseService["deleteImpact"]>[1]["target"], courseId = ids.courseId) =>
      courses.deleteImpact(identity("manager"), { academyId, courseId, target });

    await expect(impact({ kind: "material", id: ids.p })).resolves.toEqual({ submissions: 2, manualSubmissions: 0, students: 2 });
    await expect(impact({ kind: "material", id: ids.w })).resolves.toEqual({ submissions: 0, manualSubmissions: 1, students: 1 });
    await expect(impact({ kind: "lecture", id: ids.l1 })).resolves.toEqual({ submissions: 2, manualSubmissions: 1, students: 2 });
    await expect(impact({ kind: "lecture", id: ids.l2 })).resolves.toEqual({ submissions: 0, manualSubmissions: 0, students: 0 });
    await expect(impact({ kind: "module", id: ids.moduleId })).resolves.toEqual({ submissions: 2, manualSubmissions: 1, students: 2 });
    await expect(impact({ kind: "course" })).resolves.toEqual({ submissions: 2, manualSubmissions: 1, students: 2 });

    // A material of another course, asked through this one, counts nothing.
    const other = await seed();
    await expect(impact({ kind: "material", id: other.p })).resolves.toEqual({ submissions: 0, manualSubmissions: 0, students: 0 });
  });

  it("lets a Manager delete a problem students submitted to, with their work", async () => {
    const ids = await seed();
    await courses.deleteExercise(identity("manager"), { academyId, courseId: ids.courseId, lectureId: ids.l1, materialId: ids.p });

    expect(await client.material.findUnique({ where: { id: ids.p } })).toBeNull();
    expect(await remaining(ids.courseId)).toEqual({ submissions: 0, manual: 1 });
    expect(await client.programmingSubmissionReview.count({ where: { submission: { courseId: ids.courseId } } })).toBe(0);
    const audit = await client.auditLog.findFirst({ where: { targetId: ids.p, action: "content.programming_exercise.deleted" } });
    expect(audit?.after).toMatchObject({ deletedStudentWork: { submissions: 2, manualSubmissions: 0 } });
  });

  it("lets a Team Lead delete a lecture and a module with students' work", async () => {
    const first = await seed();
    await courses.deleteLecture(identity("teamLead"), { academyId, courseId: first.courseId, lectureId: first.l1 });
    expect(await client.lecture.findUnique({ where: { id: first.l1 } })).toBeNull();
    expect(await remaining(first.courseId)).toEqual({ submissions: 0, manual: 0 });

    const second = await seed();
    await courses.deleteModule(identity("teamLead"), { academyId, courseId: second.courseId, moduleId: second.moduleId });
    expect(await client.courseModule.findUnique({ where: { id: second.moduleId } })).toBeNull();
    expect(await remaining(second.courseId)).toEqual({ submissions: 0, manual: 0 });
  });

  it("lets a Manager delete a whole course with students' work", async () => {
    const ids = await seed();
    const title = (await client.course.findUniqueOrThrow({ where: { id: ids.courseId } })).title;
    await courses.deleteCourse(identity("manager"), { academyId, courseId: ids.courseId, confirmTitle: title });
    expect(await client.course.findUnique({ where: { id: ids.courseId } })).toBeNull();
    expect(await client.submission.count({ where: { courseId: ids.courseId } })).toBe(0);
    expect(await client.manualSubmission.count({ where: { materialId: ids.w } })).toBe(0);
  });

  it("still refuses a Teacher", async () => {
    const ids = await seed();
    await expect(
      courses.deleteExercise(identity("teacher"), { academyId, courseId: ids.courseId, lectureId: ids.l1, materialId: ids.p }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      courses.deleteImpact(identity("teacher"), { academyId, courseId: ids.courseId, target: { kind: "course" } }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await remaining(ids.courseId)).toEqual({ submissions: 2, manual: 1 });
  });

  it("uses the same number of statements however many submissions there are", async () => {
    const small = await seed(1);
    const large = await seed(12);
    statements = 0;
    await courses.deleteExercise(identity("manager"), { academyId, courseId: small.courseId, lectureId: small.l1, materialId: small.p });
    const forOne = statements;
    statements = 0;
    await courses.deleteExercise(identity("manager"), { academyId, courseId: large.courseId, lectureId: large.l1, materialId: large.p });
    expect(statements).toBe(forOne);
    console.info(`deleteExercise with submissions: ${forOne} statements`);
    statements = 0;
    await courses.deleteImpact(identity("manager"), { academyId, courseId: large.courseId, target: { kind: "course" } });
    console.info(`deleteImpact: ${statements} statements`);
  });
});
