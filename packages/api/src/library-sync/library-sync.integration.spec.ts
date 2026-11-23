import { randomUUID } from "node:crypto";
import { starterBundleFor } from "@cove/shared";
import { ConfigService } from "@nestjs/config";
import { saveManualSchema } from "@cove/shared";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { ManualService } from "../manual/manual.service.js";
import { MultipleChoiceService } from "../manual/multiple-choice.service.js";
import { ShortAnswerService } from "../manual/short-answer.service.js";
import { copyCourseTree, courseCopyInclude } from "../content/library/course-tree-copy.js";
import { lockCourseRow } from "./release.js";
import { publishRelease } from "./release-access.js";
import { AcademyLibrarySyncService } from "./academy-sync.service.js";
import { deleteSyncFixture } from "./sync-fixture-cleanup.js";
import { LibrarySyncJobService } from "./sync-job.service.js";

/**
 * The design's §1.1 example, end to end, on a disposable PostgreSQL
 * (packages/api/scripts/test-library-sync.sh). Never the shared databases.
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

const createClient = (connectionString: string) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [{ emit: "event", level: "query" }],
  });

describe.skipIf(!databaseUrl)("library course sync (PostgreSQL)", () => {
  let client: ReturnType<typeof createClient>;
  let db: PrismaService;
  let statements = 0;
  const audit = new AuditService();
  const ids = {
    org: randomUUID(),
    library: randomUUID(),
    academy: randomUUID(),
    admin: randomUUID(),
    lead: randomUUID(),
    student: randomUUID(),
    master: randomUUID(),
    module: randomUUID(),
    lecture: randomUUID(),
    explanation: randomUUID(),
    video: randomUUID(),
    exercise: randomUUID(),
    pdf: randomUUID(),
    turtle: randomUUID(),
    written: randomUUID(),
    choice: randomUUID(),
    videoA: randomUUID(),
    videoB: randomUUID(),
    pdfA: randomUUID(),
    pdfB: randomUUID(),
    optionA: randomUUID(),
    optionB: randomUUID(),
    optionC: randomUUID(),
    optionD: randomUUID(),
    caseOne: randomUUID(),
    caseTwo: randomUUID(),
    classId: randomUUID(),
  };
  const leadAuth = randomUUID();
  const adminAuth = randomUUID();
  const identity = { authUserId: leadAuth } as SupabaseIdentity;
  let copyId = "";
  let jobs: LibrarySyncJobService;

  const publish = (note: string, requireChanges = true) =>
    client.$transaction(
      async (tx) => {
        await lockCourseRow(tx, ids.master);
        return publishRelease(tx, audit, {
          libraryCourseId: ids.master,
          note,
          actorUserId: ids.admin,
          requireChanges,
        });
      },
      { timeout: 60_000 },
    );
  const local = async (masterId: string) =>
    (
      await client.librarySyncLink.findFirstOrThrow({
        where: { copyCourseId: copyId, nodeKey: masterId },
      })
    ).localId!;

  beforeAll(async () => {
    client = createClient(databaseUrl!);
    client.$on("query", () => {
      statements += 1;
    });
    db = client as unknown as PrismaService;
    jobs = new LibrarySyncJobService(
      db,
      new ConfigService({
        LIBRARY_SYNC_ENABLED: true,
        LIBRARY_SYNC_CONCURRENCY: 1,
      }) as never,
      audit,
      { revokeClass: vi.fn() } as never,
    );

    await client.organization.create({
      data: { id: ids.org, name: "Sync org", slug: `sync-${ids.org}` },
    });
    await client.user.createMany({
      data: [
        {
          id: ids.admin,
          authUserId: adminAuth,
          status: "ACTIVE",
          platformRole: "ADMIN",
        },
        {
          id: ids.lead,
          authUserId: leadAuth,
          status: "ACTIVE",
          platformRole: "USER",
        },
        {
          id: ids.student,
          authUserId: randomUUID(),
          status: "ACTIVE",
          platformRole: "USER",
        },
      ],
    });
    await client.academy.create({
      data: {
        id: ids.library,
        organizationId: ids.org,
        name: "Library",
        slug: `library-${ids.library}`,
        kind: "LIBRARY",
      },
    });
    await client.academy.create({
      data: {
        id: ids.academy,
        organizationId: ids.org,
        name: "Gangnam",
        slug: `gangnam-${ids.academy}`,
      },
    });
    await client.academyMembership.create({
      data: {
        academyId: ids.academy,
        userId: ids.lead,
        role: "TEAM_LEAD",
        status: "ACTIVE",
      },
    });
    const studentMembership = await client.academyMembership.create({
      data: {
        academyId: ids.academy,
        userId: ids.student,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    await client.academyFeatureFlag.create({
      data: {
        academyId: ids.academy,
        feature: "LIBRARY_COURSE_SYNC",
        isEnabled: true,
      },
    });

    await client.course.create({
      data: {
        id: ids.master,
        academyId: ids.library,
        title: "Python Level 1",
        description: "Basics",
        isVisible: true,
        createdByUserId: ids.admin,
      },
    });
    await client.courseModule.create({
      data: {
        id: ids.module,
        courseId: ids.master,
        externalKey: "m1",
        title: "Module",
        position: 1,
      },
    });
    await client.lecture.create({
      data: {
        id: ids.lecture,
        courseModuleId: ids.module,
        externalKey: "l1",
        title: "Lecture",
        position: 1,
      },
    });
    const asset = {
      academyId: ids.library,
      courseId: ids.master,
      lectureId: ids.lecture,
      uploaderUserId: ids.admin,
    };
    await client.videoAsset.createMany({
      data: [ids.videoA, ids.videoB].map((id) => ({
        ...asset,
        id,
        filename: "v.mp4",
        byteSize: 10,
        state: "READY",
        requestKey: randomUUID(),
        objectKey: `v/${id}`,
        outputs: ["main.mp4"],
      })),
    });
    await client.pdfAsset.createMany({
      data: [ids.pdfA, ids.pdfB].map((id) => ({
        ...asset,
        id,
        originalFilename: "p.pdf",
        byteSize: 10,
        checksumSha256: "x",
        state: "READY",
        consumedAt: new Date(),
        objectKey: `p/${id}`,
      })),
    });
    const material = (
      id: string,
      type: string,
      title: string,
      position: number,
    ) => ({
      id,
      lectureId: ids.lecture,
      type: type as never,
      title,
      position,
      isVisible: false,
    });
    await client.material.create({
      data: {
        ...material(ids.explanation, "EXPLANATION", "Explanation", 1),
        explanationMaterial: {
          create: { body: "<p>Variables hold values.</p>" },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.video, "VIDEO_LESSON", "Video", 2),
        videoLesson: {
          create: { assetId: ids.videoA, requestKey: randomUUID() },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.exercise, "PROGRAMMING_EXERCISE", "Sum", 3),
        programmingExercise: {
          create: {
            externalKey: "p1",
            difficulty: "EASY",
            description: "<p>Add two numbers.</p>",
            starterCode: "a, b = map(int, input().split())\n",
            solutions: {
              create: [
                {
                  position: 0,
                  title: "Main",
                  code: "print(sum(map(int, input().split())))",
                },
              ],
            },
            testCases: {
              create: [
                {
                  syncKey: ids.caseOne,
                  position: 1,
                  input: "1 2",
                  expectedOutput: "3",
                  visibility: "SAMPLE",
                },
                {
                  syncKey: ids.caseTwo,
                  position: 2,
                  input: "2 2",
                  expectedOutput: "5",
                  visibility: "HIDDEN",
                },
              ],
            },
            hints: {
              create: [{ position: 1, content: "Use input().split()" }],
            },
          },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.pdf, "PDF_DOCUMENT", "Notes", 4),
        pdfDocument: { create: { assetId: ids.pdfA } },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.turtle, "TURTLE_EXERCISE", "Square", 5),
        manualMaterial: {
          create: {
            files: { "main.py": "import turtle\nturtle.forward(10)\n" },
          },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.written, "WRITTEN_RESPONSE", "Arithmetic", 6),
        manualMaterial: {
          create: {
            shortAnswer: {
              version: 1,
              question: "2 + 2?",
              gradingMode: "EXACT",
              expectedAnswer: "4",
              pattern: "",
              explanationEnabled: false,
              explanation: "",
            },
          },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.choice, "MULTIPLE_CHOICE", "Pick", 7),
        manualMaterial: {
          create: {
            files: {},
            multipleChoice: {
              version: 1,
              question: "Which is a list?",
              problemDescription: "",
              selectionMode: "SINGLE",
              options: [
                { id: ids.optionA, content: "<p>[1]</p>" },
                { id: ids.optionB, content: "<p>(1,)</p>" },
                { id: ids.optionC, content: "<p>{1}</p>" },
              ],
              shuffleOptions: false,
              explanationEnabled: false,
              correctOptionIds: [ids.optionA],
              explanation: "",
            },
          },
        },
      },
    });
    await client.class.create({
      data: {
        id: ids.classId,
        academyId: ids.academy,
        name: "Class",
        createdByUserId: ids.lead,
      },
    });
    void studentMembership;
  });

  afterAll(async () => {
    if (client)
      await deleteSyncFixture(client as never, {
        organizationId: ids.org,
        userIds: [ids.admin, ids.lead, ids.student],
      });
    await client?.$disconnect();
  });

  it("adopts release 1 with every node linked and the adoption visibility policy", async () => {
    const first = await publish("First", false);
    expect(first.number).toBe(1);
    const service = new AcademyLibraryService(
      db,
      new AcademyAccessService(db, new SupportGrantResolver(db)),
      audit,
    );
    const summary = await service.adopt(identity, {
      academyId: ids.academy,
      libraryCourseId: ids.master,
      title: "Python Level 1",
    });
    copyId = summary.id;

    const state = await client.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyId },
    });
    expect(state).toMatchObject({
      appliedReleaseNumber: 1,
      targetReleaseNumber: 1,
      status: "IDLE",
      openConflictCount: 0,
      divergentUnitCount: 0,
    });
    expect(
      await client.librarySyncLink.count({
        where: { copyCourseId: copyId, state: "LINKED" },
      }),
    ).toBe(9);

    const copyMaterials = await client.material.findMany({
      where: { lecture: { courseModule: { courseId: copyId } } },
      orderBy: { position: "asc" },
    });
    expect(copyMaterials.map((row) => [row.type, row.isVisible])).toEqual([
      ["EXPLANATION", true],
      ["VIDEO_LESSON", false],
      ["PROGRAMMING_EXERCISE", true],
      ["PDF_DOCUMENT", true],
      ["TURTLE_EXERCISE", true],
      ["WRITTEN_RESPONSE", false],
      ["MULTIPLE_CHOICE", false],
    ]);
    const cases = await client.exerciseTestCase.findMany({
      where: { exerciseMaterialId: await local(ids.exercise) },
      orderBy: { position: "asc" },
    });
    expect(cases.map((row) => row.syncKey)).toEqual([ids.caseOne, ids.caseTwo]);
    const choice = await client.manualMaterial.findUniqueOrThrow({
      where: { materialId: await local(ids.choice) },
    });
    const options = (
      choice.multipleChoice as { options: Array<{ id: string }> }
    ).options.map((option) => option.id);
    expect(options).not.toContain(ids.optionA);
    const link = await client.librarySyncLink.findFirstOrThrow({
      where: { copyCourseId: copyId, nodeKey: ids.choice },
    });
    expect(
      (link.meta as { optionMap: Record<string, string> }).optionMap[
        ids.optionA
      ],
    ).toBe(options[0]);
  });

  it("applies the seven library changes, keeps academy edits and history, and flags one conflict", async () => {
    const exercise = await local(ids.exercise);
    const choice = await local(ids.choice);
    const video = await local(ids.video);
    // Student history on the copy.
    await client.studentExerciseProgress.create({
      data: {
        userId: ids.student,
        materialId: exercise,
        status: "SOLVED",
        attemptCount: 2,
        bestPassed: 2,
        bestScore: 100,
        gradingRevision: 1,
        firstSolvedAt: new Date(),
      },
    });
    await client.submission.create({
      data: {
        userId: ids.student,
        materialId: exercise,
        sourceMaterialId: exercise,
        courseId: copyId,
        classId: ids.classId,
        gradingRevision: 1,
        language: "PYTHON",
        timeLimitMs: 3000,
        memoryLimitMb: 256,
        code: "print(3)",
        status: "PASSED",
        passedCount: 2,
        totalCount: 2,
        score: 100,
        engineVersion: "test",
        problemTitle: "Sum",
        courseTitle: "Python Level 1",
        moduleTitle: "Module",
        lectureTitle: "Lecture",
        modulePosition: 1,
        lecturePosition: 1,
        problemPosition: 3,
      },
    });
    const attempt = await client.manualSubmission.create({
      data: {
        materialId: choice,
        userId: ids.student,
        classId: ids.classId,
        files: {},
        profile: {},
        revision: 1,
        maximumHundredths: 10000,
        includeInScore: false,
        requestKey: randomUUID(),
      },
    });
    await client.multipleChoiceAssessment.create({
      data: {
        submissionId: attempt.id,
        definition: { frozen: true },
        selectedOptionIds: [],
        displayOrder: [],
        verdict: "CORRECT",
        scoreHundredths: 10000,
        completed: true,
      },
    });
    await client.videoWatchProgress.create({
      data: {
        materialId: video,
        assetId: ids.videoA,
        userId: ids.student,
        classId: ids.classId,
        completed: true,
        thresholdBasisPoints: 9000,
        maximumHundredths: 10000,
        sessionId: randomUUID(),
      },
    });

    // The academy rewrites the problem's instructions and the explanation.
    await client.programmingExercise.update({
      where: { materialId: exercise },
      data: { description: "<p>Academy instructions.</p>" },
    });
    await client.explanationMaterial.update({
      where: { materialId: await local(ids.explanation) },
      data: { body: "<p>Academy explanation.</p>" },
    });

    // Head office: the seven changes of design §1.1.
    await client.explanationMaterial.update({
      where: { materialId: ids.explanation },
      data: { body: "<p>Variables name values.</p>" },
    });
    await client.videoLesson.update({
      where: { materialId: ids.video },
      data: { assetId: ids.videoB },
    });
    await client.exerciseTestCase.update({
      where: {
        exerciseMaterialId_syncKey: {
          exerciseMaterialId: ids.exercise,
          syncKey: ids.caseTwo,
        },
      },
      data: { expectedOutput: "4" },
    });
    await client.exerciseTestCase.create({
      data: {
        exerciseMaterialId: ids.exercise,
        position: 3,
        input: "5 5",
        expectedOutput: "10",
        visibility: "HIDDEN",
      },
    });
    await client.pdfDocument.update({
      where: { materialId: ids.pdf },
      data: { assetId: ids.pdfB },
    });
    await client.manualMaterial.update({
      where: { materialId: ids.turtle },
      data: { files: { "main.py": "import turtle\nturtle.forward(20)\n" } },
    });
    await client.manualMaterial.update({
      where: { materialId: ids.written },
      data: {
        shortAnswer: {
          version: 1,
          question: "2 + 2?",
          gradingMode: "EXACT",
          expectedAnswer: "four",
          pattern: "",
          explanationEnabled: false,
          explanation: "",
        },
      },
    });
    await client.manualMaterial.update({
      where: { materialId: ids.choice },
      data: {
        multipleChoice: {
          version: 1,
          question: "Which is a list?",
          problemDescription: "",
          selectionMode: "SINGLE",
          options: [
            { id: ids.optionA, content: "<p>[1]</p>" },
            { id: ids.optionB, content: "<p>(1,)</p>" },
            { id: ids.optionC, content: "<p>{1}</p>" },
            { id: ids.optionD, content: "<p>[1, 2]</p>" },
          ],
          shuffleOptions: false,
          explanationEnabled: false,
          correctOptionIds: [ids.optionD],
          explanation: "",
        },
      },
    });
    await client.course.update({
      where: { id: ids.master },
      data: { contentRevision: { increment: 1 } },
    });

    const second = await publish("Corrections");
    expect(second.summary.changed).toBe(7);
    expect(
      await client.librarySyncJob.count({
        where: {
          copyCourseId: copyId,
          status: "PENDING",
          targetReleaseNumber: 2,
        },
      }),
    ).toBe(1);

    const before = statements;
    expect(await jobs.drain()).toBe(1);
    const runStatements = statements - before;

    const state = await client.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyId },
    });
    expect(state).toMatchObject({
      appliedReleaseNumber: 2,
      status: "IDLE",
      openConflictCount: 1,
    });

    // Explanation: academy kept, conflict raised; nothing else blocked.
    expect(
      (
        await client.explanationMaterial.findUniqueOrThrow({
          where: { materialId: await local(ids.explanation) },
        })
      ).body,
    ).toBe("<p>Academy explanation.</p>");
    const conflicts = await client.librarySyncConflict.findMany({
      where: { copyCourseId: copyId, status: "OPEN" },
    });
    expect(
      conflicts.map((row) => [row.nodeKey, row.unitKey, row.kind]),
    ).toEqual([[ids.explanation, "explanation.body", "CONCURRENT_EDIT"]]);

    expect(
      (
        await client.videoLesson.findUniqueOrThrow({
          where: { materialId: video },
        })
      ).assetId,
    ).toBe(ids.videoB);
    expect(
      (
        await client.pdfDocument.findUniqueOrThrow({
          where: { materialId: await local(ids.pdf) },
        })
      ).assetId,
    ).toBe(ids.pdfB);

    const exerciseRow = await client.programmingExercise.findUniqueOrThrow({
      where: { materialId: exercise },
      include: { testCases: { orderBy: { position: "asc" } } },
    });
    expect(exerciseRow.description).toBe("<p>Academy instructions.</p>");
    expect(
      exerciseRow.testCases.map((row) => [row.input, row.expectedOutput]),
    ).toEqual([
      ["1 2", "3"],
      ["2 2", "4"],
      ["5 5", "10"],
    ]);
    expect(exerciseRow.gradingRevision).toBe(2);

    // D2: the student's solved state stands, rolled forward; history untouched.
    const progress = await client.studentExerciseProgress.findFirstOrThrow({
      where: { materialId: exercise },
    });
    expect(progress).toMatchObject({
      status: "SOLVED",
      bestScore: 100,
      attemptCount: 2,
      gradingRevision: 2,
    });
    expect(
      await client.submission.count({ where: { materialId: exercise } }),
    ).toBe(1);
    expect(
      await client.videoWatchProgress.count({
        where: { materialId: video, assetId: ids.videoA },
      }),
    ).toBe(1);

    const turtle = await client.manualMaterial.findUniqueOrThrow({
      where: { materialId: await local(ids.turtle) },
    });
    expect((turtle.files as Record<string, string>)["main.py"]).toContain(
      "forward(20)",
    );
    const written = await client.manualMaterial.findUniqueOrThrow({
      where: { materialId: await local(ids.written) },
    });
    expect(
      (written.shortAnswer as { expectedAnswer: string }).expectedAnswer,
    ).toBe("four");

    // D1: the MC key changes in place; the old attempt keeps its frozen definition.
    const choiceRow = await client.manualMaterial.findUniqueOrThrow({
      where: { materialId: choice },
    });
    const definition = choiceRow.multipleChoice as {
      options: Array<{ id: string; content: string }>;
      correctOptionIds: string[];
    };
    expect(definition.options).toHaveLength(4);
    const link = await client.librarySyncLink.findFirstOrThrow({
      where: { copyCourseId: copyId, nodeKey: ids.choice },
    });
    const optionMap = (link.meta as { optionMap: Record<string, string> })
      .optionMap;
    expect(definition.correctOptionIds).toEqual([optionMap[ids.optionD]]);
    expect(
      (
        await client.multipleChoiceAssessment.findUniqueOrThrow({
          where: { submissionId: attempt.id },
        })
      ).definition,
    ).toEqual({ frozen: true });

    expect(
      await client.librarySyncChange.count({
        where: { copyCourseId: copyId, outcome: "APPLIED" },
      }),
    ).toBeGreaterThanOrEqual(6);
    process.stdout.write(`library sync run statements: ${runStatements}\n`);
    expect(runStatements).toBeLessThan(80);
  });

  it("is a no-op when run again, and refuses a release without changes", async () => {
    expect(await jobs.drain()).toBe(0);
    await expect(publish("Nothing")).rejects.toMatchObject({
      code: "CONTENT_VALIDATION_FAILED",
    });
  });

  it("archives content the library removes instead of deleting it", async () => {
    const turtle = await local(ids.turtle);
    await client.material.delete({ where: { id: ids.turtle } });
    await client.course.update({
      where: { id: ids.master },
      data: { contentRevision: { increment: 1 } },
    });
    await publish("Removed turtle");
    expect(await jobs.drain()).toBe(1);
    const row = await client.material.findUniqueOrThrow({
      where: { id: turtle },
    });
    expect(row.isVisible).toBe(false);
    expect(
      (
        await client.librarySyncLink.findFirstOrThrow({
          where: { copyCourseId: copyId, nodeKey: ids.turtle },
        })
      ).state,
    ).toBe("ARCHIVED");
  });

  it("adds a new library material visible, after its library predecessor", async () => {
    const added = randomUUID();
    await client.material.create({
      data: {
        id: added,
        lectureId: ids.lecture,
        type: "EXPLANATION",
        title: "New",
        position: 8,
        isVisible: false,
        explanationMaterial: { create: { body: "<p>New</p>" } },
      },
    });
    await client.course.update({
      where: { id: ids.master },
      data: { contentRevision: { increment: 1 } },
    });
    await publish("Added");
    expect(await jobs.drain()).toBe(1);
    const localId = await local(added);
    const row = await client.material.findUniqueOrThrow({
      where: { id: localId },
    });
    expect(row.isVisible).toBe(true);
    const siblings = await client.material.findMany({
      where: { lectureId: row.lectureId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(siblings.at(-1)?.id).toBe(localId);
  });
  it("keeps the academy's version on request, and asks again only when the library changes it again", async () => {
    const decisions = new AcademyLibrarySyncService(
      db,
      new AcademyAccessService(db, new SupportGrantResolver(db)),
      audit,
      { revokeClass: vi.fn() } as never,
    );
    const [open] = (
      await decisions.updates(identity, {
        academyId: ids.academy,
        courseId: copyId,
      })
    ).conflicts;
    expect(open).toMatchObject({
      unitKey: "explanation.body",
      path: ["Module", "Lecture", "Explanation"],
    });
    const detail = await decisions.conflict(identity, {
      academyId: ids.academy,
      conflictId: open!.id,
    });
    expect(detail.ours).toEqual({
      kind: "html",
      value: "<p>Academy explanation.</p>",
    });
    expect(detail.theirs).toEqual({
      kind: "html",
      value: "<p>Variables name values.</p>",
    });
    expect(detail.base).toEqual({
      kind: "html",
      value: "<p>Variables hold values.</p>",
    });

    // A stale comparison is refused; a replayed request returns the first result.
    await expect(
      decisions.resolve(identity, {
        academyId: ids.academy,
        conflictId: open!.id,
        action: "KEEP_ACADEMY",
        expectedOursHash: "stale",
        expectedTheirsHash: detail.expectedTheirsHash,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_EDIT_CONFLICT" });
    const requestKey = randomUUID();
    const keep = {
      academyId: ids.academy,
      conflictId: open!.id,
      action: "KEEP_ACADEMY" as const,
      expectedOursHash: detail.expectedOursHash,
      expectedTheirsHash: detail.expectedTheirsHash,
      requestKey,
    };
    expect(
      (await decisions.resolve(identity, keep)).sync?.openConflictCount,
    ).toBe(0);
    await decisions.resolve(identity, keep);

    // An unrelated release does not raise it again.
    await client.lecture.update({
      where: { id: ids.lecture },
      data: { description: "Updated lecture" },
    });
    await publish("Lecture description");
    expect(await jobs.drain()).toBe(1);
    expect(
      await client.librarySyncConflict.count({
        where: { copyCourseId: copyId, status: "OPEN" },
      }),
    ).toBe(0);
    expect(
      (
        await client.explanationMaterial.findUniqueOrThrow({
          where: { materialId: await local(ids.explanation) },
        })
      ).body,
    ).toBe("<p>Academy explanation.</p>");

    // A new library change to the same text asks again.
    await client.explanationMaterial.update({
      where: { materialId: ids.explanation },
      data: { body: "<p>Variables refer to values.</p>" },
    });
    await publish("Explanation again");
    expect(await jobs.drain()).toBe(1);
    const [again] = (
      await decisions.updates(identity, {
        academyId: ids.academy,
        courseId: copyId,
      })
    ).conflicts;
    expect(again?.unitKey).toBe("explanation.body");

    // Use the library's version.
    const second = await decisions.conflict(identity, {
      academyId: ids.academy,
      conflictId: again!.id,
    });
    await decisions.resolve(identity, {
      academyId: ids.academy,
      conflictId: again!.id,
      action: "ACCEPT_LIBRARY",
      expectedOursHash: second.expectedOursHash,
      expectedTheirsHash: second.expectedTheirsHash,
      requestKey: randomUUID(),
    });
    expect(
      (
        await client.explanationMaterial.findUniqueOrThrow({
          where: { materialId: await local(ids.explanation) },
        })
      ).body,
    ).toBe("<p>Variables refer to values.</p>");
    expect(
      await client.librarySyncConflict.count({
        where: { copyCourseId: copyId, status: "OPEN" },
      }),
    ).toBe(0);
  });

  it("writes a manually merged text and treats the library change as acknowledged", async () => {
    const decisions = new AcademyLibrarySyncService(
      db,
      new AcademyAccessService(db, new SupportGrantResolver(db)),
      audit,
      { revokeClass: vi.fn() } as never,
    );
    const exercise = await local(ids.exercise);
    await client.programmingExercise.update({
      where: { materialId: ids.exercise },
      data: { description: "<p>Add two integers.</p>" },
    });
    await publish("Exercise statement");
    expect(await jobs.drain()).toBe(1);
    const [open] = (
      await decisions.updates(identity, {
        academyId: ids.academy,
        courseId: copyId,
      })
    ).conflicts;
    expect(open).toMatchObject({
      unitKey: "exercise.description",
      actions: ["ACCEPT_LIBRARY", "KEEP_ACADEMY", "MANUAL"],
    });
    const detail = await decisions.conflict(identity, {
      academyId: ids.academy,
      conflictId: open!.id,
    });
    await decisions.resolve(identity, {
      academyId: ids.academy,
      conflictId: open!.id,
      action: "MANUAL",
      value: "<p>Academy instructions: add two integers.</p>",
      expectedOursHash: detail.expectedOursHash,
      expectedTheirsHash: detail.expectedTheirsHash,
      requestKey: randomUUID(),
    });
    const row = await client.programmingExercise.findUniqueOrThrow({
      where: { materialId: exercise },
    });
    expect(row.description).toBe(
      "<p>Academy instructions: add two integers.</p>",
    );
    // Test cases are untouched by a statement merge.
    expect(
      await client.exerciseTestCase.count({
        where: { exerciseMaterialId: exercise },
      }),
    ).toBe(3);
    expect(
      await client.librarySyncConflict.count({
        where: { copyCourseId: copyId, status: "OPEN" },
      }),
    ).toBe(0);
  });

  it("lets library authors edit live answer definitions, publishes them together, and keeps academy attempts frozen", async () => {
    const access = new AcademyAccessService(db, new SupportGrantResolver(db));
    const config = new ConfigService({ MULTIPLE_CHOICE_ENABLED: true, SHORT_ANSWER_ENABLED: true });
    const manual = new ManualService(db, access, audit, {} as never, {} as never, {} as never,
      new ShortAnswerService(db, config, {} as never), new MultipleChoiceService(config));
    const admin = { authUserId: adminAuth } as SupabaseIdentity;
    const copyChoice = await local(ids.choice);
    const copyWritten = await local(ids.written);
    await client.material.updateMany({ where: { id: { in: [ids.choice, ids.written, copyChoice, copyWritten] } }, data: { isVisible: true } });
    const frozen = await client.multipleChoiceAssessment.findMany({ where: { submission: { materialId: copyChoice } } });
    expect(frozen.length).toBeGreaterThan(0);
    const beforeChoice = await client.manualMaterial.findUniqueOrThrow({ where: { materialId: copyChoice } });

    statements = 0;
    const choice = await manual.workspace(admin, { academyId: ids.library, materialId: ids.choice }, true);
    // Existing full author workspace budget; library scope uses facts already
    // read for authorization and adds no database round trip.
    expect(statements).toBe(15);
    expect(choice.definitionLocked).toBe(false);
    const optionId = randomUUID();
    const edit = saveManualSchema.parse({ ...choice.config, academyId: ids.library, courseId: ids.master,
      lectureId: ids.lecture, materialId: ids.choice, title: choice.title, type: choice.type,
      multipleChoice: { ...choice.config.multipleChoice, options: [...choice.config.multipleChoice!.options, { id: optionId, content: "<p>Another choice</p>" }], correctOptionIds: [optionId] } });
    await manual.save(admin, edit);
    await expect(manual.save(admin, edit)).rejects.toThrow("Content changed; reload before saving");

    const written = await manual.workspace(admin, { academyId: ids.library, materialId: ids.written }, true);
    expect(written.definitionLocked).toBe(false);
    await manual.save(admin, saveManualSchema.parse({ ...written.config, academyId: ids.library, courseId: ids.master,
      lectureId: ids.lecture, materialId: ids.written, title: written.title, type: written.type,
      shortAnswer: { ...written.config.shortAnswer, expectedAnswer: "four hundred" } }));

    // Saves remain drafts: existing copies change only when the batch is published.
    expect((await client.manualMaterial.findUniqueOrThrow({ where: { materialId: copyChoice } })).multipleChoice).toEqual(beforeChoice.multipleChoice);
    expect((await client.manualMaterial.findUniqueOrThrow({ where: { materialId: copyWritten } })).shortAnswer).toMatchObject({ expectedAnswer: "four" });
    await publish("Quiz and short-answer corrections");
    expect(await jobs.drain()).toBe(1);
    const updated = await client.manualMaterial.findUniqueOrThrow({ where: { materialId: copyChoice } });
    expect(updated.multipleChoice).toMatchObject({ options: expect.arrayContaining([expect.objectContaining({ content: "<p>Another choice</p>" })]) });
    const mappedId = (updated.multipleChoice as { options: Array<{ id: string; content: string }> }).options.find(o => o.content === "<p>Another choice</p>")!.id;
    expect(updated.multipleChoice).toMatchObject({ correctOptionIds: [mappedId] });
    expect((await client.manualMaterial.findUniqueOrThrow({ where: { materialId: copyWritten } })).shortAnswer).toMatchObject({ expectedAnswer: "four hundred" });
    expect(await client.multipleChoiceAssessment.findMany({ where: { submission: { materialId: copyChoice } } })).toEqual(frozen);

    // Neither academy membership nor platform inspection inherits the library exception.
    const academyChoice = await manual.workspace(identity, { academyId: ids.academy, materialId: copyChoice }, true);
    expect(academyChoice.definitionLocked).toBe(true);
    const localEdit = saveManualSchema.parse({ ...academyChoice.config, academyId: ids.academy, courseId: copyId,
      lectureId: academyChoice.staff!.lectureId, materialId: copyChoice, title: academyChoice.title, type: academyChoice.type,
      multipleChoice: { ...academyChoice.config.multipleChoice, correctOptionIds: [academyChoice.config.multipleChoice!.options[0]!.id] } });
    await expect(manual.save(identity, localEdit)).rejects.toThrow("answer definitions are locked");
    await expect(manual.save(admin, localEdit)).rejects.toThrow("answer definitions are locked");
    const academyWritten = await manual.workspace(identity, { academyId: ids.academy, materialId: copyWritten }, true);
    await expect(manual.save(identity, saveManualSchema.parse({ ...academyWritten.config, academyId: ids.academy, courseId: copyId,
      lectureId: academyWritten.staff!.lectureId, materialId: copyWritten, title: academyWritten.title, type: academyWritten.type,
      shortAnswer: { ...academyWritten.config.shortAnswer, expectedAnswer: "Different local key" } }))).rejects.toThrow("answer definitions are locked");
  });

  it("adopts and updates a multi-file C/C++ library problem, files and flags included", async () => {
    const master = randomUUID(), moduleId = randomUUID(), lectureId = randomUUID(), added = randomUUID();
    const project = (secret: string) => ({
      version: 1 as const,
      files: [
        { path: "main.cpp", content: '#include "sum.h"\nint main() { return sum(1, 2) == 3 ? 0 : 1; }\n', readOnly: false, hidden: false, openByDefault: true },
        { path: "sum.c", content: "int sum(int a, int b) { return 0; }\n", readOnly: false, hidden: false, openByDefault: true },
        { path: "sum.h", content: "int sum(int a, int b);\n", readOnly: true, hidden: false, openByDefault: true },
        { path: "checks.c", content: `int library_secret(void) { return ${secret}; }\n`, readOnly: false, hidden: true, openByDefault: false },
      ],
      sources: ["main.cpp", "sum.c", "checks.c"],
      includeLearnerSources: false,
      fileTree: "OPEN" as const,
    });
    const first = project("1");
    // A C/C++ library course of its own: a C++ problem belongs only in one.
    await client.course.create({ data: { id: master, academyId: ids.library, title: `C++ files ${master.slice(0, 8)}`, description: "", isVisible: true, language: "C_CPP", createdByUserId: ids.admin } });
    await client.courseModule.create({ data: { id: moduleId, courseId: master, externalKey: "m1", title: "Headers", position: 1, isVisible: true } });
    await client.lecture.create({ data: { id: lectureId, courseModuleId: moduleId, externalKey: "l1", title: "Three files", position: 1, isVisible: true } });
    await client.material.create({
      data: {
        id: added, lectureId, type: "PROGRAMMING_EXERCISE", title: "Sum in three files", position: 1, isVisible: true,
        programmingExercise: {
          create: {
            externalKey: `files-${added}`, difficulty: "EASY", language: "CPP", gradingRevision: 1,
            gradingMode: "ELICE_STDIO", inputPromptPolicy: "INCLUDE", gradingSemanticVersion: "elice-v1",
            totalTimeLimitMs: 10000, comparatorTimeLimitMs: 1000, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL",
            starterCode: starterBundleFor(first), sourceProject: first,
            solutions: { create: [{ position: 0, code: "//@cove-file sum.c\nint sum(int a, int b) { return a + b; }\n" }] },
            testCases: { create: [{ position: 1, input: "4 6\n", expectedOutput: "10", visibility: "SAMPLE" }] },
          },
        },
      },
    });
    const release = (note: string, requireChanges = true) => client.$transaction(async (tx) => {
      await lockCourseRow(tx, master);
      return publishRelease(tx, audit, { libraryCourseId: master, note, actorUserId: ids.admin, requireChanges });
    }, { timeout: 60_000 });
    await release("First", false);
    const library = new AcademyLibraryService(db, new AcademyAccessService(db, new SupportGrantResolver(db)), audit);
    const copy = (await library.adopt(identity, { academyId: ids.academy, libraryCourseId: master, title: "C++ files copy" })).id;
    const localId = (await client.librarySyncLink.findFirstOrThrow({ where: { copyCourseId: copy, nodeKey: added } })).localId!;
    const copied = await client.programmingExercise.findUniqueOrThrow({ where: { materialId: localId } });
    expect(copied.sourceProject).toEqual(first);
    expect(copied.starterCode).toBe(starterBundleFor(first));
    expect(copied.starterCode).not.toContain("library_secret");

    // The library changes a hidden file: the copy follows on the next release.
    const second = project("2");
    await client.programmingExercise.update({ where: { materialId: added }, data: { sourceProject: second, starterCode: starterBundleFor(second) } });
    await client.course.update({ where: { id: master }, data: { contentRevision: { increment: 1 } } });
    await release("Hidden check");
    expect(await jobs.drain()).toBeGreaterThanOrEqual(1);
    const updated = await client.programmingExercise.findUniqueOrThrow({ where: { materialId: localId } });
    expect(updated.sourceProject).toEqual(second);
    expect(updated.starterCode).not.toContain("library_secret");
  });

  it("carries a test lecture, its settings and its points through copy, adoption and sync", async () => {
    const master = randomUUID(), moduleId = randomUUID(), lectureId = randomUUID(), problem = randomUUID();
    await client.course.create({ data: { id: master, academyId: ids.library, title: `Test course ${master.slice(0, 8)}`, description: "", isVisible: true, createdByUserId: ids.admin } });
    await client.courseModule.create({ data: { id: moduleId, courseId: master, externalKey: "m1", title: "Exams", position: 1, isVisible: true } });
    await client.lecture.create({
      data: {
        id: lectureId, courseModuleId: moduleId, externalKey: "t1", title: "Midterm", position: 1, isVisible: true, kind: "TEST",
        test: { create: { guide: "Read carefully", testType: "SUMMATIVE", timeLimitMinutes: 45, showScoreOnFinish: true, points: { [problem]: 5000 } } },
      },
    });
    await client.material.create({
      data: {
        id: problem, lectureId, type: "PROGRAMMING_EXERCISE", title: "Add two numbers", position: 1, isVisible: true,
        programmingExercise: {
          create: {
            externalKey: `test-${problem}`, difficulty: "EASY", language: "PYTHON", gradingRevision: 1,
            gradingMode: "ELICE_STDIO", inputPromptPolicy: "INCLUDE", gradingSemanticVersion: "elice-v1",
            totalTimeLimitMs: 10000, comparatorTimeLimitMs: 1000, materialMaximumHundredths: 10000, materialScorePolicy: "PROPORTIONAL",
            starterCode: "", solutionCode: "print(sum(map(int, input().split())))",
            testCases: { create: [{ position: 1, input: "1 2\n", expectedOutput: "3", visibility: "HIDDEN" }] },
          },
        },
      },
    });

    // A plain copy (academy → library import) keeps the test and remaps its points.
    const source = await client.course.findUniqueOrThrow({ where: { id: master }, include: courseCopyInclude });
    const imported = randomUUID();
    await client.course.create({ data: { id: imported, academyId: ids.library, title: `Imported ${imported.slice(0, 8)}`, description: "", isVisible: false, createdByUserId: ids.admin } });
    await client.$transaction((tx) => copyCourseTree(tx, source, imported, "PRESERVE_VISIBILITY"));
    const importedLecture = await client.lecture.findFirstOrThrow({ where: { courseModule: { courseId: imported } }, include: { test: true, materials: { select: { id: true } } } });
    expect(importedLecture.kind).toBe("TEST");
    expect(importedLecture.test).toMatchObject({ guide: "Read carefully", testType: "SUMMATIVE", timeLimitMinutes: 45, showScoreOnFinish: true });
    expect(importedLecture.test!.points).toEqual({ [importedLecture.materials[0]!.id]: 5000 });

    const release = (note: string, requireChanges = true) => client.$transaction(async (tx) => {
      await lockCourseRow(tx, master);
      return publishRelease(tx, audit, { libraryCourseId: master, note, actorUserId: ids.admin, requireChanges });
    }, { timeout: 60_000 });
    await release("First", false);
    const library = new AcademyLibraryService(db, new AcademyAccessService(db, new SupportGrantResolver(db)), audit);
    const copy = (await library.adopt(identity, { academyId: ids.academy, libraryCourseId: master, title: "Test copy" })).id;
    const linked = async (nodeKey: string) => (await client.librarySyncLink.findFirstOrThrow({ where: { copyCourseId: copy, nodeKey } })).localId!;
    const copyLecture = await linked(lectureId);
    const copyProblem = await linked(problem);
    const adopted = await client.lecture.findUniqueOrThrow({ where: { id: copyLecture }, include: { test: true } });
    expect(adopted.kind).toBe("TEST");
    expect(adopted.test).toMatchObject({ guide: "Read carefully", timeLimitMinutes: 45, showScoreOnFinish: true });
    expect(adopted.test!.points).toEqual({ [copyProblem]: 5000 });

    // The library changes the test: the copy follows on the next release.
    await client.lectureTest.update({ where: { lectureId }, data: { timeLimitMinutes: 30, points: { [problem]: 7000 } } });
    await client.course.update({ where: { id: master }, data: { contentRevision: { increment: 1 } } });
    await release("Shorter test");
    expect(await jobs.drain()).toBeGreaterThanOrEqual(1);
    const synced = await client.lectureTest.findUniqueOrThrow({ where: { lectureId: copyLecture } });
    expect(synced.timeLimitMinutes).toBe(30);
    expect(synced.points).toEqual({ [copyProblem]: 7000 });
    expect((await client.courseSyncState.findUniqueOrThrow({ where: { courseId: copy } })).openConflictCount).toBe(0);
  });
});
