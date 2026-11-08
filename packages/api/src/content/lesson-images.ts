import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";

const reference = /\bsrc\s*=\s*["']cove-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi;

/** The private lesson images an HTML statement shows, each once. */
export function lessonImageIds(html: string | null | undefined): string[] {
  return [...new Set([...(html ?? "").matchAll(reference)].map((match) => match[1]!.toLowerCase()))];
}

/**
 * A statement may show only images uploaded to its own course, or ones it
 * already showed: a copied course keeps the source's references, and showing
 * an image is what grants reading it. All new references are checked in one
 * statement.
 */
export async function assertLessonImages(
  tx: Prisma.TransactionClient,
  input: { academyId: string; courseId: string; html: string; previousHtml?: string | null },
): Promise<void> {
  const previous = new Set(lessonImageIds(input.previousHtml));
  const added = lessonImageIds(input.html).filter((id) => !previous.has(id));
  if (added.length === 0) return;
  const owned = await tx.manualAsset.count({
    where: {
      id: { in: added },
      academyId: input.academyId,
      courseId: input.courseId,
      mimeType: { startsWith: "image/" },
    },
  });
  if (owned !== added.length) {
    // The shared error namespace is at its layout payload budget, so this
    // reuses the content validation code rather than adding one.
    throw new AppException("CONTENT_VALIDATION_FAILED", HttpStatus.BAD_REQUEST);
  }
}
