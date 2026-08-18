import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import type { CreateAcademyInvitation } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { bumpPeopleRevision } from "../manage/people-revision.js";
import { AuditService } from "./audit.service.js";
import { toAcademyMember } from "./academy-membership.service.js";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const invitationInclude = {} as const;

@Injectable()
export class AcademyInvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(identity: SupabaseIdentity, input: CreateAcademyInvitation) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "academy.members.manage",
    );
    const email = normalizeEmail(input.email);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashInvitationToken(token);

    const invitation = await this.prisma.$transaction(async (transaction) => {
      await transaction.academyInvitation.updateMany({
        where: {
          academyId: input.academyId,
          email,
          status: "PENDING",
          expiresAt: { lte: new Date() },
        },
        data: { status: "EXPIRED" },
      });

      const existingUser = await transaction.user.findUnique({
        where: { email },
        select: {
          memberships: {
            where: { academyId: input.academyId },
            select: { id: true },
          },
        },
      });
      if (existingUser?.memberships.length) {
        throw new AppException(
          "MEMBERSHIP_ALREADY_EXISTS",
          HttpStatus.CONFLICT,
        );
      }

      const pending = await transaction.academyInvitation.findFirst({
        where: { academyId: input.academyId, email, status: "PENDING" },
        select: { id: true },
      });
      if (pending) {
        throw new AppException(
          "INVITATION_ALREADY_PENDING",
          HttpStatus.CONFLICT,
        );
      }

      const created = await transaction.academyInvitation.create({
        data: {
          academyId: input.academyId,
          email,
          role: input.role,
          tokenHash,
          status: "PENDING",
          expiresAt: new Date(Date.now() + invitationLifetimeMs),
          invitedByUserId: actor.userId,
        },
        include: invitationInclude,
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.invitation.created",
        targetType: "AcademyInvitation",
        targetId: created.id,
        after: { email, role: created.role, status: created.status },
      });
      // §8.1 — a pending invitation is a seat that is spoken for, so it counts
      // as a change to the academy's people even before anybody accepts it.
      await bumpPeopleRevision(transaction, input.academyId);
      return created;
    });

    return { invitation: toInvitationDetail(invitation), token };
  }

  async list(identity: SupabaseIdentity, academyId: string) {
    await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "academy.members.manage",
    );
    await this.prisma.academyInvitation.updateMany({
      where: { academyId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    const invitations = await this.prisma.academyInvitation.findMany({
      where: { academyId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return { invitations: invitations.map(toInvitationDetail) };
  }

  async revoke(
    identity: SupabaseIdentity,
    input: { academyId: string; invitationId: string },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "academy.members.manage",
    );
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM academy_invitations
        WHERE id = ${input.invitationId}::uuid
        FOR UPDATE
      `;
      const invitation = await transaction.academyInvitation.findUnique({
        where: { id: input.invitationId },
      });
      if (!invitation || invitation.academyId !== input.academyId) {
        throw new AppException("INVITATION_INVALID", HttpStatus.NOT_FOUND);
      }
      if (invitation.status !== "PENDING") {
        throw new AppException("INVITATION_INVALID", HttpStatus.CONFLICT);
      }
      const revoked = await transaction.academyInvitation.update({
        where: { id: invitation.id },
        data: { status: "REVOKED", revokedAt: new Date() },
      });
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: "academy.invitation.revoked",
        targetType: "AcademyInvitation",
        targetId: invitation.id,
        before: { status: invitation.status },
        after: { status: revoked.status },
      });
      await bumpPeopleRevision(transaction, input.academyId);
      return toInvitationDetail(revoked);
    });
  }

  async accept(identity: SupabaseIdentity, token: string) {
    if (!identity.emailVerified || !identity.email) {
      throw new AppException(
        "EMAIL_VERIFICATION_REQUIRED",
        HttpStatus.FORBIDDEN,
      );
    }
    const tokenHash = hashInvitationToken(token);
    const email = normalizeEmail(identity.email);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT id
        FROM academy_invitations
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `;
      const invitation = await transaction.academyInvitation.findUnique({
        where: { tokenHash },
      });
      if (!invitation || invitation.status !== "PENDING") {
        throw new AppException("INVITATION_INVALID", HttpStatus.NOT_FOUND);
      }
      if (invitation.expiresAt <= new Date()) {
        throw new AppException("INVITATION_EXPIRED", HttpStatus.GONE);
      }
      if (normalizeEmail(invitation.email) !== email) {
        throw new AppException(
          "INVITATION_EMAIL_MISMATCH",
          HttpStatus.FORBIDDEN,
        );
      }

      let user = await transaction.user.findUnique({
        where: { authUserId: identity.authUserId },
        select: { id: true, status: true },
      });
      if (!user) {
        const emailOwner = await transaction.user.findUnique({
          where: { email },
          select: { id: true },
        });
        if (emailOwner) {
          throw new AppException(
            "IDENTITY_LINK_CONFLICT",
            HttpStatus.CONFLICT,
          );
        }
        user = await transaction.user.create({
          data: {
            authUserId: identity.authUserId,
            email,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            status: "ACTIVE",
            lastSignInAt: new Date(),
          },
          select: { id: true, status: true },
        });
      } else if (user.status === "SUSPENDED" || user.status === "DELETED") {
        throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
      } else {
        user = await transaction.user.update({
          where: { id: user.id },
          data: {
            email,
            displayName: identity.displayName,
            avatarUrl: identity.avatarUrl,
            status: user.status === "PENDING_PROFILE" ? "ACTIVE" : user.status,
            lastSignInAt: new Date(),
          },
          select: { id: true, status: true },
        });
      }
      const existingMembership = await transaction.academyMembership.findUnique({
        where: {
          academyId_userId: {
            academyId: invitation.academyId,
            userId: user.id,
          },
        },
      });
      if (existingMembership) {
        throw new AppException(
          "MEMBERSHIP_ALREADY_EXISTS",
          HttpStatus.CONFLICT,
        );
      }

      const membership = await transaction.academyMembership.create({
        data: {
          academyId: invitation.academyId,
          userId: user.id,
          role: invitation.role,
          status: "ACTIVE",
          invitedByUserId: invitation.invitedByUserId,
          approvedByUserId: invitation.invitedByUserId,
          joinedAt: new Date(),
        },
        include: {
          user: {
            select: { id: true, email: true, displayName: true },
          },
        },
      });

      // §8.1 — the name an import suggested seeds the *academy-scoped*
      // override, never the global account name. The account belongs to the
      // person; what one academy calls them does not follow them elsewhere.
      //
      // Only on creation, and only when the profile does not already exist: a
      // recipient who has set their own academy name has said what they want to
      // be called, and a spreadsheet does not overrule them.
      if (invitation.displayNameHint) {
        await transaction.academyMemberProfile.upsert({
          where: { membershipId: membership.id },
          create: {
            membershipId: membership.id,
            academyDisplayName: invitation.displayNameHint,
          },
          update: {},
        });
      }
      await transaction.academyInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "ACCEPTED",
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
        },
      });
      await transaction.academyJoinRequest.updateMany({
        where: {
          academyId: invitation.academyId,
          userId: user.id,
          status: "PENDING",
        },
        data: { status: "CANCELLED", reviewedAt: new Date() },
      });
      await this.audit.write(transaction, {
        actorUserId: user.id,
        academyId: invitation.academyId,
        action: "academy.invitation.accepted",
        targetType: "AcademyMembership",
        targetId: membership.id,
        after: { role: membership.role, status: membership.status },
      });
      await bumpPeopleRevision(transaction, invitation.academyId);
      return toAcademyMember(membership);
    });
  }
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function toInvitationDetail(invitation: {
  id: string;
  academyId: string;
  email: string;
  role: "STUDENT" | "TEACHER" | "TEAM_LEAD" | "MANAGER";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: invitation.id,
    academyId: invitation.academyId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
  };
}
