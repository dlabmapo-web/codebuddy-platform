import { z } from 'zod';
import { turtleHelperVersion, turtleStarterIds } from './constants.js';

export const turtleBrowserProfileId = 'cove-browser-turtle-v1' as const;
export const turtleBrowserRuntimeIdSchema = z.string().regex(/^brython-\d+\.\d+\.\d+-[a-f0-9]{20}$/);
export const turtleBrowserStartSchema = z.object({
  requestKey: z.uuid(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  starterId: z.enum(turtleStarterIds), helperVersion: z.literal(turtleHelperVersion),
  profile: z.literal(turtleBrowserProfileId),
}).strict();
export type TurtleBrowserStart = z.infer<typeof turtleBrowserStartSchema>;
export type TurtleBrowserProfile = {
  engine: 'browser'; profile: typeof turtleBrowserProfileId; protocol: 1;
  origin: string; runtimeId: string; helperVersion: typeof turtleHelperVersion;
};
export type TurtleBrowserRun = {
  engine: 'browser'; id: string; requestKey: string;
  state: 'ACTIVE' | 'STOPPED' | 'EXPIRED'; expiresAt: number;
  leaseUntil: number; leaseMs: number; profile: TurtleBrowserProfile;
};
