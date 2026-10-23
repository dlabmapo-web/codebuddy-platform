import { createHash } from 'node:crypto';
import { z } from 'zod';
import { manualConfigSchema } from '@cove/shared';

export const turtleConversionManifest = z.object({
  version: z.literal(1),
  academyId: z.uuid(),
  runtimeVersion: z.string().min(1),
  entries: z.array(z.object({
    materialId: z.uuid(), courseId: z.uuid(), lectureId: z.uuid(),
    externalKey: z.string().min(1),
    sourceReference: z.url(),
    reason: z.string().min(10),
    assessment: z.object({ includeInScore: z.boolean(), submitEnabled: z.boolean() }).strict(),
    // Deliberate acknowledgment: old attempts remain programming attempts;
    // they are never copied into manual submissions or awarded new points.
    historyPolicy: z.literal('retain-programming'),
    config: manualConfigSchema,
  }).strict()).min(1).max(100),
}).strict().superRefine((value, ctx) => {
  const ids = value.entries.map(entry => entry.materialId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate material mapping' });
  for (const entry of value.entries) {
    if (entry.config.multipleChoice || entry.config.shortAnswer ||
        !Object.hasOwn(entry.config.files, entry.config.entryPoint) ||
        (entry.config.solutionFiles && !Object.hasOwn(entry.config.solutionFiles, entry.config.entryPoint)) ||
        entry.assessment.includeInScore !== entry.config.includeInScore ||
        entry.assessment.submitEnabled !== entry.config.submitEnabled)
      ctx.addIssue({ code: 'custom', message: 'Invalid Turtle entry point or assessment mapping' });
  }
});
export type TurtleConversionManifest = z.infer<typeof turtleConversionManifest>;
export const conversionFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function conversionBlockers(entry: TurtleConversionManifest['entries'][number], row: {
  id: string; lectureId: string; type: string; manualMaterial: unknown;
  programmingExercise: { externalKey: string; quiz: unknown } | null;
  lecture: { courseModule: { courseId: string; course: { academyId: string } } };
}, academyId: string, pendingSubmissions: number) {
  const blockers: string[] = [];
  if (row.id !== entry.materialId || row.lectureId !== entry.lectureId || row.lecture.courseModule.courseId !== entry.courseId || row.lecture.courseModule.course.academyId !== academyId) blockers.push('Scope mismatch');
  if (row.type !== 'PROGRAMMING_EXERCISE' || !row.programmingExercise || row.manualMaterial) blockers.push('Expected an unconverted programming exercise');
  if (row.programmingExercise?.externalKey !== entry.externalKey) blockers.push('Source identifier mismatch');
  if (row.programmingExercise?.quiz) blockers.push('A quiz cannot be converted into a Turtle activity');
  if (pendingSubmissions) blockers.push('Wait for all pending programming submissions to finish');
  return blockers;
}
