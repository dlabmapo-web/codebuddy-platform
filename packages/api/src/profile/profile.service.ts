import { HttpStatus, Injectable } from "@nestjs/common";
import {
  profileLocaleSchema,
  type MyProfileResponse,
  type ProfileLocale,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  profileImageBucket,
  ProfileMediaService,
} from "./profile-media.service.js";

const profileInclude = {
  avatarAsset: true,
  memberships: {
    include: { academy: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

/**
 * The global account.
 *
 * Nothing in this file is reachable by an academy manager. Design §7.1 keeps
 * identity, credentials, and personal preferences user-owned, because a Cove
 * account can belong to several academies and one of them editing the person's
 * name would rename them in all the others.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
    private readonly supabaseAuth: SupabaseAuthService,
  ) {}

  async getMe(identity: SupabaseIdentity): Promise<MyProfileResponse> {
    const user = await this.requireUser(identity);
    return this.present(user, identity);
  }

  async updateGlobalProfile(
    identity: SupabaseIdentity,
    input: {
      displayName: string | null;
      contactPhone: string | null;
      expectedUpdatedAt: string;
    },
  ): Promise<MyProfileResponse> {
    const user = await this.requireUser(identity);
    const result = await this.prisma.user.updateMany({
      where: { id: user.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        displayName: input.displayName,
        contactPhone: input.contactPhone,
      },
    });
    if (result.count !== 1) this.changed();
    return this.present(await this.requireUser(identity), identity);
  }

  async updatePreferences(
    identity: SupabaseIdentity,
    input: {
      preferredLocale: ProfileLocale;
      timezone: string | null;
      expectedUpdatedAt: string;
    },
  ): Promise<MyProfileResponse> {
    const user = await this.requireUser(identity);
    const result = await this.prisma.user.updateMany({
      where: { id: user.id, updatedAt: new Date(input.expectedUpdatedAt) },
      data: {
        preferredLocale: input.preferredLocale,
        timezone: input.timezone,
      },
    });
    if (result.count !== 1) this.changed();
    return this.present(await this.requireUser(identity), identity);
  }

  /**
   * Replace the account's photo.
   *
   * The object is written before the relation moves, and the relation moves in
   * one transaction. If either step fails the previous image is still the one
   * on the profile — design §10.2 — so a person never ends up with no picture
   * because a storage call timed out.
   */
  async uploadImage(
    identity: SupabaseIdentity,
    file: Buffer,
  ): Promise<MyProfileResponse> {
    const user = await this.requireUser(identity);
    const image = await this.media.normalize(file);
    const assetId = this.media.newAssetId();
    const objectKey = this.media.globalObjectKey(user.id, assetId);
    // Persist the ownership metadata first. If storage succeeds but attaching
    // the asset fails, the cleanup sweep can now find this unattached row.
    await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        bucket: profileImageBucket,
        objectKey,
        purpose: "USER_AVATAR",
        uploaderUserId: user.id,
        contentType: image.contentType,
        sizeBytes: image.bytes.byteLength,
        width: image.width,
        height: image.height,
        checksumSha256: image.checksumSha256,
      },
    });
    await this.media.upload(objectKey, image);

    try {
      const supersededId = user.avatarAssetId;
      const updated = await this.prisma.$transaction(async (transaction) => {
        await transaction.user.update({
          where: { id: user.id },
          data: { avatarAssetId: assetId },
        });
        if (supersededId) {
          await transaction.mediaAsset.update({
            where: { id: supersededId },
            data: { supersededAt: new Date() },
          });
        }
        return transaction.user.findUniqueOrThrow({
          where: { id: user.id },
          include: profileInclude,
        });
      });
      return this.present(updated, identity);
    } catch (error) {
      // Nothing points at this object, so it is an orphan the moment the
      // transaction fails. Remove it now; the sweep is the backstop.
      await this.media.discard(objectKey);
      throw error;
    }
  }

  /**
   * Clears the relation first and lets the sweep delete the object.
   *
   * The order matters: a person who removes their photo expects it gone from
   * every page immediately, and a storage call that hangs must not be what
   * stands between them and that.
   */
  async removeImage(identity: SupabaseIdentity): Promise<MyProfileResponse> {
    const user = await this.requireUser(identity);
    if (!user.avatarAssetId) return this.present(user, identity);

    const supersededId = user.avatarAssetId;
    const updated = await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { avatarAssetId: null },
      });
      await transaction.mediaAsset.update({
        where: { id: supersededId },
        data: { supersededAt: new Date() },
      });
      return transaction.user.findUniqueOrThrow({
        where: { id: user.id },
        include: profileInclude,
      });
    });
    return this.present(updated, identity);
  }

  /** The row every profile operation starts from. */
  async requireUser(identity: SupabaseIdentity) {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      include: profileInclude,
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }
    return user;
  }

  /**
   * The concurrency check, in one place.
   *
   * A student and their manager can hold the same row open. Rejecting the
   * later save keeps the earlier one, and the browser keeps the draft — which
   * is strictly better than the alternative, where whoever pressed Save second
   * silently erases the other person's correction.
   */
  private changed(): never {
    throw new AppException("PROFILE_CHANGED", HttpStatus.CONFLICT);
  }

  private async present(
    user: Awaited<ReturnType<ProfileService["requireUser"]>>,
    identity: SupabaseIdentity,
  ): Promise<MyProfileResponse> {
    const image = user.avatarAsset
      ? await this.media.sign({
        id: user.avatarAsset.id,
        bucket: user.avatarAsset.bucket,
        objectKey: user.avatarAsset.objectKey,
      })
      : null;
    const identities = await this.supabaseAuth.describeIdentities(
      identity.authUserId,
    );

    return {
      profile: {
        userId: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        contactPhone: user.contactPhone,
        image,
        externalAvatarUrl: user.avatarUrl,
        platformRole: user.platformRole,
        status: user.status,
        // A locale written before the supported set changed must not break the
        // page; it degrades to Korean, which is what the column defaults to.
        preferredLocale: profileLocaleSchema.safeParse(user.preferredLocale)
          .data ?? "ko",
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      },
      security: {
        hasPasswordIdentity: identities.hasPasswordIdentity,
        connectedProviders: identities.providers,
        emailVerified: identity.emailVerified,
        // First release: Cove reports these rather than operating them, and
        // the page says so instead of rendering a button that does nothing.
        sessionManagementAvailable: false,
        phoneVerificationAvailable: false,
        lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      },
      memberships: user.memberships.map((membership) => ({
        membershipId: membership.id,
        academyId: membership.academy.id,
        academyName: membership.academy.name,
        academySlug: membership.academy.slug,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt?.toISOString() ?? null,
      })),
    };
  }
}
