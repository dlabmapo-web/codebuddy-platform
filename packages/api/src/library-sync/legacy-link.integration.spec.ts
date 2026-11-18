import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AuditService } from "../academies/audit.service.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import {
  copyCourseTree,
  courseCopyInclude,
} from "../content/library/course-tree-copy.js";
import { AcademyLibrarySyncService } from "./academy-sync.service.js";
import { LegacyLibraryLinkService } from "./legacy-link.service.js";
import { LibrarySyncJobService } from "./sync-job.service.js";
import { LibraryReleaseService } from "./library-release.service.js";
import { lockCourseRow } from "./release.js";
import { publishRelease } from "./release-access.js";
import { deleteSyncFixture } from "./sync-fixture-cleanup.js";

const createClient = (connectionString: string) =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: [{ emit: "event", level: "query" }],
  });
const url = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!url)(
  "released previews and conservative legacy linking",
  () => {
    let db: ReturnType<typeof createClient>;
    let api: PrismaService;
    let library: AcademyLibraryService;
    let legacy: LegacyLibraryLinkService;
    let decisions: AcademyLibrarySyncService;
    let jobs: LibrarySyncJobService;
    let releases: LibraryReleaseService;
    const audit = new AuditService();
    const org = randomUUID(),
      lib = randomUUID(),
      academy = randomUUID(),
      admin = randomUUID(),
      lead = randomUUID(),
      auth = randomUUID(),
      adminAuth = randomUUID();
    const master = randomUUID(),
      copy = randomUUID(),
      module = randomUUID(),
      lecture = randomUUID(),
      explanation = randomUUID(),
      exercise = randomUUID();
    const identity = { authUserId: auth } as SupabaseIdentity,
      operator = { authUserId: adminAuth } as SupabaseIdentity;
    let copyModule: string,
      copyLecture: string,
      copyExplanation: string,
      copyExercise: string;
    let queries = 0;
    const publish = () =>
      db.$transaction(async (tx) => {
        await lockCourseRow(tx, master);
        return publishRelease(tx, audit, {
          libraryCourseId: master,
          note: "Release",
          actorUserId: admin,
          requireChanges: false,
        });
      });
    const match = async (nodeKey: string, localId: string | null) => {
      const report = await legacy.unmatched(identity, {
        academyId: academy,
        courseId: copy,
      });
      const decision = {
        academyId: academy,
        courseId: copy,
        nodeKey,
        localId,
        expectedHash: report.hash,
      };
      await legacy.resolveLink(identity, decision);
      await jobs.drain();
      // A transport retry returns the recorded result, even after the worker ran.
      await legacy.resolveLink(identity, decision);
    };
    beforeAll(async () => {
      db = createClient(url!);
      db.$on("query", () => queries++);
      api = db as unknown as PrismaService;
      const access = new AcademyAccessService(
        api,
        new SupportGrantResolver(api),
      );
      const platform = new PlatformAccessService(api);
      jobs = new LibrarySyncJobService(
        api,
        new ConfigService({
          LIBRARY_SYNC_ENABLED: true,
          LIBRARY_SYNC_CONCURRENCY: 1,
        }) as never,
        audit,
        { revokeClass: vi.fn() } as never,
      );
      library = new AcademyLibraryService(api, access, audit);
      releases = new LibraryReleaseService(api, platform, audit, jobs);
      legacy = new LegacyLibraryLinkService(api, platform, access, audit, jobs);
      vi.spyOn(jobs, "requestDrain").mockImplementation(() => {});
      decisions = new AcademyLibrarySyncService(api, access, audit, {
        revokeClass: vi.fn(),
      } as never);
      await db.organization.create({
        data: { id: org, name: "Legacy", slug: "legacy-" + org },
      });
      await db.user.createMany({
        data: [
          {
            id: admin,
            authUserId: adminAuth,
            status: "ACTIVE",
            platformRole: "ADMIN",
          },
          {
            id: lead,
            authUserId: auth,
            status: "ACTIVE",
            platformRole: "USER",
          },
        ],
      });
      await db.academy.createMany({
        data: [
          {
            id: lib,
            organizationId: org,
            kind: "LIBRARY",
            name: "Library",
            slug: "lib-" + lib,
          },
          {
            id: academy,
            organizationId: org,
            kind: "ACADEMY",
            name: "Academy",
            slug: "academy-" + academy,
          },
        ],
      });
      await db.academyMembership.create({
        data: {
          academyId: academy,
          userId: lead,
          role: "TEAM_LEAD",
          status: "ACTIVE",
        },
      });
      await db.academyFeatureFlag.create({
        data: {
          academyId: academy,
          feature: "LIBRARY_COURSE_SYNC",
          isEnabled: true,
        },
      });
      await db.course.create({
        data: {
          id: master,
          academyId: lib,
          title: "Published title",
          description: "Original",
          createdByUserId: admin,
          isVisible: true,
        },
      });
      await db.courseModule.create({
        data: {
          id: module,
          courseId: master,
          externalKey: "m",
          title: "Module",
          position: 1,
          isVisible: true,
        },
      });
      await db.lecture.create({
        data: {
          id: lecture,
          courseModuleId: module,
          externalKey: "l",
          title: "Lecture",
          position: 1,
          isVisible: true,
        },
      });
      await db.material.create({
        data: {
          id: explanation,
          lectureId: lecture,
          type: "EXPLANATION",
          title: "Explanation",
          position: 1,
          isVisible: true,
          explanationMaterial: { create: { body: "<p>Original</p>" } },
        },
      });
      await db.material.create({
        data: {
          id: exercise,
          lectureId: lecture,
          type: "PROGRAMMING_EXERCISE",
          title: "Problem",
          position: 2,
          isVisible: true,
          programmingExercise: {
            create: {
              externalKey: "p",
              difficulty: "EASY",
              description: "<p>Library instructions</p>",
              testCases: {
                create: [
                  {
                    position: 1,
                    input: "1",
                    expectedOutput: "2",
                    visibility: "SAMPLE",
                  },
                ],
              },
            },
          },
        },
      });
      const source = await db.course.findUniqueOrThrow({
        where: { id: master },
        include: courseCopyInclude,
      });
      await db.$transaction(async (tx) => {
        await tx.course.create({
          data: {
            id: copy,
            academyId: academy,
            title: "Our title",
            description: source.description,
            createdByUserId: lead,
            isVisible: true,
            sourceCourseId: master,
            sourceContentRevision: source.contentRevision,
            baselineRevision: 1,
          },
        });
        await copyCourseTree(tx, source, copy, "ACADEMY_ADOPTION");
        await audit.write(tx, {
          actorUserId: lead,
          academyId: academy,
          action: "content.course.adopted_from_library",
          targetType: "Course",
          targetId: copy,
          after: { sourceCourseId: master },
        });
      });
      const local = await db.course.findUniqueOrThrow({
        where: { id: copy },
        include: courseCopyInclude,
      });
      copyModule = local.modules[0]!.id;
      copyLecture = local.modules[0]!.lectures[0]!.id;
      copyExplanation = local.modules[0]!.lectures[0]!.materials.find(
        (m) => m.type === "EXPLANATION",
      )!.id;
      copyExercise = local.modules[0]!.lectures[0]!.materials.find(
        (m) => m.type === "PROGRAMMING_EXERCISE",
      )!.id;
      await db.programmingExercise.update({
        where: { materialId: copyExercise },
        data: { description: "<p>Academy instructions</p>" },
      });
      // The historical copier predated sync keys: equal positions did not
      // establish correspondence. Give the local case an independent key.
      await db.exerciseTestCase.updateMany({
        where: { exerciseMaterialId: copyExercise },
        data: { syncKey: randomUUID() },
      });
      await db.exerciseTestCase.updateMany({
        where: { exerciseMaterialId: exercise },
        data: { expectedOutput: "3" },
      });
      await db.course.update({
        where: { id: master },
        data: { contentRevision: { increment: 1 } },
      });
      await publish();
    });
    afterAll(async () => {
      if (db) {
        await deleteSyncFixture(db, {
          organizationId: org,
          userIds: [admin, lead],
        });
        await db.$disconnect();
      }
    });

    it("records actual adoption timestamp behavior without assuming equality", async () => {
      const [c, m, a] = await Promise.all([
        db.course.findUniqueOrThrow({ where: { id: copy } }),
        db.courseModule.findUniqueOrThrow({ where: { id: copyModule } }),
        db.auditLog.findFirstOrThrow({
          where: {
            targetId: copy,
            action: "content.course.adopted_from_library",
          },
        }),
      ]);
      expect(m.createdAt.getTime()).toBeGreaterThanOrEqual(
        c.createdAt.getTime(),
      );
      process.stdout.write(
        `legacy timestamp experiment: course=${c.createdAt.toISOString()} module=${m.createdAt.toISOString()} audit=${a.createdAt.toISOString()} (not used as identity proof)\n`,
      );
    });
    it("lists and previews the published release without reading working-tree edits or private definitions", async () => {
      await db.course.update({
        where: { id: master },
        data: {
          title: "Unpublished title",
          description: "Unpublished description",
          contentRevision: { increment: 1 },
        },
      });
      await db.material.create({
        data: {
          lectureId: lecture,
          type: "EXPLANATION",
          title: "Unpublished material",
          position: 3,
          explanationMaterial: { create: { body: "<p>Secret draft</p>" } },
        },
      });
      let before = queries;
      const list = await library.available(identity, { academyId: academy });
      const used = queries - before;
      expect(list.courses[0]).toMatchObject({
        title: "Published title",
        description: "Original",
        exerciseCount: 1,
      });
      const tree = await library.preview(identity, {
        academyId: academy,
        libraryCourseId: master,
      });
      expect(tree.course.title).toBe("Published title");
      expect(tree.modules[0]!.lectures[0]!.materials).toHaveLength(2);
      expect(JSON.stringify(tree)).not.toContain("expectedOutput");
      expect(JSON.stringify(tree)).not.toContain("Secret draft");
      expect(used).toBeLessThanOrEqual(4);
      process.stdout.write(`released library list statements: ${used}\n`);
      const releaseStart = queries;
      const history = await releases.releases(operator, { courseId: master });
      const releaseReads = queries - releaseStart;
      process.stdout.write(`release history statements: ${releaseReads}\n`);
      expect(releaseReads).toBeLessThanOrEqual(6);
      expect(history.releases[0]!.number).toBe(1);
    });
    it("enforces platform authority and refuses a stale migration report", async () => {
      await expect(
        legacy.report(identity, { courseId: master }),
      ).rejects.toBeDefined();
      await expect(
        legacy.link(operator, {
          courseId: master,
          copyCourseId: copy,
          expectedHash: "stale",
        }),
      ).rejects.toMatchObject({ code: "CONTENT_EDIT_CONFLICT" });
      const before = queries;
      const preview = await legacy.preview(operator, { copyCourseId: copy });
      const used = queries - before;
      process.stdout.write(`legacy linking preview statements: ${used}\n`);
      expect(used).toBeLessThanOrEqual(7);
      expect(preview.nodeCount).toBe(4);
      const report = await legacy.report(operator, { courseId: master });
      expect(JSON.stringify(report)).not.toContain("Academy instructions");
      await legacy.link(operator, {
        courseId: master,
        copyCourseId: copy,
        expectedHash: preview.hash,
      });
      await jobs.drain();
      expect(
        await db.material.count({ where: { lectureId: copyLecture } }),
      ).toBe(2);
      expect(
        (
          await legacy.unmatched(identity, {
            academyId: academy,
            courseId: copy,
          })
        ).nodes,
      ).toHaveLength(4);
    });
    it("keeps ambiguous nodes quarantined across unrelated releases and rejects stale manual identity decisions", async () => {
      const before = await legacy.unmatched(identity, {
        academyId: academy,
        courseId: copy,
      });
      await db.material.update({
        where: { id: copyExplanation },
        data: { title: "Local rename" },
      });
      await expect(
        legacy.resolveLink(identity, {
          academyId: academy,
          courseId: copy,
          nodeKey: explanation,
          localId: copyExplanation,
          expectedHash: before.hash,
        }),
      ).rejects.toMatchObject({ code: "CONTENT_EDIT_CONFLICT" });
      await match(module, copyModule);
      await match(lecture, copyLecture);
      await match(explanation, copyExplanation);
      await match(exercise, copyExercise);
      expect(
        (
          await legacy.unmatched(identity, {
            academyId: academy,
            courseId: copy,
          })
        ).nodes,
      ).toHaveLength(0);
      expect(
        (
          await db.programmingExercise.findUniqueOrThrow({
            where: { materialId: copyExercise },
          })
        ).description,
      ).toContain("Academy instructions");
      expect(
        await db.material.count({ where: { lectureId: copyLecture } }),
      ).toBe(2);
    });
    it("reviews unknown test-case lineage as one group, then future corrections sync automatically", async () => {
      const conflict = await db.librarySyncConflict.findFirstOrThrow({
        where: {
          copyCourseId: copy,
          unitKey: { startsWith: "exercise.testCase:" },
          status: "OPEN",
        },
      });
      const detail = await decisions.conflict(identity, {
        academyId: academy,
        conflictId: conflict.id,
      });
      expect(detail.members.length).toBeGreaterThan(0);
      expect(detail.actions).not.toContain("MANUAL");
      expect(
        detail.members.every(
          (member) => member.base && member.ours && member.theirs,
        ),
      ).toBe(true);
      await decisions.resolve(identity, {
        academyId: academy,
        conflictId: conflict.id,
        action: "ACCEPT_LIBRARY",
        expectedOursHash: detail.expectedOursHash,
        expectedTheirsHash: detail.expectedTheirsHash,
        requestKey: randomUUID(),
      });
      let rows = await db.exerciseTestCase.findMany({
        where: { exerciseMaterialId: copyExercise },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.expectedOutput).toBe("3");
      await db.exerciseTestCase.updateMany({
        where: { exerciseMaterialId: exercise },
        data: { expectedOutput: "4" },
      });
      await publish();
      await jobs.drain();
      rows = await db.exerciseTestCase.findMany({
        where: { exerciseMaterialId: copyExercise },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.expectedOutput).toBe("4");
      expect(
        (
          await db.programmingExercise.findUniqueOrThrow({
            where: { materialId: copyExercise },
          })
        ).description,
      ).toContain("Academy instructions");
    });

    it("keeps an explicitly excluded legacy subtree deleted across later releases", async () => {
      const otherCopy = randomUUID();
      await db.course.create({
        data: {
          id: otherCopy,
          academyId: academy,
          title: "Excluded copy",
          description: "",
          sourceCourseId: master,
          createdByUserId: lead,
        },
      });
      const preview = await legacy.preview(operator, {
        copyCourseId: otherCopy,
      });
      await legacy.link(operator, {
        courseId: master,
        copyCourseId: otherCopy,
        expectedHash: preview.hash,
      });
      const report = await legacy.unmatched(identity, {
        academyId: academy,
        courseId: otherCopy,
      });
      await legacy.resolveLink(identity, {
        academyId: academy,
        courseId: otherCopy,
        nodeKey: module,
        localId: null,
        action: "KEEP_DELETED",
        expectedHash: report.hash,
      });
      await jobs.drain();
      expect(
        await db.courseModule.count({ where: { courseId: otherCopy } }),
      ).toBe(0);
      expect(
        (
          await legacy.unmatched(identity, {
            academyId: academy,
            courseId: otherCopy,
          })
        ).nodes,
      ).toHaveLength(0);
      await db.course.update({
        where: { id: master },
        data: { description: "Unrelated correction" },
      });
      await publish();
      await jobs.drain();
      expect(
        await db.courseModule.count({ where: { courseId: otherCopy } }),
      ).toBe(0);
      expect(
        await db.librarySyncConflict.findMany({
          where: {
            copyCourseId: otherCopy,
            status: "OPEN",
            unitKey: "@presence",
          },
          select: { nodeKey: true, kind: true, detail: true },
        }),
      ).toEqual([]);
    });

    it("adds explicitly approved legacy nodes without guessing or duplicating their descendants", async () => {
      const otherCopy = randomUUID();
      await db.course.create({
        data: {
          id: otherCopy,
          academyId: academy,
          title: "Add copy",
          description: "",
          sourceCourseId: master,
          createdByUserId: lead,
        },
      });
      const preview = await legacy.preview(operator, {
        copyCourseId: otherCopy,
      });
      await legacy.link(operator, {
        courseId: master,
        copyCourseId: otherCopy,
        expectedHash: preview.hash,
      });
      await jobs.drain();
      const initial = await legacy.unmatched(identity, {
        academyId: academy,
        courseId: otherCopy,
      });
      for (const nodeKey of initial.nodes.map((node) => node.nodeKey)) {
        const report = await legacy.unmatched(identity, {
          academyId: academy,
          courseId: otherCopy,
        });
        await legacy.resolveLink(identity, {
          academyId: academy,
          courseId: otherCopy,
          nodeKey,
          localId: null,
          action: "ADD",
          expectedHash: report.hash,
        });
        await jobs.drain();
      }
      expect(
        await db.courseModule.count({ where: { courseId: otherCopy } }),
      ).toBe(1);
      expect(
        await db.material.count({
          where: { lecture: { courseModule: { courseId: otherCopy } } },
        }),
      ).toBe(3);
      expect(
        (
          await legacy.unmatched(identity, {
            academyId: academy,
            courseId: otherCopy,
          })
        ).nodes,
      ).toHaveLength(0);
      expect(await jobs.drain()).toBe(0);
    });
    it("maps legacy choice options by unique content, preserves their local IDs and applies future corrections", async () => {
      const choice = randomUUID(),
        otherCopy = randomUUID();
      const optionIds = [randomUUID(), randomUUID()];
      const definition = {
        version: 1,
        question: "Pick one",
        problemDescription: "",
        selectionMode: "SINGLE",
        options: optionIds.map((id, index) => ({
          id,
          content: `Choice ${index}`,
        })),
        correctOptionIds: [optionIds[0]!],
        shuffleOptions: false,
        explanationEnabled: false,
        explanation: "",
      };
      await db.material.create({
        data: {
          id: choice,
          lectureId: lecture,
          type: "MULTIPLE_CHOICE",
          title: "Choice",
          position: 4,
          manualMaterial: { create: { files: {}, multipleChoice: definition } },
        },
      });
      const source = await db.course.findUniqueOrThrow({
        where: { id: master },
        include: courseCopyInclude,
      });
      await db.$transaction(async (tx) => {
        await tx.course.create({
          data: {
            id: otherCopy,
            academyId: academy,
            title: "Old choice copy",
            description: "",
            sourceCourseId: master,
            createdByUserId: lead,
          },
        });
        await copyCourseTree(tx, source, otherCopy, "ACADEMY_ADOPTION");
      });
      const copied = await db.course.findUniqueOrThrow({
        where: { id: otherCopy },
        include: courseCopyInclude,
      });
      const localModule = copied.modules[0]!,
        localLecture = localModule.lectures[0]!;
      const localChoice = localLecture.materials.find(
        (m) => m.type === "MULTIPLE_CHOICE",
      )!;
      const original = localChoice.manualMaterial!.multipleChoice as {
        options: Array<{ id: string; content: string }>;
        correctOptionIds: string[];
      };
      expect(original.options.map((o) => o.id)).not.toEqual(optionIds);
      await db.manualMaterial.update({
        where: { materialId: choice },
        data: {
          multipleChoice: { ...definition, correctOptionIds: [optionIds[1]!] },
        },
      });
      await publish();
      const preview = await legacy.preview(operator, {
        copyCourseId: otherCopy,
      });
      await legacy.link(operator, {
        courseId: master,
        copyCourseId: otherCopy,
        expectedHash: preview.hash,
      });
      const mapping = new Map<string, string>([
        [module, localModule.id],
        [lecture, localLecture.id],
        ...source.modules[0]!.lectures[0]!.materials.map(
          (m): [string, string] => [
            m.id,
            localLecture.materials.find((c) => c.position === m.position)!.id,
          ],
        ),
      ]);
      const initial = await legacy.unmatched(identity, {
        academyId: academy,
        courseId: otherCopy,
      });
      for (const node of initial.nodes) {
        const report = await legacy.unmatched(identity, {
          academyId: academy,
          courseId: otherCopy,
        });
        await legacy.resolveLink(identity, {
          academyId: academy,
          courseId: otherCopy,
          nodeKey: node.nodeKey,
          localId: mapping.get(node.nodeKey)!,
          expectedHash: report.hash,
        });
        await jobs.drain();
      }
      const conflict = await db.librarySyncConflict.findFirstOrThrow({
        where: {
          copyCourseId: otherCopy,
          nodeKey: choice,
          unitKey: "mc.structure",
          status: "OPEN",
        },
      });
      const comparisonStart = queries;
      const detail = await decisions.conflict(identity, {
        academyId: academy,
        conflictId: conflict.id,
      });
      const comparisonReads = queries - comparisonStart;
      process.stdout.write(
        `choice comparison statements: ${comparisonReads}\n`,
      );
      expect(comparisonReads).toBeLessThanOrEqual(10);
      expect(detail.theirs.value).toMatchObject({
        options: [
          { content: "Choice 0", correct: false },
          { content: "Choice 1", correct: true },
        ],
      });
      await decisions.resolve(identity, {
        academyId: academy,
        conflictId: conflict.id,
        action: "ACCEPT_LIBRARY",
        expectedOursHash: detail.expectedOursHash,
        expectedTheirsHash: detail.expectedTheirsHash,
        requestKey: randomUUID(),
      });
      let saved = (
        await db.manualMaterial.findUniqueOrThrow({
          where: { materialId: localChoice.id },
        })
      ).multipleChoice as typeof original;
      expect(saved.options.map((o) => o.id)).toEqual(
        original.options.map((o) => o.id),
      );
      expect(saved.correctOptionIds).toEqual([original.options[1]!.id]);
      await db.manualMaterial.update({
        where: { materialId: choice },
        data: {
          multipleChoice: {
            ...definition,
            correctOptionIds: [optionIds[1]!],
            options: [
              { id: optionIds[0]!, content: "Corrected choice" },
              definition.options[1]!,
            ],
          },
        },
      });
      await publish();
      await jobs.drain();
      saved = (
        await db.manualMaterial.findUniqueOrThrow({
          where: { materialId: localChoice.id },
        })
      ).multipleChoice as typeof original;
      expect(saved.options[0]).toEqual({
        id: original.options[0]!.id,
        content: "Corrected choice",
      });
      expect(
        await db.librarySyncConflict.count({
          where: { copyCourseId: otherCopy, nodeKey: choice, status: "OPEN" },
        }),
      ).toBe(0);
    });
  },
);
