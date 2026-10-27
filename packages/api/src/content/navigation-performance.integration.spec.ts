import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { courseOutlineSchema, courseTreeSchema } from "@cove/shared";
import { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { CourseService, toCourseSummary } from "./course.service.js";
import { courseCounts } from "./course-counts.js";
import { ClassesService } from "../classes/classes.service.js";
import { classListQuery } from "../classes/class-list-query.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { readAccount } from "../auth/account-read.js";
import { AuthService } from "../auth/auth.service.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const legacySummaryInclude = {
  modules: { select: { id: true, isVisible: true, lectures: { select: {
    id: true, isVisible: true, materials: { select: { type: true, isVisible: true } },
  } } } },
  libraryImport: true,
  sourceCourse: { select: { id: true, title: true, contentRevision: true, retiredAt: true } },
} as const;
const legacyAccountInclude = {
  avatarAsset: true,
  memberships: { include: {
    academy: { include: { featureFlags: { where: { isEnabled: true } } } },
    memberProfile: { include: { avatarAsset: true } }, extraRoles: true,
  }, orderBy: { createdAt: "asc" as const } },
  joinRequests: { include: { academy: true }, orderBy: { createdAt: "desc" as const } },
} as const;

describe.skipIf(!databaseUrl)("navigation projections against PostgreSQL", () => {
  const createClient = (connectionString: string) => new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ emit: "event", level: "query" }] });
  let client: ReturnType<typeof createClient>;
  let prisma: PrismaService;
  let courses: CourseService;
  let classes: ClassesService;
  let auth: AuthService;
  let sqlCount = 0;
  const organizationId = randomUUID();
  const academyId = randomUUID();
  const otherAcademyId = randomUUID();
  const userId = randomUUID();
  const authUserId = randomUUID();
  const identity = { authUserId } as SupabaseIdentity;
  const courseId = randomUUID();
  const foreignCourseId = randomUUID();
  const emptyCourseId = randomUUID();
  const classId = randomUUID();
  const teacherAuthId = randomUUID();
  const studentAuthId = randomUUID();
  const studentId = randomUUID();
  const homeroomId = randomUUID();
  const assistantId = randomUUID();
  let lectureId: string;
  let materialId: string;
  const evidence: Record<string, unknown> = { kind: "disposable-local-postgresql", materials: 427 };

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => { sqlCount += 1; });
    prisma = client as unknown as PrismaService;
    const access = new AcademyAccessService(prisma, new SupportGrantResolver(prisma));
    const revocation = { revokeClass: vi.fn(), revokeCourse: vi.fn() } as never;
    const media = { signMany: vi.fn().mockResolvedValue([]) } as never;
    courses = new CourseService(prisma, access, new AuditService(), revocation);
    classes = new ClassesService(prisma, access, new AuditService(), revocation, media);
    auth = new AuthService(prisma, {} as never, media, {} as never);
    await client.organization.create({ data: { id: organizationId, name: "Navigation fixture", slug: `nav-${organizationId}` } });
    for (const id of [academyId, otherAcademyId]) await client.academy.create({ data: {
      id, organizationId, name: "Fixture academy", slug: `nav-${id}`, status: "ACTIVE",
    } });
    await client.user.create({ data: { id: userId, authUserId, status: "ACTIVE", email: `${userId}@fixture.invalid`, displayName: "Fixture manager" } });
    await client.academyMembership.create({ data: { academyId, userId, role: "MANAGER", status: "ACTIVE", extraRoles: { create: { role: "TEACHER" } } } });
    await client.academyFeatureFlag.createMany({ data: [
      { academyId, feature: "TEACHER_LIVE_MONITORING", isEnabled: true },
    ] });
    await client.academyJoinRequest.create({ data: {
      academyId: otherAcademyId, userId, status: "REJECTED", reviewReason: "Fixture only",
      reviewedAt: new Date("2026-10-26T12:34:56.123Z"),
    } });
    for (const id of [homeroomId, assistantId]) {
      const teacherUserId = randomUUID();
      await client.user.create({ data: { id: teacherUserId, authUserId: id === assistantId ? teacherAuthId : randomUUID(), status: "ACTIVE", displayName: id === homeroomId ? "Homeroom" : "Assistant" } });
      await client.academyMembership.create({ data: {
        id, academyId, userId: teacherUserId, role: id === homeroomId ? "MANAGER" : "TEACHER",
        status: "ACTIVE", ...(id === homeroomId ? { extraRoles: { create: { role: "TEACHER" } } } : {}),
      } });
    }
    for (const [id, tenant] of [[courseId, academyId], [foreignCourseId, otherAcademyId], [emptyCourseId, academyId]]) {
      await client.course.create({ data: { id, academyId: tenant, createdByUserId: userId, title: `Fixture ${id}`, isVisible: false } });
    }
    await client.course.update({ where: { id: courseId }, data: {
      sourceCourseId: foreignCourseId, sourceContentRevision: 1, baselineRevision: 1,
    } });
    const module = await client.courseModule.create({ data: { courseId, title: "Visible module", externalKey: randomUUID(), position: 1, isVisible: true } });
    const hiddenModule = await client.courseModule.create({ data: { courseId, title: "Hidden module", externalKey: randomUUID(), position: 2 } });
    // Empty modules and empty lectures must survive summary aggregation.
    await client.courseModule.create({ data: { courseId, title: "Empty module", externalKey: randomUUID(), position: 3 } });
    const lecture = await client.lecture.create({ data: { courseModuleId: module.id, title: "Visible lecture", externalKey: randomUUID(), position: 1, isVisible: true } });
    lectureId = lecture.id;
    const hiddenLecture = await client.lecture.create({ data: { courseModuleId: module.id, title: "Hidden lecture", externalKey: randomUUID(), position: 2 } });
    const moduleHiddenLecture = await client.lecture.create({ data: { courseModuleId: hiddenModule.id, title: "Hidden ancestor", externalKey: randomUUID(), position: 1, isVisible: true } });
    await client.lecture.create({ data: { courseModuleId: module.id, title: "Empty lecture", externalKey: randomUUID(), position: 3 } });
    const types = ["PROGRAMMING_EXERCISE", "PDF_DOCUMENT", "TURTLE_EXERCISE", "WRITTEN_RESPONSE", "MULTIPLE_CHOICE", "VIDEO_LESSON"] as const;
    const materials = Array.from({ length: 427 }, (_, index) => ({ id: randomUUID(), lectureId: index < 400 ? lectureId : index < 415 ? hiddenLecture.id : moduleHiddenLecture.id,
      type: types[index % types.length]!, title: `Material ${index}`, position: index + 1, isVisible: index % 7 !== 0,
    }));
    materialId = materials[0]!.id;
    await client.material.createMany({ data: materials });
    await client.programmingExercise.createMany({ data: materials.filter((m) => m.type === "PROGRAMMING_EXERCISE" || m.type === "TURTLE_EXERCISE").map((m) => ({
      materialId: m.id, externalKey: randomUUID(), difficulty: "EASY" as const, description: "Rich lesson body ".repeat(220), starterCode: "print('fixture')",
    })) });
    await client.exerciseTestCase.create({ data: { exerciseMaterialId: materialId, position: 1, input: "sensitive fixture input", expectedOutput: "sensitive fixture answer", visibility: "HIDDEN" } });
    await client.exerciseHint.create({ data: { exerciseMaterialId: materialId, position: 1, content: "Private authoring hint" } });
    await client.class.create({ data: { id: classId, academyId, name: "Navigation class", createdByUserId: userId, teacherMembershipId: homeroomId,
      assistantTeachers: { create: { membershipId: assistantId } }, courseAssignments: { create: { courseId, assignedByUserId: userId } },
    } });
    await client.user.create({ data: { id: studentId, authUserId: studentAuthId, status: "ACTIVE" } });
    const student = await client.academyMembership.create({ data: { academyId, userId: studentId, role: "STUDENT", status: "ACTIVE" } });
    await client.classEnrollment.create({ data: { classId, membershipId: student.id, enrolledByUserId: userId } });
    await client.class.create({ data: { academyId: otherAcademyId, name: "Foreign fixture", createdByUserId: userId } });
    await client.class.create({ data: { academyId, name: "Archived fixture", status: "ARCHIVED", createdByUserId: userId } });
  }, 60_000);

  afterAll(async () => {
    if (process.env.COVE_NAVIGATION_EVIDENCE_PATH) await writeFile(process.env.COVE_NAVIGATION_EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + "\n");
    await client?.$disconnect();
  });

  it("matches tree counts for hidden ancestors, empty parents and every material kind", async () => {
    const records = await client.course.findMany({ where: { academyId }, include: legacySummaryInclude });
    const counts = await courseCounts(prisma, academyId, records.map((r) => r.id));
    for (const record of records) expect(counts.get(record.id)).toEqual(toCourseSummary(record).content);
    expect(counts.get(emptyCourseId)).toEqual({ modules: 0, lectures: 0, exercises: 0, visibleExercises: 0, documents: 0, visibleDocuments: 0 });
    expect(counts.get(courseId)?.modules).toBe(3);
    expect(counts.get(courseId)?.lectures).toBe(4);
    expect(counts.get(courseId)?.visibleExercises).toBeGreaterThan(0); // course itself is hidden
    expect((await courses.list(identity, academyId)).courses).toEqual(records.sort((a, b) => Number(b.isVisible) - Number(a.isVisible) || b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id)).map((r) => toCourseSummary(r)));
  });

  it("bounds aggregation and outline reads to the academy and checks live permissions", async () => {
    expect(await courseCounts(prisma, academyId, [foreignCourseId])).toEqual(new Map());
    sqlCount = 0;
    expect(await courseCounts(prisma, academyId, [])).toEqual(new Map());
    expect(sqlCount).toBe(0);
    await expect(courses.getOutline(identity, { academyId, courseId: foreignCourseId })).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
    await expect(courses.list(identity, otherAcademyId)).rejects.toBeDefined();
    await expect(courses.getOutline({ authUserId: studentAuthId } as SupabaseIdentity, { academyId, courseId })).rejects.toBeDefined();
    const suspended = await client.user.create({ data: { status: "SUSPENDED", authUserId: randomUUID() } });
    await expect(courses.getOutline({ authUserId: suspended.authUserId! } as SupabaseIdentity, { academyId, courseId })).rejects.toMatchObject({ code: "USER_SUSPENDED" });
  });

  it("keeps full authoring data intact and excludes it from the outline", async () => {
    const full = courseTreeSchema.parse(await courses.getTree(identity, { academyId, courseId }));
    const outline = courseOutlineSchema.parse(await courses.getOutline(identity, { academyId, courseId }));
    const teacherOutline = await courses.getOutline({ authUserId: teacherAuthId } as SupabaseIdentity, { academyId, courseId });
    expect(teacherOutline).toEqual(outline);
    const exercise = outline.modules[0]!.lectures[0]!.materials[0]!.programmingExercise;
    expect(exercise).toEqual({ difficulty: "EASY", aiFeedbackEnabled: false, referencePdfMaterialId: null });
    expect(full.modules[0]!.lectures[0]!.materials[0]!.programmingExercise?.testCases[0]?.expectedOutput).toBe("sensitive fixture answer");
    const text = JSON.stringify(outline);
    for (const key of ["description\":\"Rich", "starterCode", "testCases", "expectedOutput", "hints"]) expect(text).not.toContain(key);
    expect(courseTreeSchema.safeParse(outline).success).toBe(false);
    const authoring = await courses.getExercise(identity, { academyId, courseId, lectureId, materialId });
    expect(authoring.material.programmingExercise?.testCases).toHaveLength(1);
    const fullBytes = Buffer.byteLength(JSON.stringify(full));
    const outlineBytes = Buffer.byteLength(text);
    evidence.payload = { fullTreeBytes: fullBytes, outlineBytes, reductionPercent: +(100 * (1 - outlineBytes / fullBytes)).toFixed(2) };
    expect(outlineBytes).toBeLessThan(fullBytes / 2);
  });

  it("matches class detail summaries, filtering, ordering and staff role/status", async () => {
    const list = await classes.list(identity, { academyId });
    const detail = await classes.get(identity, { academyId, classId });
    const row = list.classes.find((r) => r.id === classId)!;
    expect(row.courses).toEqual(detail.courses);
    expect(row.studentCount).toBe(1);
    expect(row.studentCount).toBe(detail.studentCount);
    expect(list.classes).toHaveLength(2);
    expect(row.assignedTeacher?.roles).toEqual(["TEACHER", "MANAGER"]);
    expect(row.teachers.map((r) => r.isHomeroom)).toEqual([true, false]);
    expect(JSON.stringify(row)).not.toContain("email");
    expect((await classes.list(identity, { academyId, status: "ACTIVE" })).classes.map((r) => r.id)).toEqual([classId]);
    expect((await classes.list(identity, { academyId, status: "ARCHIVED" })).classes).toHaveLength(1);
    await client.academyMembership.update({ where: { id: assistantId }, data: { status: "SUSPENDED" } });
    expect((await classes.list(identity, { academyId })).classes.find((r) => r.id === classId)?.teachers[1]?.membershipStatus).toBe("SUSPENDED");
    await expect(classes.list(identity, { academyId: otherAcademyId })).rejects.toBeDefined();
  });

  it("preserves account membership roles, feature flags and application timestamps", async () => {
    const old = await client.user.findUniqueOrThrow({ where: { authUserId }, include: legacyAccountInclude });
    const current = await readAccount(prisma, authUserId);
    expect(old).toMatchObject(current!);
    const result = await auth.me(identity);
    expect(result.user.memberships[0]?.roles).toEqual(["TEACHER", "MANAGER"]);
    expect(result.user.applications[0]?.reviewedAt).toBe("2026-10-26T12:34:56.123Z");
    expect(await readAccount(prisma, randomUUID())).toBeNull();
    const filteredAuth = new AuthService(prisma, {} as never, {} as never, { dlabAcademyIds: async () => [] } as never);
    expect((await filteredAuth.me(identity)).user.memberships).toEqual([]);
    await client.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } });
    await expect(auth.me(identity)).rejects.toMatchObject({ code: "USER_SUSPENDED" });
    await client.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
  });

  it("records local query counts and illustrative read timings", async () => {
    async function sample(read: () => Promise<unknown>) {
      const samples = [];
      for (let i = 0; i < 5; i++) {
        sqlCount = 0; const start = performance.now(); await read();
        samples.push({ ms: +(performance.now() - start).toFixed(2), sql: sqlCount });
      }
      return samples;
    }
    const teacherProjection = { select: {
      id: true, role: true, status: true, extraRoles: { select: { role: true } },
      user: { select: { id: true, displayName: true, status: true } },
    } } as const;
    const legacyClasses = () => client.class.findMany({ where: { academyId }, include: {
      assignedTeacher: teacherProjection,
      assistantTeachers: { select: { teacher: teacherProjection }, orderBy: [{ teacher: { user: { displayName: "asc" } } }, { membershipId: "asc" }] },
      courseAssignments: { include: { course: { select: { id: true, title: true, isVisible: true, modules: { where: { isVisible: true }, select: { lectures: { where: { isVisible: true }, select: { _count: { select: { materials: { where: { isVisible: true } } } } } } } } } } } },
      _count: { select: { enrollments: true } },
    } });
    evidence.reads = {
      // Projection comparisons exclude authorization on both sides. Each is
      // five consecutive reads, not an HTTP benchmark or production p95.
      accountLegacy: await sample(() => client.user.findUnique({ where: { authUserId }, include: legacyAccountInclude })),
      accountCurrent: await sample(() => readAccount(prisma, authUserId)),
      courseCountsLegacy: await sample(() => client.course.findMany({ where: { academyId }, include: legacySummaryInclude })),
      courseCountsCurrent: await sample(() => courseCounts(prisma, academyId, [courseId, emptyCourseId])),
      classMetadataLegacy: await sample(legacyClasses),
      classMetadataCurrent: await sample(() => client.$queryRaw(classListQuery(academyId))),
      // Service samples include unchanged authorization and all list reads.
      courseListService: await sample(() => courses.list(identity, academyId)),
      classListService: await sample(() => classes.list(identity, { academyId })),
    };
    const reads = evidence.reads as Record<string, Array<{ sql: number }>>;
    expect(reads.accountCurrent!.every((r) => r.sql === 1)).toBe(true);
    expect(reads.classMetadataCurrent!.every((r) => r.sql === 1)).toBe(true);
    expect(reads.courseCountsCurrent!.every((r) => r.sql === 1)).toBe(true);
  });
});
