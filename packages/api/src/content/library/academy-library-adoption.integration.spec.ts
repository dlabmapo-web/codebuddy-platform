import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../../authorization/support-grant.resolver.js";
import type { PrismaService } from "../../database/prisma.service.js";
import { PrismaClient } from "../../generated/prisma/client.js";
import { deleteSyncFixture } from "../../library-sync/sync-fixture-cleanup.js";
import { AcademyLibraryService } from "./academy-library.service.js";

/**
 * Adoption materializes the latest library release through the sync writer
 * (library sync design §6.3). These are the guarantees the copier's mocked
 * unit spec asserted, now asserted against a real disposable PostgreSQL
 * (packages/api/scripts/test-library-sync.sh), never the shared databases.
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const createClient = (connectionString: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: [{ emit: "event", level: "query" }] });

describe.skipIf(!databaseUrl)("adopting a library course (PostgreSQL)", () => {
  let client: ReturnType<typeof createClient>;
  let service: AcademyLibraryService;
  let statements = 0;
  const org = randomUUID();
  const library = randomUUID();
  const academy = randomUUID();
  const admin = randomUUID();
  const leadAuth = randomUUID();
  const lead = randomUUID();
  const identity = { authUserId: leadAuth } as SupabaseIdentity;

  /** A master with every material type; `fillers` adds plain explanations. */
  async function master(options: { language?: "PYTHON" | "C_CPP"; fillers?: number; videoState?: string } = {}) {
    const id = randomUUID();
    await client.course.create({ data: { id, academyId: library, title: `Master ${id}`, description: "The foundation course.", isVisible: true, contentRevision: 5, language: options.language ?? "PYTHON", createdByUserId: admin } });
    const moduleId = randomUUID();
    const lectureId = randomUUID();
    await client.courseModule.create({ data: { id: moduleId, courseId: id, externalKey: "m1", title: "Variables", description: "names and values", position: 1 } });
    await client.lecture.create({ data: { id: lectureId, courseModuleId: moduleId, externalKey: "l1", title: "Assignment", position: 1 } });
    const asset = { academyId: library, courseId: id, lectureId, uploaderUserId: admin };
    const pdfAsset = randomUUID();
    const videoAsset = randomUUID();
    await client.pdfAsset.create({ data: { ...asset, id: pdfAsset, originalFilename: "t.pdf", byteSize: 1, checksumSha256: "x", state: "READY", consumedAt: new Date(), objectKey: `p/${pdfAsset}` } });
    await client.videoAsset.create({ data: { ...asset, id: videoAsset, filename: "v.mp4", byteSize: 1, state: "READY", requestKey: randomUUID(), objectKey: `v/${videoAsset}`, outputs: ["main.mp4"] } });
    const pdf = randomUUID();
    const exercise = randomUUID();
    const cpp = options.language === "C_CPP";
    await client.material.create({
      data: {
        id: exercise, lectureId, type: "PROGRAMMING_EXERCISE", title: "Sum", position: 1,
        programmingExercise: {
          create: {
            externalKey: "p1", legacyProblemNo: 42, gradingRevision: 7, difficulty: "EASY", timeLimitMs: 3000, aiFeedbackEnabled: true,
            language: cpp ? "CPP" : "PYTHON",
            ...(cpp ? { gradingMode: "ELICE_STDIO", inputPromptPolicy: "INCLUDE", gradingSemanticVersion: "elice-v1", totalTimeLimitMs: 10000, comparatorTimeLimitMs: 1000, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL" } : { inputPromptPolicy: "IGNORE", gradingSemanticVersion: "legacy-v2" }),
            solutions: { create: [{ position: 0, title: "Loop", code: "total" }, { position: 1, title: "Formula", code: "print(n * (n + 1) // 2)" }] },
            testCases: { create: [{ position: 1, input: "3", expectedOutput: "6", visibility: "SAMPLE" }] },
            hints: { create: [{ position: 1, content: "Try a loop." }] },
          },
        },
      },
    });
    await client.material.create({ data: { id: pdf, lectureId, type: "PDF_DOCUMENT", title: "Theory", position: 2, pdfDocument: { create: { assetId: pdfAsset, placement: "BOTH" } } } });
    await client.programmingExercise.update({ where: { materialId: exercise }, data: { referencePdfMaterialId: pdf } });
    const optionIds = [randomUUID(), randomUUID()];
    await client.material.create({
      data: {
        lectureId, type: "MULTIPLE_CHOICE", title: "Choice", position: 3,
        manualMaterial: {
          create: {
            files: {}, includeInScore: true, revision: 7,
            multipleChoice: { version: 1, question: "Original choice", problemDescription: "", selectionMode: "SINGLE", options: optionIds.map((optionId, index) => ({ id: optionId, content: `Original ${index}` })), correctOptionIds: [optionIds[1]], shuffleOptions: true, explanationEnabled: true, explanation: "PRIVATE_EXPLANATION" },
          },
        },
      },
    });
    await client.material.create({
      data: {
        lectureId, type: "TURTLE_EXERCISE", title: "Turtle", position: 4,
        manualMaterial: { create: { revision: 7, runtimeVersion: "approved-image", description: "Draw a circle", files: { "main.py": "import turtle" }, solutionFiles: { "main.py": "PRIVATE" }, modelAnswer: "PRIVATE_ANSWER", includeInScore: true } },
      },
    });
    await client.material.create({
      data: { lectureId, type: "VIDEO_LESSON", title: "Video", position: 5, videoLesson: { create: { assetId: videoAsset, requestKey: randomUUID(), description: "Original description", placement: "BOTH", includeInScore: true, revision: 9 } } },
    });
    for (let index = 0; index < (options.fillers ?? 0); index += 1)
      await client.material.create({ data: { lectureId, type: "EXPLANATION", title: `Note ${index}`, position: 6 + index, explanationMaterial: { create: { body: `<p>${index}</p>` } } } });
    // Student work on the master must never travel.
    await client.exerciseDraft.create({ data: { userId: lead, courseId: id, materialId: exercise, sourceMaterialId: exercise, code: "DRAFT" } });
    if (options.videoState) await client.videoAsset.update({ where: { id: videoAsset }, data: { state: options.videoState } });
    return { id, optionIds, pdfAsset, videoAsset };
  }

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => {
      statements += 1;
    });
    const db = client as unknown as PrismaService;
    service = new AcademyLibraryService(db, new AcademyAccessService(db, new SupportGrantResolver(db)), new AuditService());
    await client.organization.create({ data: { id: org, name: "Adoption", slug: `adopt-${org}` } });
    await client.user.createMany({ data: [{ id: admin, authUserId: randomUUID(), status: "ACTIVE", platformRole: "ADMIN" }, { id: lead, authUserId: leadAuth, status: "ACTIVE", platformRole: "USER" }] });
    await client.academy.create({ data: { id: library, organizationId: org, name: "Library", slug: `lib-${library}`, kind: "LIBRARY" } });
    await client.academy.create({ data: { id: academy, organizationId: org, name: "Branch", slug: `branch-${academy}` } });
    await client.academyMembership.create({ data: { academyId: academy, userId: lead, role: "TEAM_LEAD", status: "ACTIVE" } });
  });
  afterAll(async () => {
    if (client) await deleteSyncFixture(client as never, { organizationId: org, userIds: [admin, lead] });
    await client?.$disconnect();
  });

  const tree = (courseId: string) =>
    client.course.findUniqueOrThrow({
      where: { id: courseId },
      include: {
        syncState: true,
        modules: { include: { lectures: { include: { materials: { orderBy: { position: "asc" }, include: {
          programmingExercise: { include: { solutions: { orderBy: { position: "asc" } }, testCases: true, hints: true } },
          manualMaterial: true, videoLesson: true, pdfDocument: true, drafts: true,
        } } } } } },
      },
    });

  it("copies every level of the latest release with full fidelity and no student history", async () => {
    const source = await master();
    const summary = await service.adopt(identity, { academyId: academy, libraryCourseId: source.id, title: "Gangnam Python 1" });
    const copy = await tree(summary.id);
    expect(copy).toMatchObject({ academyId: academy, title: "Gangnam Python 1", isVisible: true, contentRevision: 1, baselineRevision: 1, sourceCourseId: source.id, sourceContentRevision: 5 });
    expect(copy.syncState).toMatchObject({ appliedReleaseNumber: 1, openConflictCount: 0 });
    expect(copy.modules).toHaveLength(1);
    const [courseModule] = copy.modules;
    expect(courseModule).toMatchObject({ externalKey: "m1", isVisible: true });
    expect(courseModule!.lectures[0]).toMatchObject({ externalKey: "l1", isVisible: true });
    const materials = courseModule!.lectures[0]!.materials;
    expect(materials.map((material) => [material.type, material.isVisible])).toEqual([
      ["PROGRAMMING_EXERCISE", true], ["PDF_DOCUMENT", true], ["MULTIPLE_CHOICE", false], ["TURTLE_EXERCISE", true], ["VIDEO_LESSON", false],
    ]);
    const [exercise, pdf, choice, turtle, video] = materials;
    expect(exercise!.programmingExercise).toMatchObject({
      externalKey: "p1", legacyProblemNo: null, gradingRevision: 1, difficulty: "EASY", timeLimitMs: 3000,
      aiFeedbackEnabled: true, inputPromptPolicy: "IGNORE", gradingSemanticVersion: "legacy-v2", referencePdfMaterialId: pdf!.id,
    });
    expect(exercise!.programmingExercise!.solutions.map((row) => [row.title, row.code])).toEqual([["Loop", "total"], ["Formula", "print(n * (n + 1) // 2)"]]);
    expect(exercise!.programmingExercise!.testCases).toEqual([expect.objectContaining({ input: "3", expectedOutput: "6", visibility: "SAMPLE" })]);
    expect(exercise!.programmingExercise!.hints).toEqual([expect.objectContaining({ content: "Try a loop." })]);
    expect(exercise!.drafts).toEqual([]);
    expect(pdf!.pdfDocument).toMatchObject({ assetId: source.pdfAsset, placement: "BOTH", revision: 1 });
    const definition = choice!.manualMaterial!.multipleChoice as { options: Array<{ id: string }>; correctOptionIds: string[]; explanation: string; shuffleOptions: boolean };
    expect(choice!.manualMaterial!.revision).toBe(1);
    expect(definition.options.map((option) => option.id)).not.toEqual(source.optionIds);
    expect(definition.correctOptionIds).toEqual([definition.options[1]!.id]);
    expect(definition).toMatchObject({ explanation: "PRIVATE_EXPLANATION", shuffleOptions: true });
    expect(turtle!.manualMaterial).toMatchObject({ revision: 1, runtimeVersion: "approved-image", description: "Draw a circle", solutionFiles: { "main.py": "PRIVATE" }, modelAnswer: "PRIVATE_ANSWER", includeInScore: true });
    expect(turtle!.isRequired).toBe(true);
    expect(video!.videoLesson).toMatchObject({ assetId: source.videoAsset, description: "Original description", placement: "BOTH", includeInScore: true, revision: 1 });
    // Only the academy's own title differs from the release: its customization.
    expect(copy.syncState!.divergentUnitCount).toBe(1);
  });

  it("keeps a C/C++ master's language, and each problem its own", async () => {
    const source = await master({ language: "C_CPP" });
    const summary = await service.adopt(identity, { academyId: academy, libraryCourseId: source.id, title: "Gangnam C++ 1" });
    const copy = await tree(summary.id);
    expect(copy.language).toBe("C_CPP");
    expect(copy.modules[0]!.lectures[0]!.materials[0]!.programmingExercise).toMatchObject({ language: "CPP", gradingSemanticVersion: "elice-v1" });
  });

  it("costs the same number of statements for a small and a large course", async () => {
    // Same tables, different sizes: a count that differs grows with rows.
    const small = await master({ fillers: 2 });
    const large = await master({ fillers: 40 });
    // Capture each master's release first, so only the copy is measured.
    await service.adopt(identity, { academyId: academy, libraryCourseId: small.id, title: `warm ${small.id}` });
    await service.adopt(identity, { academyId: academy, libraryCourseId: large.id, title: `warm ${large.id}` });
    const count = async (id: string) => {
      const before = statements;
      await service.adopt(identity, { academyId: academy, libraryCourseId: id, title: `measured ${id}` });
      return statements - before;
    };
    const smallCount = await count(small.id);
    const largeCount = await count(large.id);
    process.stdout.write(`adoption statements: small ${smallCount}, large ${largeCount}\n`);
    expect(largeCount).toBe(smallCount);
  });

  it("refuses, copying nothing, when an asset the release names is no longer ready", async () => {
    const source = await master();
    await service.adopt(identity, { academyId: academy, libraryCourseId: source.id, title: `first ${source.id}` });
    await client.videoAsset.update({ where: { id: source.videoAsset }, data: { state: "PROCESSING" } });
    const before = await client.course.count({ where: { academyId: academy } });
    await expect(service.adopt(identity, { academyId: academy, libraryCourseId: source.id, title: `second ${source.id}` })).rejects.toMatchObject({ code: "LIBRARY_IMPORT_CONTENT_INVALID" });
    expect(await client.course.count({ where: { academyId: academy } })).toBe(before);
  });
});
