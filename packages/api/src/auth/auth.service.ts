import { HttpStatus, Injectable } from "@nestjs/common";
import { authMeResponseSchema, type AuthMeResponse } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { SupabaseIdentity } from "./auth.types.js";
import { AcademyOnboardingService } from "../academies/academy-onboarding.service.js";
import { hashOAuthOnboardingToken } from "./oauth-onboarding-intent.service.js";

const userInclude = {
  memberships: {
    include: { academy: true },
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
      await this.onboarding.ensureSignupRequest(
        updated.id,
        identity.requestedAcademyId,
        identity.emailVerified,
      );
      return toAuthMe(await this.requireUser(updated.id));
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

    const created = await this.prisma.user.create({
      data: {
        authUserId: identity.authUserId,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        status: identity.emailVerified ? "ACTIVE" : "PENDING_PROFILE",
        lastSignInAt: new Date(),
      },
      include: userInclude,
    });

    await this.onboarding.ensureSignupRequest(
      created.id,
      identity.requestedAcademyId,
      identity.emailVerified,
    );
    return toAuthMe(await this.requireUser(created.id));
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

    return toAuthMe(await this.requireUser(userId));
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

    return toAuthMe(user);
  }
}

type AuthUserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function toAuthMe(user: AuthUserRecord): AuthMeResponse {
  return authMeResponseSchema.parse({
    user: {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
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
