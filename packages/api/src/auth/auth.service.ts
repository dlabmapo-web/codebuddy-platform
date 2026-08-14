import { HttpStatus, Injectable } from "@nestjs/common";
import { authMeResponseSchema, type AuthMeResponse } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { SupabaseIdentity } from "./auth.types.js";
import { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import { hashOAuthOnboardingToken } from "./oauth-onboarding-intent.service.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

/**
 * Returned for a username nobody holds. `.invalid` is reserved by RFC 2606 and
 * can never belong to a real account, so the sign-in that follows fails with
 * the same rejection a wrong password produces. That symmetry is what lets
 * `resolveSignInEmail` stay unauthenticated without becoming a way to discover
 * which usernames exist.
 */
const unresolvedEmailDomain = "unresolved.invalid";

const userInclude = {
  avatarAsset: true,
  memberships: {
    include: {
      academy: true,
      memberProfile: { include: { avatarAsset: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  joinRequests: {
    include: { academy: true },
    orderBy: { createdAt: "desc" as const },
  },
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: AcademyOnboardingService,
    private readonly media: ProfileMediaService,
  ) {}

  async bootstrap(identity: SupabaseIdentity): Promise<AuthMeResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      include: userInclude,
    });

    if (existing) {
      if (existing.status === "SUSPENDED" || existing.status === "DELETED") {
        throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
      }
      const updated = await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          email: identity.email ?? existing.email,
          displayName: identity.displayName ?? existing.displayName,
          avatarUrl: identity.avatarUrl ?? existing.avatarUrl,
          status: identity.emailVerified && existing.status === "PENDING_PROFILE"
            ? "ACTIVE"
            : existing.status,
          lastSignInAt: new Date(),
        },
        include: userInclude,
      });
      await this.claimUsername(updated.id, updated.username, identity.username);
      await this.onboarding.ensureSignupRequest(
        updated.id,
        identity.requestedAcademyId,
        identity.emailVerified,
      );
      return this.present(await this.requireUser(updated.id));
    }

    if (identity.email) {
      const emailOwner = await this.prisma.user.findUnique({
        where: { email: identity.email },
        select: { id: true, authUserId: true },
      });
      if (emailOwner) {
        throw new AppException("IDENTITY_LINK_CONFLICT", HttpStatus.CONFLICT);
      }
    }

    const created = await this.createWithUsername(identity);

    await this.onboarding.ensureSignupRequest(
      created.id,
      identity.requestedAcademyId,
      identity.emailVerified,
    );
    return this.present(await this.requireUser(created.id));
  }

  async completeOAuthOnboarding(
    identity: SupabaseIdentity,
    intentToken?: string,
  ): Promise<AuthMeResponse> {
    if (!intentToken) {
      const existing = await this.prisma.user.findUnique({
        where: { authUserId: identity.authUserId },
        select: { id: true },
      });
      if (!existing) {
        throw new AppException(
          "OAUTH_ONBOARDING_INTENT_REQUIRED",
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.bootstrap(identity);
    }

    const tokenHash = hashOAuthOnboardingToken(intentToken);
    await this.prisma.oAuthOnboardingIntent.updateMany({
      where: { status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });

    const userId = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM oauth_onboarding_intents
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `;
      const intent = await transaction.oAuthOnboardingIntent.findUnique({
        where: { tokenHash },
        include: { academy: { select: { status: true } } },
      });
      if (!intent) {
        throw new AppException(
          "OAUTH_ONBOARDING_INTENT_INVALID",
          HttpStatus.NOT_FOUND,
        );
      }
      if (intent.status === "EXPIRED" || intent.expiresAt <= new Date()) {
        throw new AppException(
          "OAUTH_ONBOARDING_INTENT_EXPIRED",
          HttpStatus.GONE,
        );
      }
      if (intent.status === "CONSUMED") {
        if (intent.consumedByAuthUserId !== identity.authUserId) {
          throw new AppException(
            "OAUTH_ONBOARDING_INTENT_CONSUMED",
            HttpStatus.CONFLICT,
          );
        }
        const existing = await transaction.user.findUnique({
          where: { authUserId: identity.authUserId },
          select: { id: true },
        });
        if (!existing) {
          throw new AppException(
            "OAUTH_ONBOARDING_INTENT_INVALID",
            HttpStatus.CONFLICT,
          );
        }
        return existing.id;
      }
      if (intent.academy.status !== "ACTIVE") {
        throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
      }
      if (!identity.provider || identity.provider !== intent.provider) {
        throw new AppException(
          "OAUTH_PROVIDER_MISMATCH",
          HttpStatus.FORBIDDEN,
        );
      }

      let user = await transaction.user.findUnique({
        where: { authUserId: identity.authUserId },
        select: { id: true, status: true },
      });
      if (user) {
        if (user.status === "SUSPENDED" || user.status === "DELETED") {
          throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
        }
        user = await transaction.user.update({
          where: { id: user.id },
          data: {
            email: identity.email,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            status: identity.emailVerified && user.status === "PENDING_PROFILE"
              ? "ACTIVE"
              : user.status,
            lastSignInAt: new Date(),
          },
          select: { id: true, status: true },
        });
      } else {
        if (identity.email) {
          const emailOwner = await transaction.user.findUnique({
            where: { email: identity.email },
            select: { id: true },
          });
          if (emailOwner) {
            throw new AppException(
              "IDENTITY_LINK_CONFLICT",
              HttpStatus.CONFLICT,
            );
          }
        }
        user = await transaction.user.create({
          data: {
            authUserId: identity.authUserId,
            email: identity.email,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            status: identity.emailVerified ? "ACTIVE" : "PENDING_PROFILE",
            lastSignInAt: new Date(),
          },
          select: { id: true, status: true },
        });
      }

      const membership = await transaction.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: intent.academyId,
            userId: user.id,
          },
        },
        select: { id: true },
      });
      const priorRequest = await transaction.academyJoinRequest.findFirst({
        where: { academyId: intent.academyId, userId: user.id },
        select: { id: true },
      });
      if (!membership && !priorRequest) {
        await transaction.academyJoinRequest.create({
          data: { academyId: intent.academyId, userId: user.id },
        });
      }

      await transaction.oAuthOnboardingIntent.update({
        where: { id: intent.id },
        data: {
          status: "CONSUMED",
          consumedAt: new Date(),
          consumedByAuthUserId: identity.authUserId,
        },
      });
      return user.id;
    });

    return this.present(await this.requireUser(userId));
  }

  /**
   * Creates the profile, keeping the signup username when it is still free.
   *
   * A lost race gives up the name rather than the account: the person already
   * holds a Supabase identity by the time this runs, so failing here would
   * leave them authenticated with nowhere to land. They keep signing in with
   * their email and claim a name through `setUsername`.
   */
  private async createWithUsername(
    identity: SupabaseIdentity,
  ): Promise<AuthUserRecord> {
    const data = {
      authUserId: identity.authUserId,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      status: identity.emailVerified
        ? ("ACTIVE" as const)
        : ("PENDING_PROFILE" as const),
      lastSignInAt: new Date(),
    };

    if (!identity.username) {
      return this.prisma.user.create({ data, include: userInclude });
    }

    try {
      return await this.prisma.user.create({
        data: { ...data, username: identity.username },
        include: userInclude,
      });
    } catch (error) {
      if (!isUsernameConflict(error)) throw error;
      return this.prisma.user.create({ data, include: userInclude });
    }
  }

  /**
   * Fills in a username that was never stored, and only that. The claim is
   * ignored once one exists, because the token metadata it comes from is
   * client-writable — honoring it later would turn a sign-in into a rename.
   */
  private async claimUsername(
    userId: string,
    current: string | null,
    claimed: string | null,
  ): Promise<void> {
    if (current || !claimed) return;
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { username: claimed },
      });
    } catch (error) {
      if (!isUsernameConflict(error)) throw error;
    }
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const owner = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return owner === null;
  }

  /**
   * Maps whatever the person typed into the sign-in field onto the address
   * Supabase authenticates against. See `unresolvedEmailDomain` for why an
   * unknown username still answers with an address.
   */
  async resolveSignInEmail(identifier: string): Promise<{ email: string }> {
    const normalized = identifier.trim().toLowerCase();
    if (normalized.includes("@")) return { email: normalized };

    const owner = await this.prisma.user.findUnique({
      where: { username: normalized },
      select: { email: true },
    });
    return {
      email: owner?.email ?? `${normalized}@${unresolvedEmailDomain}`,
    };
  }

  async setUsername(
    identity: SupabaseIdentity,
    username: string,
  ): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true, status: true, username: true },
    });
    if (!user) throw new AppException("PROFILE_INCOMPLETE", HttpStatus.NOT_FOUND);
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }
    // Not a rename endpoint. A username is how other people refer to this
    // account, so changing one is a separate, audited decision.
    if (user.username) {
      throw new AppException("USERNAME_ALREADY_SET", HttpStatus.CONFLICT);
    }

    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { username },
      });
    } catch (error) {
      if (!isUsernameConflict(error)) throw error;
      throw new AppException("USERNAME_TAKEN", HttpStatus.CONFLICT);
    }

    return this.present(await this.requireUser(user.id));
  }

  /**
   * One response shape, one place that mints the avatar URL.
   *
   * The signing call is skipped entirely for an account with no Cove image,
   * which is every account until someone uploads one — so the common path
   * costs nothing and only a person who chose a photo pays for it.
   */
  private async present(user: AuthUserRecord): Promise<AuthMeResponse> {
    const assets = [
      user.avatarAsset,
      ...user.memberships.map(
        (membership) => membership.status === "ACTIVE"
          ? membership.memberProfile?.avatarAsset ?? null
          : null,
      ),
    ].filter((asset) => asset !== null && asset !== undefined);
    if (assets.length === 0) return toAuthMe(user);

    // One storage request for the global photo and every academy override.
    // The header can then choose the current academy without an extra profile
    // query (which also loads classes and courses).
    const signed = await this.media.signMany(
      assets.map((asset) => ({
        id: asset.id,
        bucket: asset.bucket,
        objectKey: asset.objectKey,
      })),
    );
    const urls = new Map(signed.map((image) => [image.assetId, image.url]));
    return toAuthMe(
      user,
      user.avatarAsset ? urls.get(user.avatarAsset.id) ?? null : null,
      urls,
    );
  }

  private async requireUser(id: string): Promise<AuthUserRecord> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
    if (!user) throw new AppException("PROFILE_INCOMPLETE", HttpStatus.NOT_FOUND);
    return user;
  }

  async me(identity: SupabaseIdentity): Promise<AuthMeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      include: userInclude,
    });

    if (!user) {
      return this.bootstrap(identity);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }

    return this.present(user);
  }
}

type AuthUserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

/**
 * Prisma names the violated constraint either by field or by index, depending
 * on the driver, so both spellings are listed. Matched exactly rather than by
 * substring: `users_legacy_username_key` is a different column with a very
 * different meaning, and swallowing it would hide a broken v1 import.
 */
const usernameConstraints = new Set(["username", "users_username_key"]);

/**
 * A unique-constraint violation naming the username column specifically. The
 * same Prisma code covers `email` and `auth_user_id`, and those two mean
 * something has gone wrong that must not be swallowed.
 */
function isUsernameConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ((error as { code?: unknown }).code !== "P2002") return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some(
    (value) => typeof value === "string" && usernameConstraints.has(value),
  );
}

function toAuthMe(
  user: AuthUserRecord,
  imageUrl: string | null = null,
  imageUrls: ReadonlyMap<string, string> = new Map(),
): AuthMeResponse {
  return authMeResponseSchema.parse({
    user: {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      imageUrl,
      platformRole: user.platformRole,
      status: user.status,
      memberships: user.memberships.map((membership) => ({
        academy: {
          id: membership.academy.id,
          name: membership.academy.name,
          slug: membership.academy.slug,
        },
        role: membership.role,
        status: membership.status,
        imageUrl: membership.memberProfile?.avatarAssetId
          ? imageUrls.get(membership.memberProfile.avatarAssetId) ?? null
          : null,
      })),
      applications: user.joinRequests.map((request) => ({
        id: request.id,
        academy: {
          id: request.academy.id,
          name: request.academy.name,
          slug: request.academy.slug,
        },
        status: request.status,
        approvedRole: request.approvedRole,
        reviewReason: request.reviewReason,
        createdAt: request.createdAt.toISOString(),
        reviewedAt: request.reviewedAt?.toISOString() ?? null,
      })),
    },
  });
}
