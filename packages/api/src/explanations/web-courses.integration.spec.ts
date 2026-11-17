import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { ConfigService } from "@nestjs/config";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import {
  createProgrammingExerciseSchema,
  defaultEliceGradingProfile,
} from "@cove/shared";
import { PrismaClient } from "../generated/prisma/client.js";
import type { PrismaService } from "../database/prisma.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupportGrantResolver } from "../authorization/support-grant.resolver.js";
import { AuditService } from "../academies/audit.service.js";
import { CourseService } from "../content/course.service.js";
import { ManualAssetsService } from "../manual/manual-assets.service.js";
import { CurriculumOutlineService } from "../learn/curriculum-outline.service.js";
import { withCurriculum } from "../learn/curriculum-read.js";
import { TeacherProgressAccessService } from "../teach/teacher-progress-access.service.js";
import { TeacherProgressRepository } from "../teach/teacher-progress.repository.js";
import { TeacherProgressService } from "../teach/teacher-progress.service.js";
import { ExplanationService } from "./explanation.service.js";
const url = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!url)(
  "Web course reading progress on disposable PostgreSQL",
  () => {
    const client = url
      ? new PrismaClient({
          adapter: new PrismaPg({ connectionString: url }),
          log: [{ emit: "event", level: "query" }],
        })
      : null!;
    const db = client as unknown as PrismaService;
    const academyId = randomUUID(),
      courseId = randomUUID(),
      classId = randomUUID();
    const authorId = randomUUID(),
      teacherId = randomUUID(),
      readerId = randomUUID();
    const authorAuth = randomUUID(),
      teacherAuth = randomUUID(),
      readerAuth = randomUUID();
    const author = { authUserId: authorAuth } as never,
      teacher = { authUserId: teacherAuth } as never,
      student = { authUserId: readerAuth } as never;
    let lectureId: string,
      materialId: string,
      explanation: ExplanationService,
      outlines: CurriculumOutlineService,
      reports: TeacherProgressService,
      repository: TeacherProgressRepository,
      courses: CourseService;
    let statements = 0;
    async function measured<T>(fn: () => Promise<T>) {
      statements = 0;
      const data = await fn();
      return { data, statements };
    }
    beforeAll(async () => {
      if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
        throw new Error("Disposable local PostgreSQL required");
      client.$on("query", () => {
        statements++;
      });
      const org = await client.organization.create({
        data: { name: "Web course tests", slug: randomUUID() },
      });
      await client.academy.create({
        data: {
          id: academyId,
          organizationId: org.id,
          name: "Web academy",
          slug: randomUUID(),
        },
      });
      await client.user.createMany({
        data: [
          [authorId, authorAuth],
          [teacherId, teacherAuth],
          [readerId, readerAuth],
        ].map(([id, authUserId]) => ({
          id,
          authUserId,
          status: "ACTIVE" as const,
          displayName: id === readerId ? "Web reader" : "Web staff",
        })),
      });
      await client.academyMembership.create({
        data: {
          academyId,
          userId: authorId,
          role: "MANAGER",
          status: "ACTIVE",
        },
      });
      const tm = await client.academyMembership.create({
        data: {
          academyId,
          userId: teacherId,
          role: "TEACHER",
          status: "ACTIVE",
        },
      });
      const sm = await client.academyMembership.create({
        data: {
          academyId,
          userId: readerId,
          role: "STUDENT",
          status: "ACTIVE",
        },
      });
      await client.course.create({
        data: {
          id: courseId,
          academyId,
          title: "Web foundations",
          language: "WEB",
          isVisible: true,
          createdByUserId: authorId,
        },
      });
      const module = await client.courseModule.create({
        data: {
          courseId,
          title: "HTML",
          externalKey: randomUUID(),
          position: 1,
          isVisible: true,
        },
      });
      const lecture = await client.lecture.create({
        data: {
          courseModuleId: module.id,
          title: "Week 1",
          externalKey: randomUUID(),
          position: 1,
          isVisible: true,
        },
      });
      lectureId = lecture.id;
      await client.class.create({
        data: {
          id: classId,
          academyId,
          name: "Web class",
          teacherMembershipId: tm.id,
          createdByUserId: authorId,
          courseAssignments: {
            create: { courseId, assignedByUserId: authorId },
          },
          enrollments: {
            create: { membershipId: sm.id, enrolledByUserId: authorId },
          },
        },
      });
      const access = new AcademyAccessService(db, new SupportGrantResolver(db));
      outlines = new CurriculumOutlineService(db);
      const images = new ManualAssetsService(
        new ConfigService({
          SUPABASE_URL: "http://127.0.0.1:1",
          SUPABASE_SECRET_KEY: "local-test",
        }),
        db,
      );
      const revocation = { revokeClass: vi.fn() } as never;
      explanation = new ExplanationService(
        db,
        access,
        images,
        new AuditService(),
        outlines,
        revocation,
      );
      courses = new CourseService(db, access, new AuditService(), revocation);
      repository = new TeacherProgressRepository(db);
      reports = new TeacherProgressService(
        new TeacherProgressAccessService(db, access),
        repository,
      );
      materialId = (
        await explanation.save(author, {
          academyId,
          courseId,
          lectureId,
          title: "Practice: div",
          body: '<div data-callout="practice">Try it</div><pre data-language="html" data-filename="index.html"><code>&lt;div&gt;Hello&lt;/div&gt;</code></pre>',
          sideBody: "<p>Reference HTML</p>",
          isVisible: true,
        })
      ).materialId;
    });
    afterAll(async () => {
      await client?.$disconnect();
    });
    it("refuses programming, including PDF practice, under the web course lock", async () => {
      const input = createProgrammingExerciseSchema.parse({
        academyId,
        courseId,
        lectureId,
        title: "Not supported",
        difficulty: "EASY",
        description: "<p>Try</p>",
        inputFormat: "",
        outputFormat: "",
        constraints: "",
        starterCode: "",
        solutions: [{ title: null, code: "print(1)" }],
        aiFeedbackEnabled: false,
        isVisible: true,
        testCases: [
          {
            input: "",
            expectedOutput: "1",
            visibility: "SAMPLE",
            comparator: "STDOUT",
            weight: 100,
            timeLimitMsOverride: null,
            softTimeLimitMs: null,
            softPenalty: null,
            label: null,
          },
        ],
        grading: defaultEliceGradingProfile,
        hints: [],
      });
      await expect(courses.createExercise(author, input)).rejects.toMatchObject(
        { code: "CONTENT_VALIDATION_FAILED" },
      );
      await expect(
        courses.createExercise(author, {
          ...input,
          referencePdfMaterialId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
      expect(
        await client.programmingExercise.count({
          where: { material: { lectureId } },
        }),
      ).toBe(0);
    });
    it("GETs and staff/preview visits do not write; mounted student visits are idempotent", async () => {
      const get = await measured(() =>
        explanation.read(student, { academyId, materialId, classId }),
      );
      expect(get.data.sideBody).toBe("<p>Reference HTML</p>");
      expect(get.data.outline.progress).toEqual({
        total: 1,
        started: 0,
        solved: 0,
      });
      expect(
        await client.studentMaterialView.count({ where: { materialId } }),
      ).toBe(0);
      expect(await explanation.view(author, { academyId, materialId })).toEqual(
        { viewed: false },
      );
      expect(
        await explanation.view(author, {
          academyId,
          materialId,
          preview: true,
        }),
      ).toEqual({ viewed: false });
      await expect(
        explanation.view(student, { academyId, materialId, preview: true }),
      ).rejects.toMatchObject({ status: 403 });
      const write = await measured(() =>
        explanation.view(student, { academyId, materialId, classId }),
      );
      const first = await client.studentMaterialView.findUniqueOrThrow({
        where: { userId_materialId: { userId: readerId, materialId } },
      });
      await explanation.view(student, { academyId, materialId, classId });
      expect(
        await client.studentMaterialView.count({ where: { materialId } }),
      ).toBe(1);
      expect(
        (
          await client.studentMaterialView.findUniqueOrThrow({
            where: { userId_materialId: { userId: readerId, materialId } },
          })
        ).firstViewedAt,
      ).toEqual(first.firstViewedAt);
      const read = await explanation.read(student, {
        academyId,
        materialId,
        classId,
      });
      expect(read.outline.progress).toEqual({
        total: 1,
        started: 1,
        solved: 1,
      });
      expect(read.outline.modules[0].lectures[0].explanations?.[0].status).toBe(
        "SOLVED",
      );
      expect(
        await client.studentExerciseProgress.count({
          where: { userId: readerId },
        }),
      ).toBe(0);
      console.info(
        `WEB_SQL studentGET=${get.statements} mountedVisit=${write.statements}`,
      );
      expect(get.statements).toBe(6);
      expect(write.statements).toBe(4);
    });
    it("keeps outline reads bounded and coding denominators unchanged", async () => {
      const course = await client.course.findUniqueOrThrow({
        where: { id: courseId },
      });
      const one = await measured(async () =>
        outlines.outlineFor(
          await withCurriculum(db, course),
          readerId,
          classId,
        ),
      );
      await client.material.createMany({
        data: Array.from({ length: 26 }, (_, i) => ({
          id: randomUUID(),
          lectureId,
          title: `Page ${i + 2}`,
          type: "EXPLANATION" as const,
          isVisible: true,
          position: i + 2,
        })),
      });
      const many = await measured(async () =>
        outlines.outlineFor(
          await withCurriculum(db, course),
          readerId,
          classId,
        ),
      );
      expect(many.data.progress).toEqual({ total: 27, started: 1, solved: 1 });
      expect(one.statements).toBe(2);
      expect(many.statements).toBe(2);
      for (const language of ["PYTHON", "C_CPP"] as const) {
        const coding = await outlines.outlineFor(
          await withCurriculum(db, { ...course, language }),
          readerId,
          classId,
        );
        expect(coding.progress).toEqual({ total: 0, started: 0, solved: 0 });
      }
      console.info(`WEB_SQL outline=${one.statements}/${many.statements}`);
    });
    it("reads teacher reports in bounded statements and denies other classes", async () => {
      const base = { courseId, userIds: [readerId], classId };
      const materials = await measured(() => repository.readingMaterials(base));
      expect(materials.statements).toBe(1);
      expect(materials.data).toHaveLength(27);
      const students = await measured(() =>
        repository.readingStudents({
          ...base,
          materialIds: materials.data.map((m) => m.materialId),
        }),
      );
      expect(students.statements).toBe(1);
      expect(students.data[0].viewed).toBe(1);
      const rows = await reports.readingProgress(teacher, {
        academyId,
        classId,
        courseId,
        lens: "students",
      });
      expect(rows.students[0]).toMatchObject({ viewed: 1, total: 27 });
      const members = await measured(() =>
        repository.readingMaterialStudents({
          academyId,
          classId,
          materialId,
          q: "Web",
          filter: "viewed",
          page: 1,
          courseIds: [courseId],
          students: [
            {
              userId: readerId,
              membershipId: randomUUID(),
              displayName: "Web reader",
            },
          ],
        }),
      );
      expect(members.statements).toBe(1);
      expect(members.data!.total).toBe(1);
      expect(members.data!.rows[0].firstViewedAt).toBeTruthy();
      const report = await reports.readingMaterialStudents(teacher, {
        academyId,
        classId,
        materialId,
        q: "",
        filter: "all",
        page: 1,
      });
      expect(report.rows).toHaveLength(1);
      const empty = await reports.readingMaterialStudents(teacher, {
        academyId,
        classId,
        materialId,
        q: "",
        filter: "notViewed",
        page: 1,
      });
      expect(empty.total).toBe(0);
      await expect(
        reports.readingProgress(teacher, {
          academyId,
          classId: randomUUID(),
          lens: "students",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        reports.readingMaterialStudents(teacher, {
          academyId,
          classId,
          materialId: randomUUID(),
          q: "",
          filter: "all",
          page: 1,
        }),
      ).rejects.toMatchObject({ status: 404 });
      console.info(
        `WEB_SQL teacherMaterials=${materials.statements} teacherStudents=${students.statements} materialStudents=${members.statements}`,
      );
    });
    it("includes unscored quizzes and videos in Web completion and keeps quiz stats current", async () => {
      const quiz = await client.material.create({
        data: {
          lectureId,
          title: "HTML quiz",
          type: "MULTIPLE_CHOICE",
          position: 28,
          isVisible: true,
          manualMaterial: {
            create: { description: "Quiz", includeInScore: false },
          },
        },
      });
      const asset = await client.videoAsset.create({
        data: {
          academyId,
          courseId,
          lectureId,
          requestKey: randomUUID(),
          objectKey: randomUUID(),
          uploaderUserId: authorId,
          filename: "result.mp4",
          byteSize: 100n,
          durationMs: 10000,
          state: "READY",
        },
      });
      const video = await client.material.create({
        data: {
          lectureId,
          title: "Result video",
          type: "VIDEO_LESSON",
          position: 29,
          isVisible: true,
          videoLesson: {
            create: {
              assetId: asset.id,
              requestKey: randomUUID(),
              includeInScore: false,
            },
          },
        },
      });
      const attempt = await client.manualSubmission.create({
        data: {
          materialId: quiz.id,
          userId: readerId,
          classId,
          files: {},
          profile: {},
          revision: 1,
          maximumHundredths: 10000,
          includeInScore: false,
          requestKey: randomUUID(),
          multipleChoiceAssessment: {
            create: {
              definition: {},
              selectedOptionIds: [],
              displayOrder: [],
              verdict: "CORRECT",
              completed: true,
              scoreHundredths: 10000,
            },
          },
        },
      });
      await client.videoWatchProgress.create({
        data: {
          materialId: video.id,
          assetId: asset.id,
          userId: readerId,
          classId,
          sessionId: randomUUID(),
          completed: true,
          thresholdBasisPoints: 9000,
          maximumHundredths: 10000,
        },
      });
      const course = await client.course.findUniqueOrThrow({
        where: { id: courseId },
      });
      const refreshed = await measured(async () => outlines.outlineFor(await withCurriculum(db, course), readerId, classId));
      expect(refreshed.statements).toBe(7);
      expect(refreshed.data.progress).toEqual({ total: 29, started: 3, solved: 3 });
      console.info(`WEB_SQL mixedOutlineRefresh=${refreshed.statements}`);
      const quizStats = await measured(() =>
        repository.readingQuizzes({
          userIds: [readerId],
          materialIds: [quiz.id],
          classId,
        }),
      );
      expect(quizStats.statements).toBe(1);
      expect(quizStats.data[0].correct).toBe(1);
      const report = await reports.readingProgress(teacher, {
        academyId,
        classId,
        courseId,
        lens: "students",
      });
      expect(report.students[0]).toMatchObject({
        total: 29,
        viewed: 3,
        quizCorrect: 1,
        quizTotal: 1,
      });
      await client.manualReview.create({
        data: {
          submissionId: attempt.id,
          reviewerId: authorId,
          version: 1,
          scoreHundredths: 0,
          completed: false,
          feedback: "Review correction",
        },
      });
      expect(
        (
          await reports.readingProgress(teacher, {
            academyId,
            classId,
            courseId,
            lens: "students",
          })
        ).students[0],
      ).toMatchObject({ viewed: 2, quizCorrect: 0 });
      console.info(`WEB_SQL teacherQuizResults=${quizStats.statements}`);
    });
    it("records main PDFs only and refuses supplementary documents", async () => {
      const asset = await client.pdfAsset.create({
        data: {
          academyId,
          courseId,
          lectureId,
          uploaderUserId: authorId,
          objectKey: randomUUID(),
          originalFilename: "slides.pdf",
          byteSize: 100,
          checksumSha256: randomUUID(),
          pageCount: 1,
          state: "READY",
        },
      });
      const main = await client.material.create({
        data: {
          lectureId,
          title: "Slides",
          type: "PDF_DOCUMENT",
          position: 30,
          isVisible: true,
          pdfDocument: { create: { assetId: asset.id, placement: "MAIN" } },
        },
      });
      const supplementary = await client.material.create({
        data: {
          lectureId,
          title: "Resource",
          type: "PDF_DOCUMENT",
          position: 31,
          isVisible: true,
          pdfDocument: {
            create: { assetId: asset.id, placement: "SUPPLEMENTARY" },
          },
        },
      });
      await explanation.view(student, {
        academyId,
        materialId: main.id,
        classId,
      });
      await client.pdfDocument.update({ where: { materialId: main.id }, data: { placement: 'BOTH' } });
      await explanation.view(student, { academyId, materialId: main.id, classId });
      const outline = await outlines.outlineForCourse(courseId, academyId, readerId);
      expect(outline?.progress.total).toBe(30);
      expect(outline?.modules[0].lectures[0].documents?.find(d => d.materialId === main.id)?.status).toBe('SOLVED');
      const report = await reports.readingMaterialStudents(teacher, { academyId, classId, materialId: main.id, q: '', filter: 'viewed', page: 1 });
      expect(report.total).toBe(1);
      await expect(
        explanation.view(student, {
          academyId,
          materialId: supplementary.id,
          classId,
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        await client.studentMaterialView.count({
          where: { userId: readerId, materialId: main.id },
        }),
      ).toBe(1);
    });
    it("sanitizes the side body and enforces image ownership, revision and visibility for both panes", async () => {
      const doc = await explanation.authorDocument(author, {
        academyId,
        materialId,
      });
      await expect(
        explanation.save(author, {
          academyId,
          courseId,
          lectureId,
          materialId,
          expectedRevision: doc.revision,
          title: doc.title,
          body: doc.body,
          sideBody: `<img src="cove-asset:${randomUUID()}">`,
          isVisible: true,
        }),
      ).rejects.toMatchObject({ code: "CONTENT_VALIDATION_FAILED" });
      await explanation.save(author, {
        academyId,
        courseId,
        lectureId,
        materialId,
        expectedRevision: doc.revision,
        title: doc.title,
        body: doc.body,
        sideBody: '<p onclick="bad()">Safe</p><script>bad()</script>',
        isVisible: true,
      });
      expect(
        (await explanation.authorDocument(author, { academyId, materialId }))
          .sideBody,
      ).toBe("<p>Safe</p>");
      await expect(
        explanation.save(author, {
          academyId,
          courseId,
          lectureId,
          materialId,
          expectedRevision: doc.revision,
          title: doc.title,
          body: doc.body,
          sideBody: "<p>Stale</p>",
          isVisible: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      await client.lecture.update({
        where: { id: lectureId },
        data: { isVisible: false },
      });
      await expect(
        explanation.view(student, { academyId, materialId, classId }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("counts short-answer quizzes using current class attempts and reviews in one statement", async () => {
      await client.lecture.update({ where: { id: lectureId }, data: { isVisible: true } });
      const ids = Array.from({ length: 5 }, () => randomUUID());
      const [exact, regex, manual, pending] = ids;
      const definition = (gradingMode: "EXACT" | "REGEX" | "MANUAL") => ({
        version: 1, question: "Name the language", gradingMode,
        expectedAnswer: "HTML", pattern: "HTML", explanationEnabled: false, explanation: "",
      });
      await client.material.createMany({ data: ids.map((id, index) => ({
        id, lectureId, title: `Short answer ${index}`, type: "WRITTEN_RESPONSE", position: 40 + index, isVisible: true,
      })) });
      await client.manualMaterial.createMany({ data: ids.map((materialId, index) => ({
        materialId, description: "Short quiz", shortAnswer: definition(index === 2 ? "MANUAL" : index === 1 ? "REGEX" : "EXACT"),
      })) });
      const otherClass = await client.class.create({ data: { academyId, name: "Another quiz class", createdByUserId: authorId } });
      const attemptIds = Array.from({ length: 6 }, () => randomUUID());
      const now = Date.now();
      await client.manualSubmission.createMany({ data: [exact, regex, regex, manual, pending, exact].map((materialId, index) => ({
        id: attemptIds[index], materialId, userId: readerId, classId: index === 5 ? otherClass.id : classId,
        files: {}, answer: "HTML", profile: {}, revision: 1, maximumHundredths: 10000,
        includeInScore: false, requestKey: randomUUID(), createdAt: new Date(now + index * 1000),
      })) });
      await client.shortAnswerAssessment.createMany({ data: attemptIds.map((submissionId, index) => ({
        submissionId, definition: definition(index === 3 ? "MANUAL" : index === 1 || index === 2 ? "REGEX" : "EXACT"),
        status: index === 3 ? "MANUAL" : index === 4 ? "EVALUATING" : "GRADED",
        verdict: index === 3 || index === 4 ? null : index === 2 || index === 5 ? "INCORRECT" : "CORRECT",
        completed: index === 3 || index === 4 ? null : index !== 2 && index !== 5,
        scoreHundredths: index === 3 || index === 4 ? null : index === 2 || index === 5 ? 0 : 10000,
        evaluatedAt: index === 3 || index === 4 ? null : new Date(),
      })) });
      await client.manualReview.createMany({ data: [1, 2].map(version => ({
        submissionId: attemptIds[3], reviewerId: authorId, version,
        scoreHundredths: version === 2 ? 10000 : 0, completed: version === 2, feedback: "Latest review wins",
      })) });
      const scope = { materialIds: ids, userIds: [readerId], classId };
      const one = await measured(() => repository.readingQuizzes(scope));
      const many = await measured(() => repository.readingQuizzes({ ...scope, userIds: [readerId, teacherId, authorId] }));
      expect(one.statements).toBe(1);
      expect(many.statements).toBe(1);
      expect(one.data).toEqual(many.data);
      expect(one.data[0].correct).toBe(2); // exact + reviewed manual; latest regex is wrong
      const report = await reports.readingProgress(teacher, { academyId, classId, courseId, lens: "students" });
      expect(report.students[0]).toMatchObject({ quizCorrect: 2, quizTotal: 6 });
      await client.manualReview.create({ data: {
        submissionId: attemptIds[0], reviewerId: authorId, version: 1,
        scoreHundredths: 5000, completed: true, feedback: "Completed with partial credit",
      } });
      expect((await repository.readingQuizzes(scope))[0].correct).toBe(1);
      console.info(`WEB_SQL teacherMixedQuizResults=${one.statements}/${many.statements}`);
    });
  },
);
