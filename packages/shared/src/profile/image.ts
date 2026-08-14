import { z } from "zod";

/**
 * The profile-image contract, shared so the browser refuses a file before it
 * spends a minute uploading it and the server refuses the same file again
 * because the browser's word is not evidence.
 */

/** What a person may hand Cove. */
export const acceptedImageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AcceptedImageType = (typeof acceptedImageTypes)[number];

/**
 * SVG, GIF, HEIC, and animated images are out of the first release on
 * purpose. SVG is a script container, and the rest need decode paths whose
 * failure modes Cove has not tested on a photo of a child.
 */
export const maxUploadBytes = 5 * 1024 * 1024;

/** The normalized result: square, metadata-free, and small enough to inline. */
export const profileImageEdge = 512;
export const maxNormalizedBytes = 512 * 1024;

/** How long a delivered URL stays valid. Long enough to render a roster once. */
export const signedImageUrlSeconds = 60 * 60;

export const profileImageTargetSchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("GLOBAL") }),
  z.object({
    scope: z.literal("ACADEMY"),
    academyId: z.uuid(),
    /**
     * Absent means "my own membership in this academy". A manager naming a
     * membership is authorized against that academy, never against the row.
     */
    membershipId: z.uuid().optional(),
  }),
]);
export type ProfileImageTarget = z.infer<typeof profileImageTargetSchema>;

export const removeGlobalImageSchema = z.object({});
export const removeAcademyImageSchema = z.object({
  academyId: z.uuid(),
  membershipId: z.uuid().optional(),
});

/**
 * Magic-byte detection.
 *
 * The declared content type and the file extension are both attacker-supplied
 * and neither is consulted. This reads the first bytes of the buffer, which is
 * the only claim about a file that the file itself makes.
 */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return "image/png";
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (
    riff.every((byte, index) => bytes[index] === byte) &&
    webp.every((byte, index) => bytes[index + 8] === byte)
  ) {
    return "image/webp";
  }
  return null;
}

/**
 * Whether a WebP container declares itself animated.
 *
 * Read from the container rather than from a decoder: sharp opens only the
 * first frame unless it is asked to do otherwise, so an animated file would
 * otherwise be silently flattened into a still portrait of frame one. Refusing
 * is the honest answer — the person chose a moving image and Cove does not
 * store one.
 *
 * The layout is fixed by the WebP specification: `RIFF`, four size bytes,
 * `WEBP`, then a chunk. An extended file starts with `VP8X`, whose first flag
 * byte carries the animation bit.
 */
export function isAnimatedWebp(bytes: Uint8Array): boolean {
  if (sniffImageType(bytes) !== "image/webp") return false;
  if (bytes.length < 21) return false;
  const extended = [0x56, 0x50, 0x38, 0x58]; // "VP8X"
  if (!extended.every((byte, index) => bytes[index + 12] === byte)) return false;
  const animationFlag = 0x02;
  return ((bytes[20] ?? 0) & animationFlag) !== 0;
}
