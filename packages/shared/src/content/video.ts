import { z } from "zod";
export const videoMaxBytes = 5_000_000_000;
export const videoMaxDurationMs = 21_600_000;
export const videoExtensions = [
  "mxf",
  "gxf",
  "ps",
  "mp4",
  "mpg",
  "wmv",
  "avi",
  "mkv",
  "mov",
  "flv",
  "ts",
  "asf",
  "3gp",
] as const;
export const videoTargetSchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
  lectureId: z.uuid(),
});
export const videoReadSchema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid(),
  classId: z.uuid().optional(),
  preview: z.boolean().default(false),
  resource: z.boolean().default(false),
});
export const videoCaptionSchema = z
  .object({
    id: z.uuid(),
    language: z
      .string()
      .min(2)
      .max(35)
      .refine((s) => {
        try {
          return Intl.getCanonicalLocales(s).length === 1;
        } catch {
          return false;
        }
      }),
    label: z.string().trim().min(1).max(80),
    path: z.string().regex(/^captions\/[0-9a-f-]+\.vtt$/),
  })
  .strict();
export const videoConfigSchema = z.object({
  assetId: z.uuid(),
  revision: z.number().int().positive().default(1),
  description: z.string().max(100000).default(""),
  placement: z.enum(["MAIN", "SUPPLEMENTARY", "BOTH"]).default("MAIN"),
  includeInScore: z.boolean().default(false),
  maximumHundredths: z.number().int().min(100).max(1000000).default(10000),
  thresholdBasisPoints: z.number().int().min(100).max(10000).default(9000),
  assets: z
    .array(
      z.object({
        assetId: z.uuid(),
        name: z.string(),
        byteSize: z.number().int().positive().max(5242880),
      }),
    )
    .max(50)
    .default([]),
  captions: z.array(videoCaptionSchema).max(10).default([]),
});
export const saveVideoSchema = videoTargetSchema
  .extend(videoConfigSchema.shape)
  .extend({
    materialId: z.uuid().optional(),
    title: z.string().trim().min(1).max(128),
    requestKey: z.uuid(),
  })
  .superRefine((v, c) => {
    if (v.placement === "SUPPLEMENTARY" && v.includeInScore)
      c.addIssue({
        code: "custom",
        message: "Supplementary-only video is excluded from score",
      });
    if (
      new Set(v.captions.map((x) => x.language.toLowerCase())).size !==
      v.captions.length
    )
      c.addIssue({
        code: "custom",
        message: "Caption languages must be unique",
      });
  });
export type SaveVideo = z.infer<typeof saveVideoSchema>;
export const reserveVideoSchema = videoTargetSchema.extend({
  filename: z.string().min(1).max(255),
  byteSize: z
    .string()
    .regex(/^\d+$/)
    .refine((v) => BigInt(v) > 0n && BigInt(v) <= BigInt(videoMaxBytes)),
  requestKey: z.uuid(),
});
export const videoCheckpointSchema = videoReadSchema
  .omit({ preview: true, resource: true })
  .required({ classId: true })
  .extend({
    assetId: z.uuid(),
    sessionId: z.uuid(),
    sequence: z.number().int().positive(),
    elapsedMs: z.number().int().min(0).max(2147483647),
    positionMs: z.number().int().min(0).max(videoMaxDurationMs),
    rate: z
      .number()
      .refine((v) => [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(v)),
    playing: z.boolean(),
    seeking: z.boolean().default(false),
  })
  .strict();
export type VideoCheckpoint = z.infer<typeof videoCheckpointSchema>;
export type WatchedInterval = [number, number];
export function mergeWatchedIntervals(
  intervals: WatchedInterval[],
  next?: WatchedInterval,
): WatchedInterval[] {
  const ordered = [...intervals, ...(next ? [next] : [])]
    .filter(
      ([a, b]) => Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b > a,
    )
    .sort((a, b) => a[0] - b[0]);
  const result: WatchedInterval[] = [];
  for (const [a, b] of ordered) {
    const last = result.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else result.push([a, b]);
  }
  return result;
}
export function watchedMilliseconds(intervals: WatchedInterval[]) {
  return intervals.reduce((sum, [a, b]) => sum + b - a, 0);
}
export function creditVideoCheckpoint(input: {
  intervals: WatchedInterval[];
  previousMs: number;
  positionMs: number;
  elapsedMs: number;
  rate: number;
  playing: boolean;
  seeking: boolean;
  durationMs: number;
  creditEnabled: boolean;
}) {
  const position = Math.min(input.positionMs, input.durationMs),
    delta = position - input.previousMs;
  const valid =
    input.creditEnabled &&
    input.playing &&
    !input.seeking &&
    delta > 0 &&
    delta <= Math.max(0, input.elapsedMs) * input.rate + 2000 &&
    input.elapsedMs <= 60000;
  return {
    positionMs: position,
    intervals: mergeWatchedIntervals(
      input.intervals,
      valid ? [input.previousMs, position] : undefined,
    ),
  };
}
export type VideoProgress = {
  positionMs: number;
  watchedMs: number;
  completed: boolean;
  sessionId?: string;
  sequence: number;
};
export const videoMetadataSchema = z.object({
  assetId: z.uuid(),
  revision: z.number().int().positive(),
  placement: z.enum(["MAIN", "SUPPLEMENTARY", "BOTH"]),
  includeInScore: z.boolean(),
  maximumHundredths: z.number().int(),
  state: z.string(),
  durationMs: z.number().int(),
  filename: z.string(),
  byteSize: z.string(),
});
export type VideoAssetSummary = {
  id: string;
  state: string;
  filename: string;
  byteSize: string;
  durationMs: number;
  failureCode: string | null;
  masterPath: string;
  mp4Path: string;
  posterPath: string;
  renditions: Array<{ height: number; path: string }>;
};
export type VideoReadResult = {
  materialId: string;
  title: string;
  config: z.infer<typeof videoConfigSchema>;
  asset: VideoAssetSummary;
  classes: Array<{ classId: string; name: string }>;
  progress: VideoProgress | null;
  trackingAvailable: boolean;
  canTrack: boolean;
  canReview: boolean;
  course: { id: string; title: string };
  lecture: { id: string; title: string };
  materials: Array<{
    materialId: string;
    title: string;
    type: string;
    lectureId: string;
  }>;
  resources: Array<{ materialId: string; title: string; type: string }>;
};
