import { createHash, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import {
  isAnimatedWebp,
  maxNormalizedBytes,
  maxUploadBytes,
  profileImageEdge,
  signedImageUrlSeconds,
  sniffImageType,
  type ProfileImage,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";

/**
 * The private bucket. Not the public rich-text bucket: a public URL bypasses
 * read access control, and a Cove profile image can identify a minor.
 */
export const profileImageBucket = "profile-images";

export type NormalizedImage = {
  bytes: Buffer;
  contentType: "image/webp";
  width: number;
  height: number;
  checksumSha256: string;
};

export type StoredAsset = {
  id: string;
  bucket: string;
  objectKey: string;
};

/**
 * Bytes in, bytes out, and the signed URLs that deliver them.
 *
 * Everything about *who* may see an image lives in the profile services; this
 * one knows only how to normalize a file safely, put it somewhere immutable,
 * and hand back a URL that expires. Keeping the two apart is what stops a
 * future caller from getting a URL by asking politely.
 */
@Injectable()
export class ProfileMediaService {
  private readonly logger = new Logger(ProfileMediaService.name);
  private readonly client: SupabaseClient;
  private activeNormalizations = 0;
  private readonly maxActiveNormalizations = 4;

  constructor(config: ConfigService<ApiEnvironment, true>) {
    // The service-role key stays server-side. It bypasses storage RLS, which
    // is exactly why the browser never receives it and never uploads directly.
    this.client = createClient(
      config.get("SUPABASE_URL", { infer: true }),
      config.get("SUPABASE_SECRET_KEY", { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  /**
   * Validate and normalize an uploaded file.
   *
   * The declared MIME type and the filename are attacker-supplied and neither
   * is consulted: the format is read from the leading bytes, then the decoder
   * has to agree. The result is a square, metadata-free WebP — EXIF, and the
   * GPS coordinates of a child's home inside it, do not survive re-encoding.
   */
  async normalize(input: Buffer): Promise<NormalizedImage> {
    if (input.byteLength === 0) {
      throw new AppException("PROFILE_IMAGE_DECODE_FAILED");
    }
    if (input.byteLength > maxUploadBytes) {
      throw new AppException("PROFILE_IMAGE_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE);
    }
    // An animated WebP passes the magic-byte check and sharp would open only
    // its first frame, so it has to be caught in the container.
    if (!sniffImageType(input) || isAnimatedWebp(input)) {
      throw new AppException("PROFILE_IMAGE_TYPE_INVALID", HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    if (this.activeNormalizations >= this.maxActiveNormalizations) {
      throw new AppException("RATE_LIMITED", HttpStatus.TOO_MANY_REQUESTS);
    }
    this.activeNormalizations += 1;

    let bytes: Buffer;
    try {
      bytes = await sharp(input, { failOn: "error" })
        // No argument: orient from the EXIF tag, then drop it. A photo taken
        // sideways on a phone must not arrive sideways in a roster.
        .rotate()
        // Centre, not sharp's entropy-based `attention`. The browser preview
        // is a CSS `object-cover` square, which is a centre crop, and a server
        // that cropped somewhere else would make that preview a promise the
        // upload does not keep. A person choosing their own photo is a better
        // judge of what matters in it than an entropy heuristic.
        .resize(profileImageEdge, profileImageEdge, {
          fit: "cover",
          position: "centre",
        })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
    } catch (error) {
      if (error instanceof AppException) throw error;
      throw new AppException("PROFILE_IMAGE_DECODE_FAILED");
    } finally {
      this.activeNormalizations -= 1;
    }

    if (bytes.byteLength > maxNormalizedBytes) {
      throw new AppException("PROFILE_IMAGE_TOO_LARGE", HttpStatus.PAYLOAD_TOO_LARGE);
    }

    return {
      bytes,
      contentType: "image/webp",
      width: profileImageEdge,
      height: profileImageEdge,
      checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  }

  /**
   * Object keys carry business scope and an asset UUID.
   *
   * The UUID is what makes a key immutable: replacing a photo writes a new
   * object and repoints the database relation, so a cache never serves the old
   * picture under the new name and a failed upload never destroys the picture
   * already on the profile.
   */
  globalObjectKey(userId: string, assetId: string): string {
    return `global/${userId}/${assetId}.webp`;
  }

  academyObjectKey(
    academyId: string,
    membershipId: string,
    assetId: string,
  ): string {
    return `academy/${academyId}/${membershipId}/${assetId}.webp`;
  }

  /** Uploads to the private bucket. The caller writes the metadata row. */
  async upload(objectKey: string, image: NormalizedImage): Promise<void> {
    const { error } = await this.client.storage
      .from(profileImageBucket)
      .upload(objectKey, image.bytes, {
        contentType: image.contentType,
        // Keys are unique by construction, so an existing object means a UUID
        // collision or a retry of a request that already succeeded. Refusing
        // to overwrite keeps "immutable" true even then.
        upsert: false,
        cacheControl: `${signedImageUrlSeconds}`,
      });
    if (error) {
      this.logger.error(`profile image upload failed: ${error.message}`);
      throw new AppException(
        "PROFILE_IMAGE_STORAGE_FAILED",
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Best effort for an object whose metadata row remains unattached. */
  async discard(objectKey: string): Promise<void> {
    const { error } = await this.client.storage
      .from(profileImageBucket)
      .remove([objectKey]);
    if (error) {
      // The cleanup sweep finds the durable, unattached metadata row and
      // retries after the grace period.
      this.logger.warn(`orphan profile image left behind: ${objectKey}`);
    }
  }

  async remove(objectKeys: string[]): Promise<boolean> {
    if (objectKeys.length === 0) return true;
    const { error } = await this.client.storage
      .from(profileImageBucket)
      .remove(objectKeys);
    if (error) {
      this.logger.warn(`profile image delete failed: ${error.message}`);
      return false;
    }
    return true;
  }

  newAssetId(): string {
    return randomUUID();
  }

  /**
   * One authorized asset, as a short-lived URL.
   *
   * The caller has already decided the reader may see it. Nothing here checks
   * anything, which is why this method is never reachable from a router.
   */
  async sign(asset: StoredAsset): Promise<ProfileImage | null> {
    const [signed] = await this.signMany([asset]);
    return signed ?? null;
  }

  /**
   * The batch form, for a list that renders many people.
   *
   * A roster must not make one authorization request per row: that is a
   * response-time problem at 30 students and a rate-limit problem at 300.
   */
  async signMany(assets: StoredAsset[]): Promise<ProfileImage[]> {
    if (assets.length === 0) return [];
    const expiresAt = new Date(
      Date.now() + signedImageUrlSeconds * 1_000,
    ).toISOString();
    const { data, error } = await this.client.storage
      .from(profileImageBucket)
      .createSignedUrls(
        assets.map((asset) => asset.objectKey),
        signedImageUrlSeconds,
      );
    if (error || !data) {
      // A missing image is a degraded avatar, not a failed page: the fallback
      // chain ends in initials, which always render.
      this.logger.warn(`profile image signing failed: ${error?.message}`);
      return [];
    }

    const byKey = new Map(
      data
        .filter((entry) => entry.signedUrl && !entry.error)
        .map((entry) => [entry.path ?? "", entry.signedUrl]),
    );
    return assets.flatMap((asset) => {
      const url = byKey.get(asset.objectKey);
      return url ? [{ assetId: asset.id, url, expiresAt }] : [];
    });
  }
}
