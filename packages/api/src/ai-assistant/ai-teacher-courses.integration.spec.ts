import { randomUUID } from "node:crypto";
import { createProgrammingExerciseSchema, defaultEliceGradingProfile } from "@cove/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { onLibraryWake } from "./library/library-wake.js";
import { createAiFixture, type AiFixture } from "./testing/ai-fixture.js";

/**
 * The course side of the AI teacher for one campus
 * (docs/superpowers/specs/2026-11-26-cove-ai-teacher-campus-courses-design.md,
 * §4 and §5), against PostgreSQL with every migration:
 *
 *   COVE_INTEGRATION_DATABASE_URL=postgresql://… npx vitest run src/ai-assistant
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("AI teacher courses", () => {
  let f: AiFixture;
  let courses: CourseService;
  const manager = () => f.identity(f.auth.manager);
  const service = (prisma: PrismaService) =>
    new CourseService(prisma, new AcademyAccessService(prisma, new SupportGrantResolver(prisma)), new AuditService(), { revokeCourse: vi.fn(), revokeClass: vi.fn() } as never);

  beforeAll(async () => {
    f = await createAiFixture(databaseUrl!);
    courses = service(f.prisma);
  }, 180_000);
  afterAll(async () => { await f?.close(); });

  const newCourse = (over: Record<string, unknown> = {}) =>
    courses.create(manager(), { academyId: f.ids.academy, title: `C ${randomUUID().slice(0, 8)}`, description: "", ...over } as never);
  const lectureIn = async (courseId: string) => {
    const module = await f.prisma.courseModule.create({ data: { courseId, title: "M", position: 1, isVisible: true, externalKey: randomUUID() } as never });
    return (await f.prisma.lecture.create({ data: { courseModuleId: module.id, title: "L", position: 1, isVisible: true, externalKey: randomUUID() } })).id;
  };
  const problem = (courseId: string, lectureId: string, over: Record<string, unknown> = {}) => createProgrammingExerciseSchema.parse({
    academyId: f.ids.academy, courseId, lectureId, title: "Add", difficulty: "EASY", description: "<p>Add two numbers.</p>",
    inputFormat: "", outputFormat: "", constraints: "", starterCode: "", solutions: [{ title: null, code: "print(int(input()) + int(input()))" }],
    aiFeedbackEnabled: true, isVisible: true, grading: defaultEliceGradingProfile, hints: [],
    testCases: [
      { input: "3\n5", expectedOutput: "8", visibility: "SAMPLE", comparator: "STDOUT", weight: 50, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null },
      { input: "10\n20", expectedOutput: "30", visibility: "HIDDEN", comparator: "STDOUT", weight: 50, timeLimitMsOverride: null, softTimeLimitMs: null, softPenalty: null, label: null },
    ],
    ...over,
  });
  const library = (materialId: string) => f.prisma.aiLibrary.findUnique({ where: { materialId } });

  it("saves the AI teacher only on a Python course in an academy that has it", async () => {
    expect((await newCourse({ aiTeacherEnabled: true })).aiTeacherEnabled).toBe(true);
    expect((await newCourse()).aiTeacherEnabled).toBe(false);
    expect((await newCourse({ aiTeacherEnabled: true, language: "C_CPP" })).aiTeacherEnabled).toBe(false);
    expect((await newCourse({ aiTeacherEnabled: true, language: "WEB" })).aiTeacherEnabled).toBe(false);
    await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: false } });
    try {
      expect((await newCourse({ aiTeacherEnabled: true })).aiTeacherEnabled).toBe(false);
    } finally {
      await f.prisma.academyFeatureFlag.updateMany({ where: { academyId: f.ids.academy }, data: { isEnabled: true } });
    }
    // A language change away from Python, allowed while there are no problems, turns it off.
    const course = await newCourse({ aiTeacherEnabled: true });
    const moved = await courses.update(manager(), { academyId: f.ids.academy, courseId: course.id, language: "C_CPP" });
    expect(moved.aiTeacherEnabled).toBe(false);
  });

  it("learns a problem right after Create and after a Save that changes it, and wakes the job", async () => {
    const course = await newCourse({ aiTeacherEnabled: true });
    const lectureId = await lectureIn(course.id);
    const wakes = vi.fn();
    const stop = onLibraryWake(wakes);
    try {
      const created = await courses.createExercise(manager(), problem(course.id, lectureId));
      const materialId = created.material!.id;
      expect(await library(materialId)).toMatchObject({ state: "WAITING", attempts: 0 });
      expect(wakes).toHaveBeenCalledTimes(1);

      // Learned: a Save of the title alone keeps it; a Save of the statement learns again.
      await f.prisma.aiLibrary.update({ where: { materialId }, data: { state: "READY", nextAttemptAt: new Date(Date.now() + 3_600_000) } });
      const current = await f.prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } });
      const renamed = await courses.updateExercise(manager(), {
        ...problem(course.id, lectureId, { title: "Add them" }), materialId, expectedUpdatedAt: current.updatedAt.toISOString(),
      } as never);
      expect((await library(materialId))!.state).toBe("READY");
      const again = await f.prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } });
      await courses.updateExercise(manager(), {
        ...problem(course.id, lectureId, { description: "<p>Add two whole numbers.</p>" }), materialId, expectedUpdatedAt: again.updatedAt.toISOString(),
      } as never);
      const relearn = (await library(materialId))!;
      expect(relearn.state).toBe("WAITING");
      expect(relearn.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(renamed.material!.id).toBe(materialId);
    } finally {
      stop();
    }
  });

  it("queues nothing for a problem with AI off, or in a course without the AI teacher, until it is turned on", async () => {
    const plain = await newCourse();
    const lectureId = await lectureIn(plain.id);
    const inPlain = (await courses.createExercise(manager(), problem(plain.id, lectureId))).material!.id;
    const ai = await newCourse({ aiTeacherEnabled: true });
    const aiLecture = await lectureIn(ai.id);
    const switchedOff = (await courses.createExercise(manager(), problem(ai.id, aiLecture, { aiFeedbackEnabled: false }))).material!.id;
    expect(await library(inPlain)).toBeNull();
    expect(await library(switchedOff)).toBeNull();
    // Turning the course on learns its switched-on problems now.
    expect((await courses.update(manager(), { academyId: f.ids.academy, courseId: plain.id, aiTeacherEnabled: true })).aiTeacherEnabled).toBe(true);
    expect((await library(inPlain))!.state).toBe("WAITING");
    expect(await library(switchedOff)).toBeNull();
  });

  it("adds one statement to a Save: the queue, inside its transaction", async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
    const statements: string[] = [];
    client.$on("query", (event) => statements.push(event.query));
    try {
      const counted = service(client as unknown as PrismaService);
      const course = await newCourse({ aiTeacherEnabled: true });
      const lectureId = await lectureIn(course.id);
      const materialId = (await counted.createExercise(manager(), problem(course.id, lectureId))).material!.id;
      const current = await f.prisma.programmingExercise.findUniqueOrThrow({ where: { materialId } });
      statements.length = 0;
      await counted.updateExercise(manager(), {
        ...problem(course.id, lectureId, { description: "<p>Changed.</p>" }), materialId, expectedUpdatedAt: current.updatedAt.toISOString(),
      } as never);
      expect(statements.filter((query) => query.includes("INSERT INTO ai_libraries"))).toHaveLength(1);
    } finally {
      await client.$disconnect();
    }
  }, 60_000);
});
