import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import { previewCurriculumInclude, visibleCurriculumInclude } from "./curriculum-outline.service.js";
import { readCurricula } from "./curriculum-read.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;
/** Order-sensitive serialization: the rebuilt objects must match key for key. */
const exact = (value: unknown) => JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? `bigint:${v}` : v));
class Rollback extends Error {}

describe.skipIf(!databaseUrl)("one-statement curriculum read matches the Prisma include", () => {
  let prisma: PrismaService;
  beforeAll(() => {
    const url = new URL(databaseUrl!);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Use a disposable loopback database");
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: databaseUrl }));
  });
  afterAll(async () => { await prisma?.$disconnect(); });

  it("returns the same hierarchy, filters, order, types and keys for visible and preview reads", async () => {
    const results: Array<{ preview: boolean; prisma: string; read: string; prismaValue: unknown; readValue: unknown }> = [];
    await prisma.$transaction(async (tx) => {
      const run = randomUUID().slice(0, 8);
      const user = await tx.user.create({ data: { authUserId: randomUUID(), username: `curriculum_${run}`, displayName: "Author", status: "ACTIVE", platformRole: "USER" } });
      const org = await tx.organization.create({ data: { name: "Curriculum parity", slug: `curriculum-${run}` } });
      const academy = await tx.academy.create({ data: { organizationId: org.id, name: "Curriculum parity", slug: `curriculum-${run}` } });
      const course = (title: string) => tx.course.create({ data: { academyId: academy.id, title, createdByUserId: user.id, isVisible: true } });
      const [full, empty, hidden] = [await course("Full"), await course("Empty"), await course("Hidden only")];
      let key = 0;
      const moduleOf = (courseId: string, position: number, isVisible: boolean) =>
        tx.courseModule.create({ data: { courseId, title: `Module ${++key}`, externalKey: `m-${run}-${key}`, position, isVisible } });
      const lectureOf = (courseModuleId: string, position: number, isVisible: boolean) =>
        tx.lecture.create({ data: { courseModuleId, title: `Lecture ${++key}`, externalKey: `l-${run}-${key}`, position, isVisible } });
      const materialOf = (lectureId: string, type: Prisma.MaterialCreateInput["type"], position: number, isVisible: boolean) =>
        tx.material.create({ data: { lectureId, type, title: `Material ${++key}`, position, isVisible } });

      // Created out of position order, so ordering is exercised; one module hidden.
      const first = await moduleOf(full.id, 2, true), tied = await moduleOf(full.id, 1, true), hiddenModule = await moduleOf(full.id, 3, false);
      const lecture = await lectureOf(first.id, 2, true), earlier = await lectureOf(first.id, 1, true), hiddenLecture = await lectureOf(first.id, 3, false);
      await lectureOf(tied.id, 1, true); // an empty lecture
      await materialOf(hiddenLecture.id, "PROGRAMMING_EXERCISE", 1, true);
      await materialOf((await lectureOf(hiddenModule.id, 1, true)).id, "PROGRAMMING_EXERCISE", 1, true);

      const code = await materialOf(lecture.id, "PROGRAMMING_EXERCISE", 4, true);
      const manual = await materialOf(lecture.id, "WRITTEN_RESPONSE", 3, true);
      const video = await materialOf(lecture.id, "VIDEO_LESSON", 1, true);
      const pdf = await materialOf(lecture.id, "PDF_DOCUMENT", 2, true);
      await materialOf(lecture.id, "PROGRAMMING_EXERCISE", 5, false); // hidden material
      await materialOf(earlier.id, "TURTLE_EXERCISE", 1, true); // no detail row at all
      const pdfAsset = await tx.pdfAsset.create({ data: { objectKey: `pdfs/${run}`, originalFilename: "notes.pdf", byteSize: 12_345, checksumSha256: "0".repeat(64), pageCount: 7, uploaderUserId: user.id, academyId: academy.id, courseId: full.id, lectureId: lecture.id, state: "READY" } });
      await tx.pdfDocument.create({ data: { materialId: pdf.id, assetId: pdfAsset.id, placement: "BOTH" } });
      await tx.programmingExercise.create({ data: { materialId: code.id, externalKey: `pe-${run}`, difficulty: "MEDIUM", description: "Long text the outline must not read", starterCode: "print()", referencePdfMaterialId: pdf.id } });
      await tx.manualMaterial.create({ data: { materialId: manual.id, includeInScore: true, maximumHundredths: 2500, description: "Manual content the outline must not read" } });
      const videoAsset = await tx.videoAsset.create({ data: { requestKey: randomUUID(), objectKey: `videos/${run}`, uploaderUserId: user.id, academyId: academy.id, courseId: full.id, lectureId: lecture.id, filename: "lesson.mp4", byteSize: 4_999_999_999n, durationMs: 61_000, state: "READY" } });
      await tx.videoLesson.create({ data: { materialId: video.id, assetId: videoAsset.id, requestKey: randomUUID(), placement: "BOTH", includeInScore: true, maximumHundredths: 1000 } });
      await materialOf((await lectureOf((await moduleOf(hidden.id, 1, false)).id, 1, true)).id, "PROGRAMMING_EXERCISE", 1, true);

      const ids = [full.id, empty.id, hidden.id];
      for (const preview of [false, true]) {
        const courses = await tx.course.findMany({ where: { id: { in: ids } }, include: preview ? previewCurriculumInclude : visibleCurriculumInclude });
        const viaPrisma = Object.fromEntries(ids.map((id) => [id, courses.find((c) => c.id === id)!.modules]));
        const trees = await readCurricula(tx, ids, preview);
        const viaRead = Object.fromEntries(ids.map((id) => [id, trees.get(id)]));
        results.push({ preview, prisma: exact(viaPrisma), read: exact(viaRead), prismaValue: viaPrisma, readValue: viaRead });
      }
      throw new Rollback();
    }).catch((error) => { if (!(error instanceof Rollback)) throw error; });

    expect(results).toHaveLength(2);
    for (const { preview, prisma: expected, read, prismaValue, readValue } of results) {
      expect({ preview, value: readValue }).toEqual({ preview, value: prismaValue });
      expect({ preview, json: read }).toEqual({ preview, json: expected });
    }
    // The fixture really exercises hidden levels: preview sees more than students do.
    expect(results[1]!.read.length).toBeGreaterThan(results[0]!.read.length);
  });
});
