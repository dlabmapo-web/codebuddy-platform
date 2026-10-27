import { describe, expect, it, vi } from 'vitest';
import { assertPublishedPdfReferences, referencePdfMetadata, validatePdfReference } from './pdf-reference.js';

const target = { academyId: 'academy', courseId: 'course', lectureId: 'lecture' };
const pdf = () => ({ materialId: 'pdf', revision: 2, placement: 'BOTH',
  material: { title: 'Theory', isVisible: true, lecture: { isVisible: true, courseModule: { courseId: "course", isVisible: true } } },
  asset: { state: 'READY', originalFilename: 'theory.pdf', pageCount: 3, byteSize: 1234, objectKey: 'private-secret-key' } });

describe('PDF practice reference boundaries', () => {
  it('supports an unlinked exercise without a document read', async () => {
    const findFirst = vi.fn();
    await validatePdfReference({ pdfDocument: { findFirst } } as never, target, null);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('rejects quiz references before looking up documents', async () => {
    const findFirst = vi.fn();
    await expect(validatePdfReference({ pdfDocument: { findFirst } } as never, { ...target, quiz: {} }, 'pdf')).rejects.toMatchObject({ code: 'PDF_REFERENCE_INVALID' });
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('limits the candidate to its course, academy, READY asset and supplementary placement', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(validatePdfReference({ pdfDocument: { findFirst } } as never, target, 'other')).rejects.toMatchObject({ code: 'PDF_REFERENCE_INVALID' });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: {
      materialId: 'other', placement: { in: ['BOTH', 'SUPPLEMENTARY'] }, asset: { state: 'READY' },
      material: { lecture: { courseModule: { courseId: 'course', course: { academyId: 'academy' } } } },
    } }));
  });
  it('allows hidden references for drafts but refuses to publish them', async () => {
    const hidden = pdf(); hidden.material.isVisible = false;
    const tx = { pdfDocument: { findFirst: vi.fn().mockResolvedValue(hidden) } };
    await validatePdfReference(tx as never, target, 'pdf');
    await expect(validatePdfReference(tx as never, target, 'pdf', true)).rejects.toMatchObject({ code: 'PDF_REFERENCE_NOT_READY' });
  });
  it('does not publish through a hidden parent', async () => {
    const hidden = pdf(); hidden.material.lecture.courseModule.isVisible = false;
    await expect(validatePdfReference({ pdfDocument: { findFirst: vi.fn().mockResolvedValue(hidden) } } as never, target, 'pdf', true)).rejects.toMatchObject({ code: 'PDF_REFERENCE_NOT_READY' });
  });
  it('emits only safe reader metadata', () => {
    expect(referencePdfMetadata(pdf(), "course")).toEqual({ materialId: 'pdf', title: 'Theory', revision: 2,
      originalFilename: 'theory.pdf', pageCount: 3, byteSize: 1234 });
    for (const state of ['PENDING', 'DELETING', 'DELETED']) expect(referencePdfMetadata({ ...pdf(), asset: { ...pdf().asset, state } }, "course")).toBeNull();
    expect(referencePdfMetadata({ ...pdf(), placement: 'MAIN' }, 'course')).toBeNull();
    expect(referencePdfMetadata({ ...pdf(), material: { ...pdf().material, isVisible: false } }, "course")).toBeNull();
  });
  it('does not leak reference metadata across courses or hidden reference ancestors', () => {
    expect(referencePdfMetadata(pdf(), 'other-course')).toBeNull();
    const hiddenLecture = pdf(); hiddenLecture.material.lecture.isVisible = false;
    expect(referencePdfMetadata(hiddenLecture, 'course')).toBeNull();
    const hiddenModule = pdf(); hiddenModule.material.lecture.courseModule.isVisible = false;
    expect(referencePdfMetadata(hiddenModule, 'course')).toBeNull();
  });
  it('rolls back ancestor publication when a linked PDF is unavailable', async () => {
    const findMany = vi.fn().mockResolvedValue([{ referencePdf: { ...pdf(), material: { isVisible: false } } }]);
    await expect(assertPublishedPdfReferences({ programmingExercise: { findMany } } as never, 'course')).rejects.toMatchObject({ code: 'PDF_REFERENCE_NOT_READY' });
    findMany.mockResolvedValue([{ referencePdf: pdf() }]);
    await assertPublishedPdfReferences({ programmingExercise: { findMany } } as never, 'course');
  });
  it('checks the referenced PDF ancestors when publishing an exercise in another lecture', async () => {
    const hidden = pdf(); hidden.material.lecture.isVisible = false;
    const findMany = vi.fn().mockResolvedValue([{ referencePdf: hidden }]);
    await expect(assertPublishedPdfReferences({ programmingExercise: { findMany } } as never, 'course')).rejects.toMatchObject({ code: 'PDF_REFERENCE_NOT_READY' });
    const other = pdf(); other.material.lecture.courseModule.courseId = 'other-course';
    findMany.mockResolvedValue([{ referencePdf: other }]);
    await expect(assertPublishedPdfReferences({ programmingExercise: { findMany } } as never, 'course')).rejects.toMatchObject({ code: 'PDF_REFERENCE_NOT_READY' });
  });
});
