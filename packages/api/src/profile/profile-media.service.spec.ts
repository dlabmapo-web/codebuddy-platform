import { ConfigService } from "@nestjs/config";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { AppException } from "../common/app-exception.js";
import { ProfileMediaService } from "./profile-media.service.js";

/**
 * Real normalization against real bytes. The decode path is the part of this
 * feature most likely to be handed something hostile, and a mocked sharp would
 * prove nothing about what it does with an animated WebP or an SVG.
 */
function service(): ProfileMediaService {
  const config = {
    get: (key: string) =>
      key === "SUPABASE_URL" ? "https://example.supabase.co" : "test-secret",
  } as unknown as ConfigService<never, true>;
  return new ProfileMediaService(config);
}

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 30, g: 100, b: 220 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("ProfileMediaService.normalize", () => {
  it("produces a 512-square WebP from a rectangular JPEG", async () => {
    const result = await service().normalize(await jpeg(1200, 400));

    expect(result.contentType).toBe("image/webp");
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);

    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  // The browser preview is a CSS `object-cover` square, which crops from the
  // centre. A server that cropped anywhere else — sharp's entropy-based
  // `attention`, for instance — would show one square and store another.
  it("crops from the centre, matching the preview the picker showed", async () => {
    // Three vertical bands. The centre band is the only thing a centre crop of
    // a 3:1 image can contain; an entropy crop would drift to a boundary.
    const bands = await sharp({
      create: {
        width: 900,
        height: 300,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .composite([
        {
          input: {
            create: {
              width: 300,
              height: 300,
              channels: 3,
              background: { r: 0, g: 200, b: 0 },
            },
          },
          left: 300,
          top: 0,
        },
        {
          input: {
            create: {
              width: 300,
              height: 300,
              channels: 3,
              background: { r: 0, g: 0, b: 255 },
            },
          },
          left: 600,
          top: 0,
        },
      ])
      .png()
      .toBuffer();

    const result = await service().normalize(bands);
    const { data } = await sharp(result.bytes)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // The pixel at the very centre of the output.
    const middle = ((512 / 2) * 512 + 512 / 2) * 3;
    expect(data[middle]).toBeLessThan(60);
    expect(data[middle + 1]!).toBeGreaterThan(150);
    expect(data[middle + 2]!).toBeLessThan(60);
  });

  // EXIF is the reason the pipeline re-encodes rather than passing bytes
  // through: the tag Cove cares most about deleting is the one naming where a
  // child's photo was taken.
  it("does not carry EXIF through the re-encode", async () => {
    const withExif = await sharp({
      create: {
        width: 600,
        height: 600,
        channels: 3,
        background: { r: 10, g: 10, b: 10 },
      },
    })
      .withExif({ IFD0: { Copyright: "cove", Software: "test" } })
      .jpeg()
      .toBuffer();

    const result = await service().normalize(withExif);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("refuses an SVG however it is labelled", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
    );
    await expect(service().normalize(svg)).rejects.toMatchObject({
      code: "PROFILE_IMAGE_TYPE_INVALID",
    });
  });

  // A container-level check, because sharp opens only the first frame unless
  // told otherwise: an animated file would otherwise become a still portrait
  // of frame one rather than a rejection.
  it("refuses an animated WebP rather than silently flattening it", async () => {
    const still = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .webp()
      .toBuffer();

    // A minimal extended WebP header with the animation flag set, followed by
    // the still image's payload. Hand-built because sharp will not emit one.
    const animated = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WEBP"),
      Buffer.from("VP8X"),
      Buffer.from([10, 0, 0, 0]),
      Buffer.from([0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      still.subarray(12),
    ]);

    await expect(service().normalize(animated)).rejects.toMatchObject({
      code: "PROFILE_IMAGE_TYPE_INVALID",
    });
  });

  it("refuses corrupt bytes that begin with a valid signature", async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64, 0x41),
    ]);
    await expect(service().normalize(corrupt)).rejects.toMatchObject({
      code: "PROFILE_IMAGE_DECODE_FAILED",
    });
  });

  it("refuses an empty body", async () => {
    await expect(service().normalize(Buffer.alloc(0))).rejects.toBeInstanceOf(
      AppException,
    );
  });
});

describe("object keys", () => {
  // Immutable and scoped: the UUID is what lets a replacement be a new object
  // rather than an overwrite, so a cache can never serve the old photo.
  it("scope a key by business identity and asset id", () => {
    const media = service();
    expect(media.globalObjectKey("user-1", "asset-1")).toBe(
      "global/user-1/asset-1.webp",
    );
    expect(media.academyObjectKey("academy-1", "membership-1", "asset-1")).toBe(
      "academy/academy-1/membership-1/asset-1.webp",
    );
  });
});
