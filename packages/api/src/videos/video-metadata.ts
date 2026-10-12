import { videoMetadataSchema } from "@cove/shared";
import type { Prisma } from "../generated/prisma/client.js";
export function videoMetadata(lesson: {
  assetId: string;
  revision: number;
  placement: string;
  includeInScore: boolean;
  maximumHundredths: number;
  asset: {
    state: string;
    durationMs: number;
    filename: string;
    byteSize: bigint;
  };
}) {
  return videoMetadataSchema.parse({
    assetId: lesson.assetId,
    revision: lesson.revision,
    placement: lesson.placement,
    includeInScore: lesson.includeInScore,
    maximumHundredths: lesson.maximumHundredths,
    state: lesson.asset.state,
    durationMs: lesson.asset.durationMs,
    filename: lesson.asset.filename,
    byteSize: lesson.asset.byteSize.toString(),
  });
}
export function videoAssetSummary(a: {
  id: string;
  state: string;
  filename: string;
  byteSize: bigint;
  durationMs: number;
  failureCode: string | null;
  renditions: Prisma.JsonValue;
  outputs: Prisma.JsonValue;
}) {
  return {
    id: a.id,
    state: a.state,
    filename: a.filename,
    byteSize: a.byteSize.toString(),
    durationMs: a.durationMs,
    failureCode: a.failureCode,
    masterPath:
      (a.outputs as string[]).find((p) => p.endsWith("/master.m3u8")) ?? "",
    mp4Path:
      (a.outputs as string[]).find((p) => p.endsWith("/playback.mp4")) ?? "",
    posterPath:
      (a.outputs as string[]).find((p) => p.endsWith("/poster.jpg")) ?? "",
    renditions: a.renditions as Array<{ height: number; path: string }>,
  };
}
