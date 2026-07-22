import { HttpStatus, Injectable } from "@nestjs/common";
import { authMeResponseSchema, type AuthMeResponse } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import type { SupabaseIdentity } from "./auth.types.js";

const userInclude = {
  memberships: {
    include: { academy: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(identity: SupabaseIdentity): Promise<AuthMeResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      include: userInclude,
    });

    if (existing) {
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
      return toAuthMe(updated);
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

    return toAuthMe(created);
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
    },
  });
}
