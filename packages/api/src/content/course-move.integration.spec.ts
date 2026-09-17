import { randomUUID } from "node:crypto";

import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { PrismaService } from "../database/prisma.service.js";
import type { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { CourseService } from "./course.service.js";

/**
 * Moving lectures and problems between parents, against a real PostgreSQL.
 *
 * The part of a move that can go wrong is invisible to a mocked client: two
 * unique `(parent, position)` constraints and positive CHECK constraints that
 * every intermediate state has to satisfy. Opt-in, because it needs a
 * disposable database with every migration applied:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… \
 *   npx vitest run src/content/course-move.integration.spec.ts
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("moving curriculum between parents", () => {
  let prisma: PrismaService;
  let courses: CourseService;
  let revokeClass: ReturnType<typeof vi.fn>;

  const ids = {
    organization: randomUUID(),
    academy: randomUUID(),
    manager: randomUUID(),
    student: randomUUID(),
    otherAcademy: randomUUID(),
  };
  const authUserId = randomUUID();
  const manager = { authUserId, email: `${authUserId}@it.test` } as SupabaseIdentity;
  const academyId = ids.academy;

  let courseId = "";
  /** chapter title → id, lecture title → id, problem title → id */
  const chapter: Record<string, string> = {};
  const lecture: Record<string, string> = {};
  const problem: Record<string, string> = {};

  const tree = () => courses.getTree(manager, { academyId, courseId });
  /** `{ "Ch1": { "L1": ["P1", "P2"] } }`, in position order. */
  const outline = async () => {
    const current = await tree();
    return Object.fromEntries(
      current.modules.map((module) => [
        module.title,
        Object.fromEntries(
          module.lectures.map((item) => [
            item.title,
            item.materials.map((material) => material.title),
          ]),
        ),
      ]),
    );
  };
  const positionsAreDense = async () => {
    const lectures = await prisma.lecture.findMany({
      where: { courseModule: { courseId } },
      select: { courseModuleId: true, position: true },
    });
    const materials = await prisma.material.findMany({
      where: { lecture: { courseModule: { courseId } } },
      select: { lectureId: true, position: true },
    });
    const dense = (rows: { parent: string; position: number }[]) => {
      const byParent = new Map<string, number[]>();
      for (const row of rows) {
        byParent.set(row.parent, [...(byParent.get(row.parent) ?? []), row.position]);
      }
      return [...byParent.values()].every((positions) =>
        positions.sort((a, b) => a - b).every((position, index) => position === index + 1),
      );
    };
    return (
      dense(lectures.map((row) => ({ parent: row.courseModuleId, position: row.position }))) &&
      dense(materials.map((row) => ({ parent: row.lectureId, position: row.position })))
    );
  };

  async function addProblem(lectureId: string, title: string, position: number) {
    const material = await prisma.material.create({
      data: {
        lectureId,
        type: "PROGRAMMING_EXERCISE",
        title,
        position,
        isVisible: true,
        programmingExercise: {
          create: { externalKey: `key-${randomUUID()}`, difficulty: "EASY" },
        },
      },
    });
    problem[title] = material.id;
  }

  /**
   * Ch1: L1 [P1, P2, P3], L2 [P4]
   * Ch2: L3 [P5], L4 []
   * Ch3 (hidden): L5 [P6]
   */
  async function seedCourse() {
    for (const key of Object.keys(chapter)) delete chapter[key];
    for (const key of Object.keys(lecture)) delete lecture[key];
    for (const key of Object.keys(problem)) delete problem[key];
    const course = await prisma.course.create({
      data: { academyId, title: `Move ${randomUUID()}`, isVisible: true, createdByUserId: ids.manager },
    });
    courseId = course.id;
    const layout: Array<[string, boolean, Array<[string, string[]]>]> = [
      ["Ch1", true, [["L1", ["P1", "P2", "P3"]], ["L2", ["P4"]]]],
      ["Ch2", true, [["L3", ["P5"]], ["L4", []]]],
      ["Ch3", false, [["L5", ["P6"]]]],
    ];
    for (const [chapterIndex, [chapterTitle, visible, lectures]] of layout.entries()) {
      const createdChapter = await prisma.courseModule.create({
        data: {
          courseId,
          externalKey: `ch-${randomUUID()}`,
          title: chapterTitle,
          position: chapterIndex + 1,
          isVisible: visible,
        },
      });
      chapter[chapterTitle] = createdChapter.id;
      for (const [lectureIndex, [lectureTitle, problems]] of lectures.entries()) {
        const createdLecture = await prisma.lecture.create({
          data: {
            courseModuleId: createdChapter.id,
            externalKey: `lec-${randomUUID()}`,
            title: lectureTitle,
            position: lectureIndex + 1,
            isVisible: true,
          },
        });
        lecture[lectureTitle] = createdLecture.id;
        for (const [problemIndex, problemTitle] of problems.entries()) {
          await addProblem(createdLecture.id, problemTitle, problemIndex + 1);
        }
      }
    }
  }

  beforeAll(async () => {
    const config = new ConfigService({ DATABASE_URL: databaseUrl });
    prisma = new PrismaService(config as never);
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    revokeClass = vi.fn().mockResolvedValue(undefined);
    courses = new CourseService(prisma, access, new AuditService(), {
      revokeClass,
    } as unknown as MonitoringRevocationService);

    await prisma.organization.create({
      data: { id: ids.organization, name: "IT Org", slug: `it-${ids.organization.slice(0, 8)}` },
    });
    for (const id of [ids.academy, ids.otherAcademy]) {
      await prisma.academy.create({
        data: { id, organizationId: ids.organization, name: "IT", slug: `it-${id.slice(0, 8)}`, status: "ACTIVE" },
      });
    }
    await prisma.user.create({
      data: {
        id: ids.manager,
        authUserId,
        status: "ACTIVE",
        email: `${authUserId}@it.test`,
        username: `m${ids.manager.slice(0, 6)}`,
      },
    });
    const studentAuth = randomUUID();
    await prisma.user.create({
      data: {
        id: ids.student,
        authUserId: studentAuth,
        status: "ACTIVE",
        email: `${studentAuth}@it.test`,
        username: `s${ids.student.slice(0, 6)}`,
      },
    });
    await prisma.academyMembership.create({
      data: { academyId, userId: ids.manager, role: "MANAGER", status: "ACTIVE" },
    });
  }, 60_000);

  beforeEach(async () => {
    await seedCourse();
    revokeClass.mockClear();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const moveProblem = (title: string, from: string, to: string, toIndex: number) =>
    courses.moveExercise(manager, {
      academyId,
      courseId,
      materialId: problem[title]!,
      fromLectureId: lecture[from]!,
      toLectureId: lecture[to]!,
      toIndex,
    });
  const moveLecture = (title: string, from: string, to: string, toIndex: number) =>
    courses.moveLecture(manager, {
      academyId,
      courseId,
      lectureId: lecture[title]!,
      fromModuleId: chapter[from]!,
      toModuleId: chapter[to]!,
      toIndex,
    });

  it("moves a problem into another chapter's lecture at first, middle, and last", async () => {
    await moveProblem("P2", "L1", "L3", 0);
    await moveProblem("P1", "L1", "L3", 1);
    await moveProblem("P4", "L2", "L3", 99);

    expect(await outline()).toMatchObject({
      Ch1: { L1: ["P3"], L2: [] },
      Ch2: { L3: ["P2", "P1", "P5", "P4"], L4: [] },
    });
    expect(await positionsAreDense()).toBe(true);
  });

  it("moves a problem into an empty lecture", async () => {
    await moveProblem("P3", "L1", "L4", 0);

    expect(await outline()).toMatchObject({ Ch1: { L1: ["P1", "P2"] }, Ch2: { L4: ["P3"] } });
    expect(await positionsAreDense()).toBe(true);
  });

  it("reorders within one lecture when the destination is the current lecture", async () => {
    await moveProblem("P1", "L1", "L1", 2);

    expect((await outline()).Ch1).toMatchObject({ L1: ["P2", "P3", "P1"] });
    expect(await positionsAreDense()).toBe(true);
  });

  it("moves a lecture with its problems to another chapter", async () => {
    await moveLecture("L1", "Ch1", "Ch2", 1);

    expect(await outline()).toMatchObject({
      Ch1: { L2: ["P4"] },
      Ch2: { L3: ["P5"], L1: ["P1", "P2", "P3"], L4: [] },
    });
    expect(Object.keys((await outline()).Ch2!)).toEqual(["L3", "L1", "L4"]);
    expect(await positionsAreDense()).toBe(true);
  });

  it("keeps a student's work attached to the moved problem", async () => {
    const draft = await prisma.exerciseDraft.create({
      data: {
        userId: ids.student,
        materialId: problem.P1,
        sourceMaterialId: problem.P1!,
        courseId,
        code: "print('kept')",
      },
    });

    await moveProblem("P1", "L1", "L3", 0);

    const after = await prisma.exerciseDraft.findUniqueOrThrow({ where: { id: draft.id } });
    expect(after.materialId).toBe(problem.P1);
    expect(after.code).toBe("print('kept')");
  });

  it("bumps the content revision and audits a move once", async () => {
    const before = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

    await moveProblem("P1", "L1", "L3", 0);

    const after = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    expect(after.contentRevision).toBe(before.contentRevision + 1);
    const audits = await prisma.auditLog.findMany({
      where: { targetId: problem.P1, action: "content.programming_exercise.moved" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.before).toEqual({ lectureId: lecture.L1, index: 0 });
    expect(audits[0]!.after).toEqual({ lectureId: lecture.L3, index: 0 });
  });

  it("does nothing for a move to where the item already is", async () => {
    const before = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

    await moveProblem("P2", "L1", "L1", 1);

    const after = await prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    expect(after.contentRevision).toBe(before.contentRevision);
    expect(
      await prisma.auditLog.count({ where: { targetId: problem.P2, action: "content.programming_exercise.moved" } }),
    ).toBe(0);
  });

  it("refuses a move built from a stale tree, and changes nothing", async () => {
    const before = await outline();

    await expect(moveProblem("P1", "L2", "L3", 0)).rejects.toMatchObject({
      code: "CONTENT_MOVE_STALE",
    });
    expect(await outline()).toEqual(before);
  });

  it("refuses a destination outside the course", async () => {
    const other = await prisma.course.create({
      data: { academyId, title: `Other ${randomUUID()}`, createdByUserId: ids.manager },
    });
    const otherChapter = await prisma.courseModule.create({
      data: { courseId: other.id, externalKey: `x-${randomUUID()}`, title: "X", position: 1 },
    });
    const otherLecture = await prisma.lecture.create({
      data: { courseModuleId: otherChapter.id, externalKey: `x-${randomUUID()}`, title: "X", position: 1 },
    });

    await expect(
      courses.moveExercise(manager, {
        academyId,
        courseId,
        materialId: problem.P1!,
        fromLectureId: lecture.L1!,
        toLectureId: otherLecture.id,
        toIndex: 0,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_PARENT_MISMATCH" });
    await expect(
      courses.moveLecture(manager, {
        academyId,
        courseId,
        lectureId: lecture.L1!,
        fromModuleId: chapter.Ch1!,
        toModuleId: otherChapter.id,
        toIndex: 0,
      }),
    ).rejects.toMatchObject({ code: "CONTENT_PARENT_MISMATCH" });
  });

  it("refuses a course from another academy", async () => {
    await expect(
      courses.moveExercise(manager, {
        academyId: ids.otherAcademy,
        courseId,
        materialId: problem.P1!,
        fromLectureId: lecture.L1!,
        toLectureId: lecture.L3!,
        toIndex: 0,
      }),
    ).rejects.toBeDefined();
    expect((await outline()).Ch1).toMatchObject({ L1: ["P1", "P2", "P3"] });
  });

  it("reports a deleted problem as stale", async () => {
    const materialId = problem.P1!;
    await prisma.material.delete({ where: { id: materialId } });

    await expect(moveProblem("P1", "L1", "L3", 0)).rejects.toMatchObject({
      code: "CONTENT_MOVE_STALE",
    });
  });

  it("revokes monitoring only when a move hides the problem from students", async () => {
    const klass = await prisma.class.create({
      data: { academyId, name: `Class ${randomUUID()}`, createdByUserId: ids.manager },
    });
    await prisma.classCourse.create({
      data: { classId: klass.id, courseId, assignedByUserId: ids.manager },
    });

    await moveProblem("P1", "L1", "L3", 0);
    expect(revokeClass).not.toHaveBeenCalled();

    await moveProblem("P2", "L1", "L5", 0);
    expect(revokeClass).toHaveBeenCalledWith(klass.id, "MATERIAL_UNAVAILABLE");
  });

  it("keeps positions consistent when two moves in one course race", async () => {
    const results = await Promise.allSettled([
      moveProblem("P1", "L1", "L3", 0),
      moveProblem("P3", "L1", "L4", 0),
      moveLecture("L2", "Ch1", "Ch2", 0),
    ]);

    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    expect(await outline()).toMatchObject({
      Ch1: { L1: ["P2"] },
      Ch2: { L2: ["P4"], L3: ["P1", "P5"], L4: ["P3"] },
    });
    expect(await positionsAreDense()).toBe(true);
  });
});
