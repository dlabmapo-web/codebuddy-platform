import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AuditService } from "../academies/audit.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { CourseService } from "../content/course.service.js";
import { AcademyLibraryService } from "../content/library/academy-library.service.js";
import { courseCopyInclude } from "../content/library/course-tree-copy.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type Course,
  type Academy,
  type User,
} from "../generated/prisma/client.js";
import { PlatformLibraryImportService } from "./platform-library-import.service.js";
import { PlatformLibraryService } from "./platform-library.service.js";

// Run only against an explicitly supplied disposable PostgreSQL with migrations applied.
const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!databaseUrl)(
  "academy course import into the library (PostgreSQL)",
  () => {
    let db: PrismaService,
      service: PlatformLibraryImportService,
      courses: CourseService;
    let libraries: PlatformLibraryService, adoption: AcademyLibraryService;
    let audit: AuditService, access: AcademyAccessService;
    let admin: User, member: User, academy: Academy, source: Course;
    let organizationId: string, organizationSlug: string;
    let pdfId: string, videoId: string, imageId: string, captionId: string;
    const identity = (user: User) =>
      ({ authUserId: user.authUserId }) as SupabaseIdentity;
    const input = (title = `Imported ${randomUUID()}`) => ({
      sourceAcademyId: academy.id,
      sourceCourseId: source.id,
      title,
      expectedSourceContentRevision: source.contentRevision,
      requestKey: randomUUID(),
    });
    it("keeps reference solutions inaccessible to direct Supabase clients", async () => {
      const permissions = await db.$queryRaw<Array<{ role: string; allowed: boolean; rls: boolean }>>`
        SELECT role, has_table_privilege(role, 'public.programming_exercise_solutions', 'SELECT') AS allowed,
          (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.programming_exercise_solutions'::regclass) AS rls
        FROM (VALUES ('anon'), ('authenticated')) AS roles(role)`;
      expect(permissions).toEqual([
        { role: "anon", allowed: false, rls: true },
        { role: "authenticated", allowed: false, rls: true },
      ]);
    });
    const tree = (id: string) =>
      db.course.findUniqueOrThrow({
        where: { id },
        include: courseCopyInclude,
      });

    beforeAll(() => {
      db = new PrismaService(
        new ConfigService({ DATABASE_URL: databaseUrl }) as never,
      );
    });
    beforeEach(async () => {
      organizationSlug = `import-test-${randomUUID()}`;
      organizationId = (
        await db.organization.create({
          data: { name: "Import test", slug: organizationSlug },
        })
      ).id;
      admin = await db.user.create({
        data: {
          authUserId: randomUUID(),
          status: "ACTIVE",
          platformRole: "ADMIN",
        },
      });
      member = await db.user.create({
        data: {
          authUserId: randomUUID(),
          status: "ACTIVE",
          platformRole: "USER",
        },
      });
      academy = await db.academy.create({
        data: {
          organizationId,
          name: "Source academy",
          slug: `academy-${randomUUID()}`,
        },
      });
      await db.academyMembership.create({
        data: {
          academyId: academy.id,
          userId: member.id,
          role: "TEAM_LEAD",
          status: "ACTIVE",
        },
      });
      source = await db.course.create({
        data: {
          academyId: academy.id,
          title: "Source course",
          description: "Description",
          contentRevision: 7,
          isVisible: true,
          createdByUserId: member.id,
        },
      });
      const module = await db.courseModule.create({
        data: {
          courseId: source.id,
          externalKey: "module-key",
          title: "Hidden module",
          position: 1,
          isVisible: false,
        },
      });
      const lecture = await db.lecture.create({
        data: {
          courseModuleId: module.id,
          externalKey: "lecture-key",
          title: "Mixed lecture",
          position: 1,
          isVisible: true,
        },
      });
      imageId = (
        await db.manualAsset.create({
          data: {
            academyId: academy.id,
            courseId: source.id,
            name: "shape.png",
            byteSize: 10,
            mimeType: "image/png",
            sha256: "test",
            objectKey: `test/${randomUUID()}`,
          },
        })
      ).id;
      pdfId = (
        await db.pdfAsset.create({
          data: {
            academyId: academy.id,
            courseId: source.id,
            lectureId: lecture.id,
            uploaderUserId: member.id,
            originalFilename: "test.pdf",
            byteSize: 10,
            checksumSha256: "test",
            state: "READY",
            consumedAt: new Date(),
            objectKey: `test/${randomUUID()}`,
          },
        })
      ).id;
      videoId = (
        await db.videoAsset.create({
          data: {
            academyId: academy.id,
            courseId: source.id,
            lectureId: lecture.id,
            uploaderUserId: member.id,
            filename: "test.mp4",
            byteSize: 10,
            state: "READY",
            requestKey: randomUUID(),
            objectKey: `test/${randomUUID()}`,
            outputs: ["main.mp4"],
          },
        })
      ).id;
      captionId = randomUUID();
      await db.videoCaption.create({
        data: {
          id: captionId,
          assetId: videoId,
          uploaderUserId: member.id,
          language: "en",
          label: "English",
          objectKey: `${academy.id}/${videoId}/captions/${captionId}.vtt`,
        },
      });
      const image = { assetId: imageId, name: "shape.png", byteSize: 10 };
      const programming = await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "Programming",
          type: "PROGRAMMING_EXERCISE",
          position: 1,
          isVisible: true,
          programmingExercise: {
            create: {
              externalKey: "problem-key",
              difficulty: "MEDIUM",
              solutionCode: "PRIVATE_SOLUTION",
              solutions: { create: [{ position: 0, title: "First", code: "PRIVATE_SOLUTION" }, { position: 1, title: "Second", code: "PRIVATE_ALTERNATIVE" }] },
              inputPromptPolicy: "IGNORE",
              gradingRevision: 9,
              gradingMode: "ELICE_STDIO",
              gradingSemanticVersion: "elice-v1",
              totalTimeLimitMs: 60000,
              comparatorTimeLimitMs: 100,
              materialMaximumHundredths: 10000,
              materialScorePolicy: "PROPORTIONAL",
              feedbackPolicy: { version: 1, passed: "PRIVATE_FEEDBACK" },
              testCases: {
                create: {
                  position: 1,
                  input: "PRIVATE_INPUT",
                  expectedOutput: "PRIVATE_OUTPUT",
                  visibility: "HIDDEN",
                  weight: 40,
                  comparator: "STDOUT",
                  label: "case",
                  softTimeLimitMs: 500,
                  softPenalty: 10,
                },
              },
              hints: {
                create: {
                  position: 1,
                  content: "Hint",
                  triggerExpression: "attempts >= 2",
                },
              },
            },
          },
        },
      });
      await db.exerciseDraft.create({
        data: {
          userId: member.id,
          courseId: source.id,
          materialId: programming.id,
          sourceMaterialId: programming.id,
          code: "STUDENT_DRAFT",
        },
      });
      await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "PDF",
          type: "PDF_DOCUMENT",
          position: 2,
          isVisible: false,
          pdfDocument: {
            create: { assetId: pdfId, placement: "MAIN", revision: 4 },
          },
        },
      });
      const turtle = await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "Turtle",
          type: "TURTLE_EXERCISE",
          position: 3,
          isVisible: true,
          manualMaterial: {
            create: {
              revision: 8,
              runtimeVersion: "approved-runtime",
              files: { "main.py": "import turtle" },
              solutionFiles: { "main.py": "PRIVATE_TURTLE" },
              assets: [image],
              solutionAssets: [image],
              modelAnswer: "PRIVATE_MODEL",
              hint: "Hint",
            },
          },
        },
      });
      await db.manualDraft.create({
        data: {
          userId: member.id,
          materialId: turtle.id,
          files: { "main.py": "STUDENT_TURTLE" },
        },
      });
      const classroom = await db.class.create({
        data: {
          academyId: academy.id,
          name: "Class",
          createdByUserId: member.id,
        },
      });
      await db.classCourse.create({
        data: {
          classId: classroom.id,
          courseId: source.id,
          assignedByUserId: member.id,
        },
      });
      await db.manualSubmission.create({
        data: {
          userId: member.id,
          classId: classroom.id,
          materialId: turtle.id,
          files: { "main.py": "STUDENT_SUBMISSION" },
          profile: {},
          revision: 8,
          maximumHundredths: 10000,
          includeInScore: false,
          requestKey: randomUUID(),
        },
      });
      await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "Short answer",
          type: "WRITTEN_RESPONSE",
          position: 4,
          isVisible: false,
          manualMaterial: {
            create: {
              shortAnswer: {
                version: 1,
                question: "2 + 2?",
                gradingMode: "EXACT",
                expectedAnswer: "4",
                pattern: "",
                explanationEnabled: true,
                explanation: "PRIVATE_EXPLANATION",
              },
            },
          },
        },
      });
      const options = [
        { id: randomUUID(), content: "A" },
        { id: randomUUID(), content: "B" },
      ];
      await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "Choice",
          type: "MULTIPLE_CHOICE",
          position: 5,
          isVisible: true,
          manualMaterial: {
            create: {
              multipleChoice: {
                version: 1,
                question: "Choose",
                problemDescription: "Text",
                selectionMode: "SINGLE",
                options,
                correctOptionIds: [options[1]!.id],
                shuffleOptions: true,
                explanationEnabled: true,
                explanation: "PRIVATE_CHOICE",
              },
            },
          },
        },
      });
      await db.material.create({
        data: {
          lectureId: lecture.id,
          title: "Video",
          type: "VIDEO_LESSON",
          position: 6,
          isVisible: true,
          isRequired: false,
          videoLesson: {
            create: {
              assetId: videoId,
              requestKey: randomUUID(),
              revision: 5,
              description: "Video instructions",
              placement: "BOTH",
              includeInScore: true,
              maximumHundredths: 20000,
              thresholdBasisPoints: 8000,
              assets: [image],
              captions: [
                {
                  id: captionId,
                  language: "en",
                  label: "English",
                  path: `captions/${captionId}.vtt`,
                },
              ],
            },
          },
        },
      });
      const config = new ConfigService({
        PLATFORM_ORGANIZATION_SLUG: organizationSlug,
      });
      audit = new AuditService();
      access = new AcademyAccessService(db, new SupportGrantResolver(db));
      service = new PlatformLibraryImportService(
        db,
        new PlatformAccessService(db),
        access,
        audit,
        config as never,
      );
      libraries = new PlatformLibraryService(
        db,
        new PlatformAccessService(db),
        audit,
        config as never,
        service,
      );
      adoption = new AcademyLibraryService(db, access, audit);
      courses = new CourseService(db, access, audit, {
        revokeClass: vi.fn(),
      } as never);
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      const academies = await db.academy.findMany({
        where: { organizationId },
        select: { id: true },
      });
      const academyIds = academies.map((item) => item.id);
      const courseScope = { academy: { organizationId } };
      const materialScope = {
        lecture: { courseModule: { course: courseScope } },
      };
      await db.auditLog.deleteMany({
        where: { actorUserId: { in: [admin.id, member.id] } },
      });
      await db.libraryCourseImport.deleteMany({
        where: { actorUserId: admin.id },
      });
      await db.manualSubmission.deleteMany({
        where: { material: materialScope },
      });
      await db.exerciseDraft.deleteMany({ where: { course: courseScope } });
      await db.class.deleteMany({ where: { academyId: { in: academyIds } } });
      await db.course.updateMany({
        where: courseScope,
        data: { sourceCourseId: null },
      });
      await db.course.deleteMany({ where: courseScope });
      await db.videoCaption.deleteMany({
        where: { asset: { academyId: { in: academyIds } } },
      });
      await db.videoAsset.deleteMany({
        where: { academyId: { in: academyIds } },
      });
      await db.pdfAsset.deleteMany({
        where: { academyId: { in: academyIds } },
      });
      await db.manualAsset.deleteMany({
        where: { academyId: { in: academyIds } },
      });
      await db.academyMembership.deleteMany({
        where: { academyId: { in: academyIds } },
      });
      await db.academy.deleteMany({ where: { organizationId } });
      await db.organization.delete({ where: { id: organizationId } });
      await db.user.deleteMany({
        where: { id: { in: [admin.id, member.id] } },
      });
    });
    afterAll(async () => {
      await db.$disconnect();
    });

    it("previews all six types and hidden descendants without private answers", async () => {
      const preview = await service.preview(identity(admin), input());
      expect(Object.values(preview.materialCounts)).toEqual([1, 1, 1, 1, 1, 1]);
      expect(preview.blockers).toEqual([]);
      expect(preview.modules[0]!.isVisible).toBe(false);
      expect(JSON.stringify(preview)).not.toMatch(/PRIVATE_|STUDENT_/);
    });

    it("copies complete authored configuration with fresh IDs and no student history", async () => {
      const before = await tree(source.id);
      const result = await service.importCourse(identity(admin), input());
      const listed = await libraries.courses(identity(admin), { page: 1 });
      expect(result.course).toEqual(listed.courses.find((course) => course.id === result.course.id));
      const copied = await tree(result.course.id);
      expect(copied).toMatchObject({
        isVisible: false,
        retiredAt: null,
        contentRevision: 1,
        sourceCourseId: null,
        sourceContentRevision: null,
        baselineRevision: null,
        description: source.description,
        createdByUserId: admin.id,
      });
      expect(copied.modules[0]).toMatchObject({
        externalKey: "module-key",
        isVisible: false,
      });
      const originalMaterials = before.modules[0]!.lectures[0]!.materials;
      const copiedMaterials = copied.modules[0]!.lectures[0]!.materials;
      expect(copiedMaterials.map((item) => item.isVisible)).toEqual(
        originalMaterials.map((item) => item.isVisible),
      );
      expect(copiedMaterials.map((item) => item.position)).toEqual([
        1, 2, 3, 4, 5, 6,
      ]);
      for (const [index, material] of copiedMaterials.entries())
        expect(material.id).not.toBe(originalMaterials[index]!.id);
      expect(copiedMaterials[0]!.programmingExercise).toMatchObject({
        gradingRevision: 1,
        solutionCode: "PRIVATE_SOLUTION",
        inputPromptPolicy: "IGNORE",
        solutions: [{ title: "First", code: "PRIVATE_SOLUTION", position: 0 }, { title: "Second", code: "PRIVATE_ALTERNATIVE", position: 1 }],
        feedbackPolicy: { passed: "PRIVATE_FEEDBACK" },
        testCases: [
          { weight: 40, softPenalty: 10, expectedOutput: "PRIVATE_OUTPUT" },
        ],
        hints: [{ triggerExpression: "attempts >= 2" }],
      });
      expect(copiedMaterials[1]!.pdfDocument).toMatchObject({
        assetId: pdfId,
        revision: 1,
      });
      expect(copiedMaterials[2]!.manualMaterial).toMatchObject({
        revision: 1,
        runtimeVersion: "approved-runtime",
        modelAnswer: "PRIVATE_MODEL",
        solutionFiles: { "main.py": "PRIVATE_TURTLE" },
        assets: [{ assetId: imageId }],
      });
      expect(copiedMaterials[3]!.manualMaterial!.shortAnswer).toEqual(
        originalMaterials[3]!.manualMaterial!.shortAnswer,
      );
      const choice = copiedMaterials[4]!.manualMaterial!.multipleChoice as {
        options: { id: string }[];
        correctOptionIds: string[];
      };
      expect(choice.correctOptionIds).toEqual([choice.options[1]!.id]);
      expect(choice).not.toEqual(
        originalMaterials[4]!.manualMaterial!.multipleChoice,
      );
      expect(copiedMaterials[5]!.videoLesson).toMatchObject({
        revision: 1,
        assetId: videoId,
        thresholdBasisPoints: 8000,
        captions: [{ id: captionId }],
      });
      expect(copiedMaterials[5]!.videoLesson!.requestKey).not.toBe(
        originalMaterials[5]!.videoLesson!.requestKey,
      );
      expect(
        await db.exerciseDraft.count({ where: { courseId: copied.id } }),
      ).toBe(0);
      expect(
        await db.manualSubmission.count({
          where: {
            material: { lecture: { courseModule: { courseId: copied.id } } },
          },
        }),
      ).toBe(0);
      expect(
        await db.manualDraft.count({
          where: {
            material: { lecture: { courseModule: { courseId: copied.id } } },
          },
        }),
      ).toBe(0);
      expect(
        await db.classCourse.count({ where: { courseId: copied.id } }),
      ).toBe(0);
      expect(await tree(source.id)).toEqual(before);
      const builder = await courses.getTree(identity(admin), {
        academyId: result.academyId,
        courseId: copied.id,
      });
      expect(builder.course.libraryImportOrigin).toMatchObject({
        sourceAcademyName: academy.name,
        sourceCourseId: source.id,
        sourceContentRevision: 7,
      });
      expect(builder.course.provenance).toBeNull();
      expect(
        await adoption.available(identity(member), { academyId: academy.id }),
      ).toEqual({ courses: [] });
    });

    it("publishes and adopts the new master using existing policies and feedback settings", async () => {
      const result = await service.importCourse(identity(admin), input());
      await courses.setVisibility(identity(admin), {
        academyId: result.academyId,
        courseId: result.course.id,
        isVisible: true,
      });
      const adopted = await adoption.adopt(identity(member), {
        academyId: academy.id,
        libraryCourseId: result.course.id,
        title: "Adopted new master",
      });
      const copied = await tree(adopted.id);
      expect(copied.sourceCourseId).toBe(result.course.id);
      expect(copied.modules[0]!.isVisible).toBe(true);
      expect(copied.modules[0]!.lectures[0]!.materials[5]!.isVisible).toBe(
        false,
      );
      expect(
        copied.modules[0]!.lectures[0]!.materials[0]!.programmingExercise!
          .feedbackPolicy,
      ).toEqual({ version: 1, passed: "PRIVATE_FEEDBACK" });
      expect(
        (
          await courses.getTree(identity(member), {
            academyId: academy.id,
            courseId: copied.id,
          })
        ).course.libraryImportOrigin,
      ).toBeNull();
      const roundtrip = await service.importCourse(identity(admin), {
        ...input("Reimport adopted copy"),
        sourceCourseId: copied.id,
        expectedSourceContentRevision: copied.contentRevision,
      });
      expect((await tree(roundtrip.course.id)).sourceCourseId).toBeNull();
    });

    it("replays same-key requests without duplicating content or audit, even after source deletion", async () => {
      const request = input();
      const [a, b] = await Promise.all([
        service.importCourse(identity(admin), request),
        service.importCourse(identity(admin), request),
      ]);
      expect(a.course.id).toBe(b.course.id);
      expect(
        await db.auditLog.count({
          where: {
            targetId: a.course.id,
            action: "platform.library.course.imported_from_academy",
          },
        }),
      ).toBe(1);
      await db.exerciseDraft.deleteMany({ where: { courseId: source.id } });
      await db.manualSubmission.deleteMany({ where: { userId: member.id } });
      await db.classCourse.deleteMany({ where: { courseId: source.id } });
      await db.course.delete({ where: { id: source.id } });
      expect(
        (await service.importCourse(identity(admin), request)).course.id,
      ).toBe(a.course.id);
      expect(
        (await tree(a.course.id)).modules[0]!.lectures[0]!.materials[1]!
          .pdfDocument!.asset.state,
      ).toBe("READY");
      await expect(
        service.importCourse(identity(admin), {
          ...request,
          title: "Different",
        }),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_REQUEST_CONFLICT" });
    });

    it("serializes different-key draft title conflicts, including lazy library creation", async () => {
      const results = await Promise.allSettled([
        service.importCourse(identity(admin), input("Duplicate")),
        service.importCourse(identity(admin), input("duplicate")),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const failure = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(failure.reason).toMatchObject({ code: "COURSE_TITLE_CONFLICT" });
      expect(
        await db.academy.count({ where: { organizationId, kind: "LIBRARY" } }),
      ).toBe(1);
    });

    it("serializes copy against library create and rename", async () => {
      const existing = await libraries.create(identity(admin), {
        title: "Existing",
        description: "",
      });
      const library = await db.course.findUniqueOrThrow({
        where: { id: existing.id },
      });
      const rename = await Promise.allSettled([
        service.importCourse(identity(admin), input("Rename race")),
        courses.update(identity(admin), {
          academyId: library.academyId,
          courseId: existing.id,
          title: "Rename race",
        }),
      ]);
      expect(
        rename.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const create = await Promise.allSettled([
        service.importCourse(identity(admin), input("Create race")),
        libraries.create(identity(admin), {
          title: "Create race",
          description: "",
        }),
      ]);
      expect(
        create.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
    });

    it("rejects a stale preview and rolls back a failed audit", async () => {
      await db.course.update({
        where: { id: source.id },
        data: { contentRevision: { increment: 1 } },
      });
      await expect(
        service.importCourse(identity(admin), input()),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_SOURCE_CHANGED" });
      source.contentRevision += 1;
      vi.spyOn(audit, "write").mockRejectedValue(
        new Error("injected audit failure"),
      );
      await expect(
        service.importCourse(identity(admin), input()),
      ).rejects.toThrow("injected audit failure");
      expect(
        await db.course.count({
          where: { academy: { organizationId, kind: "LIBRARY" } },
        }),
      ).toBe(0);
      expect(
        await db.libraryCourseImport.count({
          where: { actorUserId: admin.id },
        }),
      ).toBe(0);
    });

    it("blocks missing, malformed and non-READY content, including hidden materials", async () => {
      await db.pdfAsset.update({
        where: { id: pdfId },
        data: { state: "DELETING" },
      });
      expect(
        (await service.preview(identity(admin), input())).blockers,
      ).toContainEqual(
        expect.objectContaining({
          materialTitle: "PDF",
          reason: "ASSET_NOT_READY",
        }),
      );
      await expect(
        service.importCourse(identity(admin), input()),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_CONTENT_INVALID" });
      await db.pdfAsset.update({
        where: { id: pdfId },
        data: { state: "READY" },
      });
      await db.manualAsset.update({
        where: { id: imageId },
        data: { byteSize: 20 },
      });
      expect(
        (await service.preview(identity(admin), input())).blockers,
      ).toContainEqual(expect.objectContaining({ reason: "ASSET_MISSING" }));
      await db.manualAsset.update({
        where: { id: imageId },
        data: { byteSize: 10 },
      });
      await db.manualMaterial.updateMany({
        where: {
          material: {
            title: "Choice",
            lecture: { courseModule: { courseId: source.id } },
          },
        },
        data: { multipleChoice: { malformed: true } },
      });
      expect(
        (await service.preview(identity(admin), input())).blockers,
      ).toContainEqual(
        expect.objectContaining({ reason: "INVALID_DEFINITION" }),
      );
      expect(
        await db.libraryCourseImport.count({
          where: { actorUserId: admin.id },
        }),
      ).toBe(0);
    });

    it("requires platform authority even for academy leads and suspended admins", async () => {
      await expect(
        service.preview(identity(member), input()),
      ).rejects.toMatchObject({ code: "PLATFORM_ACCESS_DENIED" });
      await expect(
        service.importCourse(identity(member), input()),
      ).rejects.toMatchObject({ code: "PLATFORM_ACCESS_DENIED" });
      await db.user.update({
        where: { id: admin.id },
        data: { status: "SUSPENDED" },
      });
      await expect(
        service.importCourse(identity(admin), input()),
      ).rejects.toMatchObject({ code: "USER_SUSPENDED" });
    });

    it("rejects organization mismatches, library sources and wrong course/academy pairs", async () => {
      const config = new ConfigService({
        PLATFORM_ORGANIZATION_SLUG: "another-organization",
      });
      const other = new PlatformLibraryImportService(
        db,
        new PlatformAccessService(db),
        access,
        audit,
        config as never,
      );
      await expect(
        other.importCourse(identity(admin), input()),
      ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
      const result = await service.importCourse(identity(admin), input());
      await expect(
        service.preview(identity(admin), {
          sourceAcademyId: result.academyId,
          sourceCourseId: result.course.id,
        }),
      ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
      await expect(
        service.importCourse(identity(admin), {
          ...input(),
          sourceCourseId: result.course.id,
        }),
      ).rejects.toMatchObject({ code: "COURSE_NOT_FOUND" });
    });

    it("rejects source edits racing its locked snapshot without mixing tree revisions", async () => {
      await libraries.create(identity(admin), {
        title: "Warm library",
        description: "",
      });
      let release!: () => void;
      let locked!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const writer = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM courses WHERE id = ${source.id}::uuid FOR UPDATE`;
          locked();
          await gate;
          await tx.programmingExercise.updateMany({
            where: {
              material: { lecture: { courseModule: { courseId: source.id } } },
            },
            data: { description: "Concurrent new content" },
          });
          await tx.course.update({
            where: { id: source.id },
            data: { contentRevision: { increment: 1 } },
          });
        },
        { timeout: 10_000 },
      );
      await ready;
      const result = service.importCourse(identity(admin), input());
      // Observe the actual database lock wait before releasing the writer.
      try {
        await vi.waitFor(
          async () => {
            const waiting = await db.$queryRaw<
              Array<{ count: bigint }>
            >`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%SELECT id FROM courses%'`;
            expect(Number(waiting[0]!.count)).toBeGreaterThan(0);
          },
          { timeout: 2_000, interval: 20 },
        );
      } finally {
        release();
      }
      await writer;
      await expect(result).rejects.toMatchObject({
        code: "LIBRARY_IMPORT_SOURCE_CHANGED",
      });
      expect(
        await db.libraryCourseImport.count({
          where: { actorUserId: admin.id },
        }),
      ).toBe(0);
    });

    it("rejects invalid caption references and request-key reuse by another admin", async () => {
      await db.videoCaption.update({
        where: { id: captionId },
        data: { label: "Changed caption" },
      });
      expect(
        (await service.preview(identity(admin), input())).blockers,
      ).toContainEqual(expect.objectContaining({ reason: "CAPTION_INVALID" }));
      await expect(
        service.importCourse(identity(admin), input()),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_CONTENT_INVALID" });
      await db.videoCaption.update({
        where: { id: captionId },
        data: { label: "English" },
      });
      const request = input();
      await service.importCourse(identity(admin), request);
      await db.user.update({
        where: { id: member.id },
        data: { platformRole: "ADMIN" },
      });
      await expect(
        service.importCourse(identity(member), request),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_REQUEST_CONFLICT" });
    });

    it("copies thousands of rows using bulk writes within the transaction budget", async () => {
      const material = (await tree(source.id)).modules[0]!.lectures[0]!
        .materials[0]!;
      await db.exerciseTestCase.createMany({
        data: Array.from({ length: 2000 }, (_, index) => ({
          exerciseMaterialId: material.id,
          position: index + 2,
          input: String(index),
          expectedOutput: String(index),
          visibility: "HIDDEN" as const,
        })),
      });
      const start = Date.now();
      const result = await service.importCourse(identity(admin), input());
      const copiedMaterial = (await tree(result.course.id)).modules[0]!
        .lectures[0]!.materials[0]!;
      expect(copiedMaterial.programmingExercise!.testCases).toHaveLength(2001);
      expect(Date.now() - start).toBeLessThan(30_000);
    });
  },
);
