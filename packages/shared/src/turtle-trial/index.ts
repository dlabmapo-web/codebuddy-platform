import { z } from 'zod';

export const turtleHelperVersion = 'cove-trial-v1';
export const turtleGrantSeconds = 7200;
export const turtleRunSeconds = 120;
export const turtleSourceBytes = 65536;
export const turtleBodyBytes = 98304;
export const turtleStarterIds = ['drawing', 'race', 'free'] as const;
export type TurtleStarterId = typeof turtleStarterIds[number];
export const turtlePreamble = 'from random import *\nfrom shape import *\nfrom custom import *\n\n';
export const turtleStarters: Record<TurtleStarterId, string> = {
  drawing: turtlePreamble + '# 여기에 코드를 작성해 보세요. / Write your code here.\n',
  race: turtlePreamble + 'ReadyToRace()\n\n# 거북이를 움직여 보세요. / Move the turtles.\n',
  free: turtlePreamble,
};
export const turtleAccessSchema = z.object({ pin: z.string().trim().regex(/^[0-9]{6}$/) }).strict();
export const turtleRunSchema = z.object({
  source: z.string().refine(s => new TextEncoder().encode(s).length <= turtleSourceBytes, 'Source exceeds 64 KiB'),
  starterId: z.enum(turtleStarterIds),
  helperVersion: z.literal(turtleHelperVersion),
  requestKey: z.uuid(),
}).strict();
export type TurtleRunInput = z.infer<typeof turtleRunSchema>;
export type TurtleSession = {
  id: string; state: string; output: string; token: string; displayUrl: string;
  expiresAt: number; startedAt?: number; endedAt?: number; exitCode?: number;
};
export type TurtleBootstrap = {
  expiresAt: number; helperVersion: string; starters: typeof turtleStarters;
  session: TurtleSession | null;
};
export const turtleActiveStates = ['QUEUED', 'STARTING', 'RUNNING', 'WAITING_INPUT', 'DISPLAYING'];
export function turtleRunning(session: TurtleSession | null): boolean {
  return !!session && turtleActiveStates.includes(session.state);
}
export * from './bundle.js';
