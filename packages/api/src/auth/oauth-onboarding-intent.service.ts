import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import type { SocialAuthProvider } from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

const intentLifetimeMs = 10 * 60 * 1_000;

@Injectable()
export class OAuthOnboardingIntentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    academyId: string;
    provider: SocialAuthProvider;
  }) {
    const academy = await this.prisma.academy.findFirst({
      where: { id: input.academyId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!academy) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    await this.prisma.oAuthOnboardingIntent.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED" },
    });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + intentLifetimeMs);
    await this.prisma.oAuthOnboardingIntent.create({
      data: {
        academyId: input.academyId,
        provider: input.provider,
        tokenHash: hashOAuthOnboardingToken(token),
        expiresAt,
      },
    });

    return { token, expiresAt: expiresAt.toISOString() };
  }
}

export function hashOAuthOnboardingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
