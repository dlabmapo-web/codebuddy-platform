import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { AcademyLibrarySyncService } from "./academy-sync.service.js";
import { lockCourseRow } from "./release.js";
import { publishRelease } from "./release-access.js";
import { deleteSyncFixture } from "./sync-fixture-cleanup.js";
import { LibrarySyncJobService } from "./sync-job.service.js";
import { rewriteSiblings } from "./bulk.js";

/**
 * Guards a sync must keep, each reproduced from a review finding: a manual
 * solution merge keeps its structure, a map removal waits for the files it
 * would drop, a referenced PDF is not removed, a title-only change re-versions
 * the editor's row, a merge stays within the editor's limits, and the Library
 * updates page stays within its statement budget. Disposable PostgreSQL only
 * (packages/api/scripts/test-library-sync.sh).
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

const createClient = (connectionString: string) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [{ emit: "event", level: "query" }],
  });

describe.skipIf(!databaseUrl)("library course sync guards (PostgreSQL)", () => {
  let client: ReturnType<typeof createClient>;
  let db: PrismaService;
  let statements = 0;
  let jobs: LibrarySyncJobService;
  let decisions: AcademyLibrarySyncService;
  const audit = new AuditService();
  const ids = {
    org: randomUUID(),
    library: randomUUID(),
    academy: randomUUID(),
    admin: randomUUID(),
    lead: randomUUID(),
    master: randomUUID(),
    module: randomUUID(),
    lecture: randomUUID(),
    explanation: randomUUID(),
    exercise: randomUUID(),
    turtle: randomUUID(),
    pdf: randomUUID(),
    pdfAsset: randomUUID(),
    files: randomUUID(),
  };
  const leadAuth = randomUUID();
  const identity = { authUserId: leadAuth } as SupabaseIdentity;
  const academy = { academyId: ids.academy };
  let copyId = "";

  const publish = async (note: string) => {
    await client.course.update({
      where: { id: ids.master },
      data: { contentRevision: { increment: 1 } },
    });
    return client.$transaction(
      async (tx) => {
        await lockCourseRow(tx, ids.master);
        return publishRelease(tx, audit, {
          libraryCourseId: ids.master,
          note,
          actorUserId: ids.admin,
          requireChanges: true,
        });
      },
      { timeout: 60_000 },
    );
  };
  const local = async (masterId: string) =>
    (
      await client.librarySyncLink.findFirstOrThrow({
        where: { copyCourseId: copyId, nodeKey: masterId },
      })
    ).localId!;
  const openConflicts = () =>
    client.librarySyncConflict.findMany({
      where: { copyCourseId: copyId, status: "OPEN" },
    });

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
    const access = new AcademyAccessService(db, new SupportGrantResolver(db));
    decisions = new AcademyLibrarySyncService(db, access, audit, {
      revokeClass: vi.fn(),
    } as never);

    await client.organization.create({
      data: { id: ids.org, name: "Guards org", slug: `guards-${ids.org}` },
    });
    await client.user.createMany({
      data: [
        {
          id: ids.admin,
          authUserId: randomUUID(),
          status: "ACTIVE",
          platformRole: "ADMIN",
        },
        {
          id: ids.lead,
          authUserId: leadAuth,
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
        title: "Guards",
        description: "",
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
    await client.pdfAsset.create({
      data: {
        id: ids.pdfAsset,
        academyId: ids.library,
        courseId: ids.master,
        lectureId: ids.lecture,
        uploaderUserId: ids.admin,
        originalFilename: "notes.pdf",
        byteSize: 10,
        checksumSha256: "x",
        state: "READY",
        consumedAt: new Date(),
        objectKey: `p/${ids.pdfAsset}`,
      },
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
      isVisible: true,
    });
    await client.material.create({
      data: {
        ...material(ids.explanation, "EXPLANATION", "Explanation", 1),
        explanationMaterial: { create: { body: "<p>Text.</p>" } },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.exercise, "PROGRAMMING_EXERCISE", "Sum", 2),
        programmingExercise: {
          create: {
            externalKey: "p1",
            difficulty: "EASY",
            description: "<p>Add.</p>",
            starterCode: "",
            solutions: {
              create: [{ position: 0, title: "Main", code: "print(1)" }],
            },
            testCases: {
              create: [
                {
                  position: 1,
                  input: "1",
                  expectedOutput: "1",
                  visibility: "SAMPLE",
                },
              ],
            },
          },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.turtle, "TURTLE_EXERCISE", "Square", 3),
        manualMaterial: {
          create: {
            files: { "main.py": "import turtle\n" },
            solutionFiles: { "main.py": "import turtle\nturtle.forward(1)\n" },
          },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.pdf, "PDF_DOCUMENT", "Notes", 4),
        pdfDocument: {
          create: { assetId: ids.pdfAsset, placement: "SUPPLEMENTARY" },
        },
      },
    });
    await client.material.create({
      data: {
        ...material(ids.files, "TURTLE_EXERCISE", "Many files", 5),
        manualMaterial: { create: { files: { "main.py": "import turtle\n" } } },
      },
    });

    await client.$transaction(async (tx) => {
      await lockCourseRow(tx, ids.master);
      await publishRelease(tx, audit, {
        libraryCourseId: ids.master,
        note: "First",
        actorUserId: ids.admin,
        requireChanges: false,
      });
    });
    copyId = (
      await new AcademyLibraryService(db, access, audit).adopt(identity, {
        academyId: ids.academy,
        libraryCourseId: ids.master,
        title: "Guards",
      })
    ).id;
  });

  afterAll(async () => {
    if (client)
      await deleteSyncFixture(client as never, {
        organizationId: ids.org,
        userIds: [ids.admin, ids.lead],
      });
    await client?.$disconnect();
  });

  it("merges a solution by hand into its code, keeping the solution's title", async () => {
    const exercise = await local(ids.exercise);
    await client.programmingExerciseSolution.updateMany({
      where: { materialId: exercise },
      data: { code: "print('academy')" },
    });
    await client.programmingExerciseSolution.updateMany({
      where: { materialId: ids.exercise },
      data: { code: "print('library')" },
    });
    await publish("Solution");
    expect(await jobs.drain()).toBe(1);

    const open = (
      await decisions.updates(identity, { ...academy, courseId: copyId })
    ).conflicts.find((row) => row.unitKey.startsWith("exercise.solution:"));
    expect(open?.actions).toContain("MANUAL");
    const detail = await decisions.conflict(identity, {
      ...academy,
      conflictId: open!.id,
    });
    expect(detail.ours).toEqual({
      kind: "code",
      value: "print('academy')",
      caption: "Main",
    });
    expect(detail.theirs).toEqual({
      kind: "code",
      value: "print('library')",
      caption: "Main",
    });

    await decisions.resolve(identity, {
      ...academy,
      conflictId: open!.id,
      action: "MANUAL",
      value: "print('merged')",
      expectedOursHash: detail.expectedOursHash,
      expectedTheirsHash: detail.expectedTheirsHash,
      requestKey: randomUUID(),
    });
    const solutions = await client.programmingExerciseSolution.findMany({
      where: { materialId: exercise },
    });
    expect(solutions.map((row) => [row.title, row.code])).toEqual([
      ["Main", "print('merged')"],
    ]);
    expect(
      (
        await client.programmingExercise.findUniqueOrThrow({
          where: { materialId: exercise },
        })
      ).solutionCode,
    ).toBe("print('merged')");
  });

  it("keeps an edited solution file while the library's removal of the map waits for the decision", async () => {
    const turtle = await local(ids.turtle);
    await client.manualMaterial.update({
      where: { materialId: turtle },
      data: { solutionFiles: { "main.py": "academy solution\n" } },
    });
    await client.manualMaterial.update({
      where: { materialId: ids.turtle },
      data: { solutionFiles: Prisma.DbNull },
    });
    await publish("No solution files");
    expect(await jobs.drain()).toBe(1);

    expect(
      (
        await client.manualMaterial.findUniqueOrThrow({
          where: { materialId: turtle },
        })
      ).solutionFiles,
    ).toEqual({ "main.py": "academy solution\n" });
    const open = (await openConflicts()).find(
      (row) => row.unitKey === "manual.solutionFile:main.py",
    );
    expect(open?.kind).toBe("REMOVED_UPSTREAM_EDITED_LOCALLY");

    // Accepting the library's removal lets the map's removal apply.
    const detail = await decisions.conflict(identity, {
      ...academy,
      conflictId: open!.id,
    });
    await decisions.resolve(identity, {
      ...academy,
      conflictId: open!.id,
      action: "ACCEPT_LIBRARY",
      expectedOursHash: detail.expectedOursHash,
      expectedTheirsHash: detail.expectedTheirsHash,
      requestKey: randomUUID(),
    });
    expect(
      (
        await client.manualMaterial.findUniqueOrThrow({
          where: { materialId: turtle },
        })
      ).solutionFiles,
    ).toBeNull();
  });

  it("does not remove a PDF the academy's own exercise uses as its reference", async () => {
    const pdf = await local(ids.pdf);
    const ownExercise = randomUUID();
    await client.material.create({
      data: {
        id: ownExercise,
        lectureId: await local(ids.lecture),
        type: "PROGRAMMING_EXERCISE",
        title: "Academy problem",
        position: 10,
        isVisible: true,
        programmingExercise: {
          create: {
            externalKey: `own-${ownExercise}`,
            difficulty: "EASY",
            description: "<p>Read the notes.</p>",
            starterCode: "",
            referencePdfMaterialId: pdf,
          },
        },
      },
    });
    await client.material.delete({ where: { id: ids.pdf } });
    await publish("Removed notes");
    expect(await jobs.drain()).toBe(1);

    expect(
      (await client.material.findUniqueOrThrow({ where: { id: pdf } }))
        .isVisible,
    ).toBe(true);
    expect(
      (
        await client.librarySyncLink.findFirstOrThrow({
          where: { copyCourseId: copyId, nodeKey: ids.pdf },
        })
      ).state,
    ).toBe("LINKED");
    const open = (await openConflicts()).find((row) => row.nodeKey === ids.pdf);
    expect(open).toMatchObject({
      unitKey: "@presence",
      kind: "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT",
    });
    expect((open!.detail as { message?: string }).message).toMatch(/reference/);
  });

  it("re-versions the editor's row when only a material's title changes", async () => {
    const explanation = await local(ids.explanation);
    const exercise = await local(ids.exercise);
    const revision = (
      await client.explanationMaterial.findUniqueOrThrow({
        where: { materialId: explanation },
      })
    ).revision;
    const updatedAt = (
      await client.programmingExercise.findUniqueOrThrow({
        where: { materialId: exercise },
      })
    ).updatedAt;
    await client.material.update({
      where: { id: ids.explanation },
      data: { title: "Renamed explanation" },
    });
    await client.material.update({
      where: { id: ids.exercise },
      data: { title: "Renamed problem" },
    });
    await publish("Titles");
    expect(await jobs.drain()).toBe(1);

    expect(
      (await client.material.findUniqueOrThrow({ where: { id: explanation } }))
        .title,
    ).toBe("Renamed explanation");
    // An editor that loaded revision `revision` is now refused instead of writing the old title back.
    expect(
      (
        await client.explanationMaterial.findUniqueOrThrow({
          where: { materialId: explanation },
        })
      ).revision,
    ).toBe(revision + 1);
    expect(
      (
        await client.programmingExercise.findUniqueOrThrow({
          where: { materialId: exercise },
        })
      ).updatedAt.getTime(),
    ).toBeGreaterThan(updatedAt.getTime());
  });

  it("holds back a merge that would exceed the editor's file limit", async () => {
    const files = await local(ids.files);
    const set = (prefix: string) =>
      Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          `${prefix}${index}.py`,
          "pass\n",
        ]),
      );
    await client.manualMaterial.update({
      where: { materialId: files },
      data: { files: { "main.py": "import turtle\n", ...set("academy_") } },
    });
    await client.manualMaterial.update({
      where: { materialId: ids.files },
      data: { files: { "main.py": "import turtle\n", ...set("library_") } },
    });
    await publish("Library files");
    expect(await jobs.drain()).toBe(1);

    // Each side alone has 41 files; together they would have 81 of at most 64.
    const kept = (
      await client.manualMaterial.findUniqueOrThrow({
        where: { materialId: files },
      })
    ).files as Record<string, string>;
    expect(Object.keys(kept)).toHaveLength(41);
    expect(Object.keys(kept).some((path) => path.startsWith("library_"))).toBe(
      false,
    );
    const held = (await openConflicts()).filter(
      (row) => row.nodeKey === ids.files,
    );
    expect(held.length).toBe(40);
    expect(new Set(held.map((row) => row.kind))).toEqual(
      new Set(["INVALID_RESULT"]),
    );
    expect((held[0]!.detail as { message?: string }).message).toMatch(
      /64 files/,
    );
  });

  it("reads the review page in three statements, access included", async () => {
    const before = statements;
    const page = await decisions.updates(identity, {
      ...academy,
      courseId: copyId,
    });
    const used = statements - before;
    process.stdout.write(`library updates page statements: ${used}\n`);
    expect(used).toBe(3);
    expect(page.sync).toMatchObject({
      appliedReleaseNumber: 6,
      latestReleaseNumber: 6,
      chip: "NEEDS_REVIEW",
    });
    expect(page.conflicts.length).toBe(page.sync!.openConflictCount);
    expect(page.conflicts.find((row) => row.nodeKey === ids.pdf)?.path).toEqual(
      ["Module", "Lecture", "Notes"],
    );
    expect(page.runs).toEqual([]);

    // Another academy's staff read nothing of this copy.
    await expect(
      decisions.updates(identity, { academyId: ids.library, courseId: copyId }),
    ).rejects.toBeTruthy();
  });

  it("shows live PDF dependents and refuses removal until references are explicitly removed", async () => {
    const conflict = (await openConflicts()).find(
      (row) => row.nodeKey === ids.pdf,
    )!;
    const detail = await decisions.conflict(identity, {
      ...academy,
      conflictId: conflict.id,
    });
    expect(detail.reason).toBe("REFERENCED_PDF");
    expect(detail.dependents).toContainEqual([
      "Module",
      "Lecture",
      "Academy problem",
    ]);
    const input = {
      ...academy,
      conflictId: conflict.id,
      action: "ACCEPT_LIBRARY" as const,
      expectedOursHash: detail.expectedOursHash,
      expectedTheirsHash: detail.expectedTheirsHash,
      requestKey: randomUUID(),
    };
    await expect(decisions.resolve(identity, input)).rejects.toMatchObject({
      code: "CONTENT_VALIDATION_FAILED",
    });
    await client.programmingExercise.updateMany({
      where: { referencePdfMaterialId: await local(ids.pdf) },
      data: { referencePdfMaterialId: null },
    });
    await expect(decisions.resolve(identity, input)).rejects.toMatchObject({
      code: "CONTENT_EDIT_CONFLICT",
    });
    const fresh = await decisions.conflict(identity, {
      ...academy,
      conflictId: conflict.id,
    });
    await decisions.resolve(identity, {
      ...input,
      expectedOursHash: fresh.expectedOursHash,
      requestKey: randomUUID(),
    });
    expect(
      (
        await client.librarySyncLink.findFirstOrThrow({
          where: { copyCourseId: copyId, nodeKey: ids.pdf },
        })
      ).state,
    ).toBe("ARCHIVED");
  });

  it("retains a structural conflict's original base, rejects a stale decision and applies the chosen library order", async () => {
    const copyLecture = await local(ids.lecture);
    const explanation = await local(ids.explanation),
      exercise = await local(ids.exercise),
      turtle = await local(ids.turtle);
    for (const [lectureId, first] of [
      [copyLecture, exercise],
      [ids.lecture, ids.turtle],
    ]) {
      const rows = await client.material.findMany({
        where: { lectureId },
        orderBy: { position: "asc" },
        select: { id: true },
      });
      const order = [
        first!,
        ...rows.map((row) => row.id).filter((id) => id !== first),
      ];
      await client.$transaction((tx) =>
        rewriteSiblings(
          tx,
          "materials",
          "lecture_id",
          order.map((id, index) => ({
            id,
            parentId: lectureId!,
            position: index + 1,
          })),
        ),
      );
    }
    await publish("Different reorders");
    await jobs.drain();
    const conflict = await client.librarySyncConflict.findFirstOrThrow({
      where: {
        copyCourseId: copyId,
        nodeKey: ids.lecture,
        unitKey: "@order",
        status: "OPEN",
      },
    });
    const first = await decisions.conflict(identity, {
      ...academy,
      conflictId: conflict.id,
    });
    expect(first.ours.value).toEqual(
      expect.arrayContaining([expect.stringContaining("Renamed problem")]),
    );
    const base = await client.librarySyncBase.findUniqueOrThrow({
      where: {
        copyCourseId_nodeKey_unitKey: {
          copyCourseId: copyId,
          nodeKey: ids.lecture,
          unitKey: "@order",
        },
      },
    });
    await client.course.update({
      where: { id: ids.master },
      data: { description: "Unrelated metadata" },
    });
    await publish("Unrelated update");
    await jobs.drain();
    expect(
      (
        await client.librarySyncBase.findUniqueOrThrow({
          where: {
            copyCourseId_nodeKey_unitKey: {
              copyCourseId: copyId,
              nodeKey: ids.lecture,
              unitKey: "@order",
            },
          },
        })
      ).baseHash,
    ).toBe(base.baseHash);
    await client.material.update({
      where: { id: explanation },
      data: { title: "Academy renamed again" },
    });
    await expect(
      decisions.resolve(identity, {
        ...academy,
        conflictId: conflict.id,
        action: "ACCEPT_LIBRARY",
        expectedOursHash: first.expectedOursHash,
        expectedTheirsHash: first.expectedTheirsHash,
        requestKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_EDIT_CONFLICT" });
    const fresh = await decisions.conflict(identity, {
      ...academy,
      conflictId: conflict.id,
    });
    await decisions.resolve(identity, {
      ...academy,
      conflictId: conflict.id,
      action: "ACCEPT_LIBRARY",
      expectedOursHash: fresh.expectedOursHash,
      expectedTheirsHash: fresh.expectedTheirsHash,
      requestKey: randomUUID(),
    });
    const rows = await client.material.findMany({
      where: {
        lectureId: copyLecture,
        id: { in: [explanation, exercise, turtle] },
      },
      orderBy: { position: "asc" },
    });
    expect(rows.map((row) => row.id)).toEqual([turtle, explanation, exercise]);
    expect(
      (
        await client.librarySyncConflict.findUniqueOrThrow({
          where: { id: conflict.id },
        })
      ).status,
    ).toBe("RESOLVED");
  });
});
