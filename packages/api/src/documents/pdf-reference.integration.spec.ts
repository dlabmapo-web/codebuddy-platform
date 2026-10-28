import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { validatePdfReference } from './pdf-reference.js';

describe.skipIf(process.env.COVE_PDF_INTEGRATION !== '1')('PDF reference database integrity', () => {
  const courseId = randomUUID(), moduleId = randomUUID(), lectureId = randomUUID();
  const otherLectureId = randomUUID(), assetId = randomUUID(), pdfId = randomUUID(), exerciseId = randomUUID();
  const academyId = '20000000-0000-4000-8000-000000000001';
  let prisma: PrismaService;
  beforeAll(async () => {
    if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Development database only');
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    const author = await prisma.user.findUniqueOrThrow({ where: { username: 'cove-teamlead' } });
    await prisma.course.create({ data: { id: courseId, academyId, title: 'PDF reference integration ' + courseId, createdByUserId: author.id, isVisible: true,
      modules: { create: { id: moduleId, title: 'Chapter', externalKey: 'chapter', position: 1, isVisible: true,
        lectures: { create: [{ id: lectureId, title: 'Lecture', externalKey: 'lecture', position: 1, isVisible: true },
          { id: otherLectureId, title: 'Other', externalKey: 'other', position: 2, isVisible: true }] } } } } });
    await prisma.pdfAsset.create({ data: { id: assetId, academyId, courseId, lectureId, objectKey: 'integration/' + assetId,
      originalFilename: 'reference.pdf', byteSize: 123, pageCount: 3, checksumSha256: 'fixture', uploaderUserId: author.id, state: 'READY' } });
    await prisma.material.create({ data: { id: pdfId, lectureId, title: 'Theory', position: 2, type: 'PDF_DOCUMENT', isVisible: true,
      pdfDocument: { create: { assetId, placement: 'BOTH' } } } });
    await prisma.material.create({ data: { id: exerciseId, lectureId, title: 'Practice', position: 1, type: 'PROGRAMMING_EXERCISE', isVisible: true,
      programmingExercise: { create: { externalKey: 'practice', difficulty: 'EASY', referencePdfMaterialId: pdfId } } } });
  }, 30_000);
  afterAll(async () => {
    if (!prisma) return;
    await prisma.programmingExercise.updateMany({ where: { materialId: exerciseId }, data: { referencePdfMaterialId: null } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.pdfAsset.deleteMany({ where: { id: assetId } });
    await prisma.$disconnect();
  });

  it('accepts a same-lecture supplementary reference', async () => {
    await prisma.$transaction(tx => validatePdfReference(tx, { academyId, courseId, lectureId }, pdfId, true));
  });
  it('supports a reference in another lecture of the same course', async () => {
    await prisma.$transaction(tx => validatePdfReference(tx, { academyId, courseId, lectureId: otherLectureId }, pdfId, true));
  });
  it('refuses a cross-course, cross-academy, or missing document', async () => {
    for (const input of [{ academyId, courseId: randomUUID(), lectureId: otherLectureId }, { academyId: randomUUID(), courseId, lectureId }]) {
      await expect(prisma.$transaction(tx => validatePdfReference(tx, input, pdfId))).rejects.toMatchObject({ code: 'PDF_REFERENCE_INVALID' });
    }
    await expect(prisma.$transaction(tx => validatePdfReference(tx, { academyId, courseId, lectureId }, randomUUID()))).rejects.toMatchObject({ code: 'PDF_REFERENCE_INVALID' });
  });
  it('restricts deleting a referenced PDF at the database boundary', async () => {
    await expect(prisma.material.delete({ where: { id: pdfId } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await prisma.pdfDocument.count({ where: { materialId: pdfId } })).toBe(1);
  });
  it('preserves an existing link on an unrelated update and allows explicit detach', async () => {
    const changed = await prisma.programmingExercise.update({ where: { materialId: exerciseId }, data: { description: 'Updated statement' } });
    expect(changed.referencePdfMaterialId).toBe(pdfId);
    expect(changed.gradingRevision).toBe(1);
    await prisma.programmingExercise.update({ where: { materialId: exerciseId }, data: { referencePdfMaterialId: null } });
    await prisma.material.delete({ where: { id: pdfId } });
  });
});
