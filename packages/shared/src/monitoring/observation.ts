import { z } from 'zod';
import { collaborationPointerSchema, collaborationCursorSchema, collaborationSurfaceSchema } from './monitoring.js';
import { materialTypeSchema } from '../content/course.js';
import { navigatorPathSchema, workspaceNavigatorContextSchema } from '../content/learn.js';
import { sourceFilesSchema } from '../content/manual.js';
import { publicChoiceSchema } from '../content/multiple-choice.js';

export const observationEvents = {
  start: 'observation.start', stop: 'observation.stop', snapshot: 'observation.snapshot',
  publish: 'observation.publish', request: 'observation.request', indicator: 'observation.indicator',
  resync: 'observation.resync', awareness: 'observation.awareness',
} as const;
export function observationAccessEnded(code?: string) {
  return Boolean(code && ['MONITORING_ACCESS_DENIED', 'PERMISSION_DENIED', 'MONITORING_STUDENT_UNAVAILABLE', 'MONITORING_DISABLED'].includes(code));
}
export const observationVersion = 1;
export const observationScopeSchema = z.object({ academyId: z.uuid(), classId: z.uuid(), membershipId: z.uuid() });
export const observationStartSchema = observationScopeSchema.extend({ sessionId: z.uuid(), version: z.literal(observationVersion) });
export const observationWorkSchema = z.object({
  answer: z.string().max(10000).optional(), choices: z.array(z.uuid()).max(20).optional(),
  files: sourceFilesSchema.optional(), activeFile: z.string().max(128).optional(), entryPoint: z.string().max(128).optional(),
  execution: z.string().max(40).optional(), output: z.string().max(64000).optional(),
  // Actual Turtle output, never HTML/SVG or arbitrary image URLs.
  drawing: z.string().max(700000).regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/).nullable().optional(),
  pdfPage: z.number().int().min(1).max(100000).optional(),
  videoPosition: z.number().finite().min(0).max(604800).optional(),
  videoState: z.enum(['playing', 'paused', 'ended']).optional(),
}).strict();
export type ObservationWork = z.infer<typeof observationWorkSchema>;
export const observationPublishSchema = z.object({
  academyId: z.uuid(), classId: z.uuid(), materialId: z.uuid(), revision: z.number().int().nonnegative(),
  work: observationWorkSchema,
});
export const observationSnapshotSchema = observationScopeSchema.extend({
  materialId: z.uuid().nullable(), type: materialTypeSchema.nullable(), path: navigatorPathSchema.nullable(),
  state: z.enum(['SOLVING', 'ONLINE', 'IDLE', 'RECONNECTING', 'OFFLINE']),
  source: z.string().nullable(), revision: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  work: observationWorkSchema.nullable(), observedAt: z.iso.datetime(),
});
export type ObservationSnapshot = z.infer<typeof observationSnapshotSchema>;
export const observedMaterialSchema = z.object({
  materialId: z.uuid(), type: materialTypeSchema, title: z.string(), description: z.string(),
  files: sourceFilesSchema.optional(), hint: z.string().optional(), includeInScore: z.boolean().optional(), automaticallyGraded: z.boolean().optional(), entryPoint: z.string().optional(),
  question: z.string().nullable(), choice: publicChoiceSchema.nullable(),
  saved: observationWorkSchema.nullable(), savedAt: z.iso.datetime().nullable(),
  navigator: workspaceNavigatorContextSchema,
});
export type ObservedMaterial = z.infer<typeof observedMaterialSchema>;

// Awareness is ephemeral and travels separately from potentially large work snapshots.
export const observationAwarenessSchema = z.object({
  academyId: z.uuid(), classId: z.uuid(), materialId: z.uuid(),
  sequence: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  focus: collaborationSurfaceSchema.nullable(),
  pointer: collaborationPointerSchema.refine(value => !value.code).nullable(),
  editor: z.object({ file: z.string().min(1).max(128), fingerprint: z.string().min(3).max(40), cursor: collaborationCursorSchema,
    mouse: z.object({ line: z.number().int().min(1).max(10000000), column: z.number().int().min(1).max(10000000),
      offset: z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000) }).optional(),
    }).nullable(),
  }).nullable(),
}).strict();
export const observationAwarenessEventSchema = observationAwarenessSchema.extend({
  membershipId: z.uuid(), source: z.string().min(1).max(128), sentAt: z.number().finite(),
});
export type ObservationAwareness = z.infer<typeof observationAwarenessSchema>;
export type ObservationAwarenessEvent = z.infer<typeof observationAwarenessEventSchema>;
