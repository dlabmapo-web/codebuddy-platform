import { oc } from '@orpc/contract';
import { z } from 'zod';

const academy = z.object({ academyId: z.uuid() }).strict();
export const academyTurtlePinMetadata = z.object({ version: z.uuid(), updatedAt: z.iso.datetime() }).strict();
export const academyTurtlePinState = z.object({ available: z.boolean(), current: academyTurtlePinMetadata.nullable() }).strict();
const revealed = z.object({ pin: z.string().regex(/^[0-9]{6}$/), current: academyTurtlePinMetadata }).strict();
export type AcademyTurtlePinState = z.infer<typeof academyTurtlePinState>;
export const academyTurtleContract = {
  state: oc.input(academy).output(academyTurtlePinState),
  reveal: oc.input(academy.extend({ expectedVersion: z.uuid() }).strict()).output(revealed),
  generate: oc.input(academy.extend({ expectedVersion: z.uuid().nullable() }).strict()).output(revealed),
};
