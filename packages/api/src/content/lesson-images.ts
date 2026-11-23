import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";

const reference = /\bsrc\s*=\s*["']cove-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/gi;

/** The private lesson images an HTML statement shows, each once. */
export function lessonImageIds(...bodies: (string | null | undefined)[]): string[] {
  const html = bodies.filter(Boolean).join("\n");
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

/**
 * Hosts whose pictures are copied into our own storage when a statement is
 * saved (QA-006). Imported Elice, Jungol and Biko problems point at these, and
 * the pictures break when the original is deleted or the host stops allowing
 * other sites to show it — for Elice, at the latest when the contract ends.
 */
export const REMOTE_IMAGE_HOSTS: ReadonlySet<string> = new Set([
  "cdn-api.elice.io",
  "static.elice.io",
  "elicebackendstorage.blob.core.windows.net",
  "u.jungol.co.kr",
  "s.jungol.co.kr",
  "public-static.biko.kr",
]);

const imageTag = /<img\b[^>]*>/gi;
const srcAttribute = /(\bsrc\s*=\s*)(["'])(.*?)\2/i;

function decodeAttribute(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** A picture URL worth copying: HTTPS on an allowed host. */
export function copyableImageUrl(raw: string): URL | null {
  try {
    const url = new URL(decodeAttribute(raw.trim()));
    return url.protocol === "https:" && REMOTE_IMAGE_HOSTS.has(url.hostname.toLowerCase()) ? url : null;
  } catch {
    return null;
  }
}

/** The distinct allowed outside picture URLs an HTML statement shows. */
export function remoteImageSources(...bodies: (string | null | undefined)[]): string[] {
  const html = bodies.filter(Boolean).join("\n");
  const urls = new Set<string>();
  for (const tag of html.match(imageTag) ?? []) {
    const src = tag.match(srcAttribute)?.[3];
    const url = src ? copyableImageUrl(src) : null;
    if (url) urls.add(url.href);
  }
  return [...urls];
}

/**
 * Points copied pictures at their stored asset and keeps where they came from
 * in `data-source-url`, so a copy can always be traced and undone. Pictures
 * not in `assetIdByUrl` are left exactly as they were.
 */
export function rewriteRemoteImages(html: string, assetIdByUrl: ReadonlyMap<string, string>): string {
  if (assetIdByUrl.size === 0) return html;
  return html.replace(imageTag, (tag) => {
    const match = tag.match(srcAttribute);
    if (!match) return tag;
    const url = copyableImageUrl(match[3]!);
    const assetId = url ? assetIdByUrl.get(url.href) : undefined;
    if (!assetId) return tag;
    const source = match[3]!.replace(/"/g, "&quot;");
    const rewritten = tag.replace(srcAttribute, `$1$2cove-asset:${assetId}$2`);
    return /\bdata-source-url\s*=/i.test(rewritten)
      ? rewritten
      : rewritten.replace(/^<img\b/i, `<img data-source-url="${source}"`);
  });
}
