import { describe, it, expect } from 'vitest';
import { conversionBlockers, conversionFingerprint, turtleConversionManifest } from './core.js';
const uuid = (n: number) => `ee430000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const input = { version: 1, academyId: uuid(1), runtimeVersion: 'test-approved-runtime', entries: [{
  materialId: uuid(2), courseId: uuid(3), lectureId: uuid(4), externalKey: 'explicit-source-123',
  sourceReference: 'https://example.test/activity/123', reason: 'Audited Turtle activity mapped by source identifier.',
  historyPolicy: 'retain-programming', assessment: { includeInScore: false, submitEnabled: true },
  config: { files: { 'main.py': 'import turtle' }, includeInScore: false, submitEnabled: true },
}] };
describe('reviewed course Turtle conversion', () => {
  it('requires explicit source and consistent assessment/entry point mappings', () => {
    expect(turtleConversionManifest.safeParse(input).success).toBe(true);
    for (const patch of [{ config: { files: { 'other.py': '' } } }, { historyPolicy: 'delete' }, { assessment: { includeInScore: true, submitEnabled: true } }, { sourceReference: '' }]) {
      expect(turtleConversionManifest.safeParse({ ...input, entries: [{ ...input.entries[0], ...patch }] }).success).toBe(false);
    }
    expect(turtleConversionManifest.safeParse({ ...input, entries: [input.entries[0], input.entries[0]] }).success).toBe(false);
  });
  it('blocks scope drift, quizzes, repeated conversion and in-flight grading', () => {
    const manifest = turtleConversionManifest.parse(input); const entry = manifest.entries[0];
    const row = { id: entry.materialId, lectureId: entry.lectureId, type: 'PROGRAMMING_EXERCISE', manualMaterial: null,
      programmingExercise: { externalKey: entry.externalKey, quiz: null }, lecture: { courseModule: { courseId: entry.courseId, course: { academyId: manifest.academyId } } } };
    expect(conversionBlockers(entry, row, manifest.academyId, 0)).toEqual([]);
    expect(conversionBlockers(entry, row, uuid(99), 0)).toContain('Scope mismatch');
    expect(conversionBlockers(entry, { ...row, programmingExercise: { ...row.programmingExercise, quiz: {} } }, manifest.academyId, 0)).toContain('A quiz cannot be converted into a Turtle activity');
    expect(conversionBlockers(entry, { ...row, type: 'TURTLE_EXERCISE' }, manifest.academyId, 0)).not.toEqual([]);
    expect(conversionBlockers(entry, row, manifest.academyId, 1)).not.toEqual([]);
    expect(conversionFingerprint(input)).not.toBe(conversionFingerprint({ ...input, runtimeVersion: 'changed' }));
  });
});
