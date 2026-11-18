import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { ExplanationService } from "../explanations/explanation.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { CurriculumOutlineService } from "../learn/curriculum-outline.service.js";
import { readClassHistoryMaterials } from "../learn/curriculum-read.js";
import { effectivelyVisibleActivityWhere } from "../learn/curriculum-visibility.js";
import { lockCourseRow } from "./release.js";
import { publishRelease } from "./release-access.js";
import { deleteSyncFixture } from "./sync-fixture-cleanup.js";
import { LibrarySyncJobService } from "./sync-job.service.js";

/**
 * Archival (sync design §10) on an academy's own paths: what head office
 * removes stays hidden from students and kept for staff, cannot be shown or
 * moved again by hand, and comes back with the academy's edits and earlier
 * visibility when the library reintroduces it. Disposable PostgreSQL only.
 */
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
const createClient = (connectionString: string) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [{ emit: "event", level: "query" }],
  });

describe.skipIf(!databaseUrl)(
  "library sync archive guards (PostgreSQL)",
  () => {
    let client: ReturnType<typeof createClient>;
    let db: PrismaService;
    let statements = 0;
    let jobs: LibrarySyncJobService;
    let courses: CourseService;
    let explanations: ExplanationService;
    const audit = new AuditService();
    const ids = {
      org: randomUUID(),
      library: randomUUID(),
      academy: randomUUID(),
      admin: randomUUID(),
      lead: randomUUID(),
      classId: randomUUID(),
      master: randomUUID(),
      moduleA: randomUUID(),
      moduleB: randomUUID(),
      removed: randomUUID(),
      kept: randomUUID(),
      other: randomUUID(),
      explanation: randomUUID(),
      exercise: randomUUID(),
      keptExplanation: randomUUID(),
      otherExplanation: randomUUID(),
      testCase: randomUUID(),
      solution: randomUUID(),
    };
    const leadAuth = randomUUID();
    const identity = { authUserId: leadAuth } as SupabaseIdentity;
    let copyId = "";
    const local = async (masterId: string) =>
      (
        await client.librarySyncLink.findFirstOrThrow({
          where: { copyCourseId: copyId, nodeKey: masterId },
        })
      ).localId!;
    const publish = async (note: string) => {
      await client.course.update({
        where: { id: ids.master },
        data: { contentRevision: { increment: 1 } },
      });
      await client.$transaction(async (tx) => {
        await lockCourseRow(tx, ids.master);
        await publishRelease(tx, audit, {
          libraryCourseId: ids.master,
          note,
          actorUserId: ids.admin,
          requireChanges: true,
        });
      });
    };
    /** The removed lecture's content in the master, created again with the same keys when the library brings it back. */
    const createRemovedLecture = async (exerciseDescription: string) => {
      await client.lecture.create({
        data: {
          id: ids.removed,
          courseModuleId: ids.moduleA,
          externalKey: "removed",
          title: "Removed lecture",
          position: 1,
        },
      });
      await client.material.create({
        data: {
          id: ids.explanation,
          lectureId: ids.removed,
          type: "EXPLANATION",
          title: "Old explanation",
          position: 1,
          isVisible: true,
          explanationMaterial: { create: { body: "<p>Library text.</p>" } },
        },
      });
      await client.material.create({
        data: {
          id: ids.exercise,
          lectureId: ids.removed,
          type: "PROGRAMMING_EXERCISE",
          title: "Old problem",
          position: 2,
          isVisible: true,
          programmingExercise: {
            create: {
              externalKey: "old",
              difficulty: "EASY",
              description: exerciseDescription,
              starterCode: "",
              solutions: {
                create: [
                  {
                    syncKey: ids.solution,
                    position: 0,
                    title: "Main",
                    code: "print(1)",
                  },
                ],
              },
              testCases: {
                create: [
                  {
                    syncKey: ids.testCase,
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
    };
    const refused = { code: "CONTENT_VALIDATION_FAILED" };

    beforeAll(async () => {
      client = createClient(databaseUrl!);
      client.$on("query", () => {
        statements += 1;
      });
      db = client as unknown as PrismaService;
      const access = new AcademyAccessService(db, new SupportGrantResolver(db));
      const revocation = { revokeClass: vi.fn() } as never;
      jobs = new LibrarySyncJobService(
        db,
        new ConfigService({
          LIBRARY_SYNC_ENABLED: true,
          LIBRARY_SYNC_CONCURRENCY: 1,
        }) as never,
        audit,
        revocation,
      );
      courses = new CourseService(db, access, audit, revocation);
      explanations = new ExplanationService(
        db,
        access,
        {} as never,
        audit,
        new CurriculumOutlineService(db),
        revocation,
      );

      await client.organization.create({
        data: { id: ids.org, name: "Archive org", slug: `archive-${ids.org}` },
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
          role: "MANAGER",
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
          title: "Archive",
          description: "",
          isVisible: true,
          createdByUserId: ids.admin,
        },
      });
      await client.courseModule.createMany({
        data: [
          {
            id: ids.moduleA,
            courseId: ids.master,
            externalKey: "a",
            title: "Module A",
            position: 1,
          },
          {
            id: ids.moduleB,
            courseId: ids.master,
            externalKey: "b",
            title: "Module B",
            position: 2,
          },
        ],
      });
      await createRemovedLecture("<p>Add.</p>");
      await client.lecture.createMany({
        data: [
          {
            id: ids.kept,
            courseModuleId: ids.moduleA,
            externalKey: "kept",
            title: "Kept lecture",
            position: 2,
          },
          {
            id: ids.other,
            courseModuleId: ids.moduleB,
            externalKey: "other",
            title: "Other lecture",
            position: 1,
          },
        ],
      });
      await client.material.create({
        data: {
          id: ids.keptExplanation,
          lectureId: ids.kept,
          type: "EXPLANATION",
          title: "Kept",
          position: 1,
          isVisible: true,
          explanationMaterial: { create: { body: "<p>Kept.</p>" } },
        },
      });
      await client.material.create({
        data: {
          id: ids.otherExplanation,
          lectureId: ids.other,
          type: "EXPLANATION",
          title: "Other",
          position: 1,
          isVisible: true,
          explanationMaterial: { create: { body: "<p>Other.</p>" } },
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
          title: "Archive",
        })
      ).id;
      await client.class.create({
        data: {
          id: ids.classId,
          academyId: ids.academy,
          name: "Class",
          createdByUserId: ids.lead,
        },
      });
      await client.classCourse.create({
        data: {
          classId: ids.classId,
          courseId: copyId,
          assignedByUserId: ids.lead,
        },
      });
    });

    afterAll(async () => {
      if (client)
        await deleteSyncFixture(client as never, {
          organizationId: ids.org,
          userIds: [ids.admin, ids.lead],
        });
      await client?.$disconnect();
    });

    it("archives a removed lecture: hidden from students, kept for staff, marked in the builder", async () => {
      const versionBefore = await client.explanationMaterial.findUniqueOrThrow({
        where: { materialId: await local(ids.explanation) },
      });
      // The academy had hidden the problem before head office removed the lecture.
      await client.material.update({
        where: { id: await local(ids.exercise) },
        data: { isVisible: false },
      });
      await client.lecture.delete({ where: { id: ids.removed } });
      await publish("Removed a lecture");
      expect(await jobs.drain()).toBe(1);

      const [lecture, explanation, exercise] = await Promise.all([
        local(ids.removed),
        local(ids.explanation),
        local(ids.exercise),
      ]);
      const links = await client.librarySyncLink.findMany({
        where: {
          copyCourseId: copyId,
          localId: { in: [lecture, explanation, exercise] },
        },
      });
      expect(links.map((link) => link.state)).toEqual([
        "ARCHIVED",
        "ARCHIVED",
        "ARCHIVED",
      ]);
      expect(
        Object.fromEntries(
          links.map((link) => [link.localId, link.archivedVisibility]),
        ),
      ).toEqual({ [lecture]: true, [explanation]: true, [exercise]: false });
      expect(
        (await client.lecture.findUniqueOrThrow({ where: { id: lecture } }))
          .isVisible,
      ).toBe(false);
      expect(
        (
          await client.explanationMaterial.findUniqueOrThrow({
            where: { materialId: explanation },
          })
        ).revision,
      ).toBeGreaterThan(versionBefore.revision);

      // Students reach nothing in it.
      expect(
        await client.material.count({
          where: {
            AND: [
              { id: { in: [explanation, exercise] } },
              effectivelyVisibleActivityWhere(ids.academy),
            ],
          },
        }),
      ).toBe(0);
      // Staff keep the students' history.
      const history = (
        await readClassHistoryMaterials(db, ids.academy, ids.classId)
      ).map((row) => row.id);
      expect(history).toEqual(expect.arrayContaining([explanation, exercise]));

      const before = statements;
      const outline = await courses.getOutline(identity, {
        academyId: ids.academy,
        courseId: copyId,
      });
      const used = statements - before;
      process.stdout.write(
        `builder outline statements (linked copy): ${used}\n`,
      );
      // 14 without the archived-row read (measured 2026-11-18): it costs the one statement design §19 allows.
      expect(used).toBeLessThanOrEqual(15);
      expect(outline.course.provenance?.linked?.archivedIds).toEqual(
        expect.arrayContaining([lecture, explanation, exercise]),
      );
    });

    it("refuses to show or move archived content again, and keeps it hidden through show-all", async () => {
      const [lecture, explanation, exercise, kept, keptExplanation] =
        await Promise.all([
          local(ids.removed),
          local(ids.explanation),
          local(ids.exercise),
          local(ids.kept),
          local(ids.keptExplanation),
        ]);
      const course = { academyId: ids.academy, courseId: copyId };

      await expect(
        courses.updateLecture(identity, {
          ...course,
          lectureId: lecture,
          isVisible: true,
        }),
      ).rejects.toMatchObject(refused);
      await expect(
        courses.setExerciseVisibility(identity, {
          ...course,
          lectureId: lecture,
          materialId: exercise,
          isVisible: true,
        }),
      ).rejects.toMatchObject(refused);
      await expect(
        explanations.mutate(identity, {
          ...course,
          lectureId: lecture,
          materialId: explanation,
          isVisible: true,
        }),
      ).rejects.toMatchObject(refused);
      // Out of the archived lecture, and into it.
      await expect(
        courses.moveExercise(identity, {
          ...course,
          materialId: explanation,
          fromLectureId: lecture,
          toLectureId: kept,
          toIndex: 0,
        }),
      ).rejects.toMatchObject(refused);
      await expect(
        courses.moveExercise(identity, {
          ...course,
          materialId: keptExplanation,
          fromLectureId: kept,
          toLectureId: lecture,
          toIndex: 0,
        }),
      ).rejects.toMatchObject(refused);

      // Show all content: everything else is shown, the archived lecture is not.
      await client.material.update({
        where: { id: keptExplanation },
        data: { isVisible: false },
      });
      await courses.setContentVisibility(identity, {
        ...course,
        isVisible: true,
      });
      expect(
        (
          await client.material.findUniqueOrThrow({
            where: { id: keptExplanation },
          })
        ).isVisible,
      ).toBe(true);
      expect(
        (await client.lecture.findUniqueOrThrow({ where: { id: lecture } }))
          .isVisible,
      ).toBe(false);
      // Inside the archived lecture, own flags are left as they were.
      expect(
        (await client.material.findUniqueOrThrow({ where: { id: exercise } }))
          .isVisible,
      ).toBe(false);
      expect(
        await client.material.count({
          where: {
            AND: [
              { id: { in: [explanation, exercise] } },
              effectivelyVisibleActivityWhere(ids.academy),
            ],
          },
        }),
      ).toBe(0);

      // Hiding and editing stay open to staff.
      await expect(
        courses.updateLecture(identity, {
          ...course,
          lectureId: lecture,
          isVisible: false,
        }),
      ).resolves.toBeDefined();
      const { revision } = await client.explanationMaterial.findUniqueOrThrow({
        where: { materialId: explanation },
      });
      await explanations.save(identity, {
        ...course,
        lectureId: lecture,
        materialId: explanation,
        expectedRevision: revision,
        title: "Old explanation",
        body: "<p>Academy text.</p>",
        sideBody: null,
        isVisible: false,
      });
      // Saving it as shown is the same republication, refused.
      await expect(
        explanations.save(identity, {
          ...course,
          lectureId: lecture,
          materialId: explanation,
          expectedRevision: revision + 1,
          title: "Old explanation",
          body: "<p>Academy text.</p>",
          sideBody: null,
          isVisible: true,
        }),
      ).rejects.toMatchObject(refused);
      expect(
        (
          await client.explanationMaterial.findUniqueOrThrow({
            where: { materialId: explanation },
          })
        ).body,
      ).toBe("<p>Academy text.</p>");
    });

    it("restores reintroduced content with the academy's edits and its earlier visibility", async () => {
      const versionBefore = await client.explanationMaterial.findUniqueOrThrow({
        where: { materialId: await local(ids.explanation) },
      });
      await createRemovedLecture("<p>Add two numbers.</p>");
      await publish("Brought the lecture back");
      expect(await jobs.drain()).toBe(1);

      const [lecture, explanation, exercise] = await Promise.all([
        local(ids.removed),
        local(ids.explanation),
        local(ids.exercise),
      ]);
      const links = await client.librarySyncLink.findMany({
        where: {
          copyCourseId: copyId,
          localId: { in: [lecture, explanation, exercise] },
        },
      });
      expect(links.map((link) => link.state)).toEqual([
        "LINKED",
        "LINKED",
        "LINKED",
      ]);
      // The visibility each had before archival: the academy's hidden problem stays hidden.
      expect(
        (await client.lecture.findUniqueOrThrow({ where: { id: lecture } }))
          .isVisible,
      ).toBe(true);
      expect(
        (
          await client.material.findUniqueOrThrow({
            where: { id: explanation },
          })
        ).isVisible,
      ).toBe(true);
      expect(
        (await client.material.findUniqueOrThrow({ where: { id: exercise } }))
          .isVisible,
      ).toBe(false);
      expect(
        (
          await client.explanationMaterial.findUniqueOrThrow({
            where: { materialId: explanation },
          })
        ).revision,
      ).toBeGreaterThan(versionBefore.revision);
      // The academy's edit made while archived stays; the library's own change applies.
      expect(
        (
          await client.explanationMaterial.findUniqueOrThrow({
            where: { materialId: explanation },
          })
        ).body,
      ).toBe("<p>Academy text.</p>");
      expect(
        (
          await client.programmingExercise.findUniqueOrThrow({
            where: { materialId: exercise },
          })
        ).description,
      ).toBe("<p>Add two numbers.</p>");
      expect(
        await client.librarySyncConflict.count({
          where: { copyCourseId: copyId, status: "OPEN" },
        }),
      ).toBe(0);

      // Restored content is ordinary again.
      await expect(
        courses.setExerciseVisibility(identity, {
          academyId: ids.academy,
          courseId: copyId,
          lectureId: lecture,
          materialId: exercise,
          isVisible: true,
        }),
      ).resolves.toBeDefined();
    });
  },
);
