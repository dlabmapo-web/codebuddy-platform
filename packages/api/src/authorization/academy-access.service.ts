import { HttpStatus, Injectable } from "@nestjs/common";
import {
  grantHasPermission,
  isPlatformViewRole,
  libraryAcademyPermissions,
  platformRoleHasPermission,
  platformViewPermissions,
  roleHasPermission,
  type AcademyPermission,
  type AcademyRole,
  type PlatformViewRole,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import {
  currentViewRole,
  setRequestSupportGrant,
} from "../common/request-context.js";
import { PrismaService } from "../database/prisma.service.js";
import type { AcademyStatus } from "../generated/prisma/client.js";
import { SupportGrantResolver } from "./support-grant.resolver.js";

export type AcademyAccess = {
  userId: string;
  academyId: string;
  role: AcademyRole;
  /**
   * Which axis answered.
   *
   * Never consulted to widen anything — every caller downstream reads `role`
   * exactly as before. It exists so the audit writer can stamp the grant onto
   * whatever this request goes on to do, which is the entire accountability
   * story for support access.
   */
  via: "membership" | "support" | "platform";
  /** Present only when `via === "support"`. */
  supportGrantId?: string;
};

@Injectable()
export class AcademyAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supportGrants: SupportGrantResolver,
  ) {}

  /**
   * The one gate every academy read and write passes through.
   *
   * Two sources of authority, tried in a fixed order, and the order is the
   * design:
   *
   * 1. **Account status first, ahead of both.** A suspended account is
   *    suspended everywhere; a grant must not be a way around that.
   * 2. **Membership second.** An operator who is genuinely a member of this
   *    academy acts as that member. Letting a forgotten open grant silently
   *    upgrade somebody's real role would make "what could they do" depend on
   *    a row they were not thinking about.
   * 3. **A live support grant**, and only where a membership would have
   *    refused for *absence*. A suspended membership stays a refusal: that
   *    academy made a decision about this person, and support access is not
   *    the tool for overruling it.
   * 4. **A platform operator's standing read**, last, and reads only. An
   *    operator holding `platform.academies.inspect` may look inside any
   *    academy without opening a session, because requiring a written reason
   *    to *look* teaches people to write "checking" — and the reason field is
   *    the whole of what the grant design rests on. Every write still needs a
   *    grant, so what was done stays attributable even though what was read
   *    is not.
   *
   * Academy status is read differently on the two paths, deliberately. A
   * SUSPENDED academy accepts a grant — that is precisely when support is
   * needed, and refusing would make the console useless in the one situation
   * it exists for — while an ARCHIVED academy accepts only a read-only one,
   * because archived is terminal and reading its history is support where
   * writing to it is not.
   */
  async requirePermission(
    authUserId: string,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<AcademyAccess> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "PENDING_PROFILE") {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }

    const membership = await this.prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: user.id } },
      include: { academy: { select: { status: true } } },
    });
    if (!membership) {
      // Read once, here, rather than inside each path below: the support
      // resolver needs the status and the library branch needs the kind, and
      // the two used to be one query anyway.
      const academy = await this.prisma.academy.findUnique({
        where: { id: academyId },
        select: { status: true, kind: true },
      });
      if (!academy) {
        throw new AppException(
          "ACADEMY_MEMBERSHIP_REQUIRED",
          HttpStatus.FORBIDDEN,
        );
      }

      // A library academy has no members, so there is no membership to fall
      // back from and no support grant to consider. Its authority is the
      // platform axis and nothing else.
      if (academy.kind === "LIBRARY") {
        return this.requireLibraryAccess(user.id, academyId, permission);
      }

      const viaSupport = await this.requireSupportGrant(
        user.id,
        academyId,
        permission,
        academy.status,
      );
      if (viaSupport) return viaSupport;
      throw new AppException(
        "ACADEMY_MEMBERSHIP_REQUIRED",
        HttpStatus.FORBIDDEN,
      );
    }
    if (membership.status !== "ACTIVE" || membership.academy.status !== "ACTIVE") {
      throw new AppException(
        "ACADEMY_MEMBERSHIP_SUSPENDED",
        HttpStatus.FORBIDDEN,
      );
    }
    if (!roleHasPermission(membership.role, permission)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    return {
      userId: user.id,
      academyId,
      role: membership.role,
      via: "membership",
    };
  }

  /**
   * Support authority for this permission, or null to fall through.
   *
   * Returns rather than throws on the ordinary "no grant" case, so a caller
   * with neither membership nor grant still gets the membership refusal it
   * always got — an operator probing an academy must not be able to tell the
   * two apart from the error code.
   *
   * The one refusal it does raise is `SUPPORT_GRANT_READ_ONLY`, and only when
   * a live grant exists and would have allowed this permission with writes.
   * That is a recoverable mistake by somebody already authorized to be here,
   * and telling them which mistake saves a support session.
   */
  private async requireSupportGrant(
    userId: string,
    academyId: string,
    permission: AcademyPermission,
    academyStatus: AcademyStatus,
  ): Promise<AcademyAccess | null> {
    const grant = await this.supportGrants.findLive(userId, academyId);

    if (!grant) {
      // No session. A platform operator may still read.
      return this.platformRead(userId, academyId, permission);
    }
    if (academyStatus === "ARCHIVED" && !grant.readOnly) {
      return this.platformRead(userId, academyId, permission);
    }

    if (grantHasPermission(grant, permission)) {
      // Attribution, not authority. Every audit record this request goes on to
      // write now names the grant, without 18 services having to remember to
      // pass it.
      setRequestSupportGrant(grant.id);
      return {
        userId,
        academyId,
        role: grant.assumedRole,
        via: "support",
        supportGrantId: grant.id,
      };
    }

    if (
      grant.readOnly &&
      grantHasPermission(
        { ...grant, readOnly: false },
        permission,
      )
    ) {
      throw new AppException(
        "SUPPORT_GRANT_READ_ONLY",
        HttpStatus.FORBIDDEN,
      );
    }

    return null;
  }

  /**
   * Authority inside a `LIBRARY` academy, which comes from the platform axis
   * and from nowhere else.
   *
   * The "every write needs a support grant" rule this class enforces protects
   * *a customer's* data: writing into somebody else's academy must be
   * justified and attributable, which is what a time-limited grant with a
   * written reason is for. A library academy is not a customer's academy — it
   * is platform-owned curriculum — so routing head office's routine authoring
   * through that machinery would fill the grant log with "authoring" and cost
   * the reason field the meaning the whole design rests on.
   *
   * `libraryAcademyPermissions` is the translation from platform authority to
   * academy permissions, and it is narrower than any academy role: a library
   * holds courses and nothing else, so nothing about members, classes,
   * enrollment or analytics is in it.
   *
   * The reported role is `TEAM_LEAD`, the academy's curriculum owner, because
   * that is honestly what the operator is acting as here — and because every
   * editor mounted over a library course reads `role` to decide what to draw.
   */
  private async requireLibraryAccess(
    userId: string,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<AcademyAccess> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    });
    if (!user?.platformRole) {
      throw new AppException("PLATFORM_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    const permitted = libraryAcademyPermissions(user.platformRole);
    if (permitted.length === 0) {
      throw new AppException("PLATFORM_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }
    if (!permitted.includes(permission)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }

    return { userId, academyId, role: "TEAM_LEAD", via: "platform" };
  }

  /**
   * A platform operator standing inside an academy, as one of its roles.
   *
   * The role comes from the request — an operator chooses whether they are
   * looking at the Manager's product, the Team Lead's, or a Teacher's, because
   * those are three genuinely different applications and a question about one
   * cannot be answered from another. It defaults to `MANAGER`, the widest.
   *
   * `platformViewPermissions` decides what that role may do here, and it is
   * the role's own set rather than a read-only slice. Several manager surfaces
   * gate a read behind a write-named permission — the roster asks for
   * `academy.members.manage` — so a read-only slice produced a Manager view
   * with most of the Manager's pages refusing to open.
   *
   * Two things it never yields, whatever the role: submitting work as a
   * student, and live monitoring. Both stay out of `platformViewPermissions`.
   */
  private async platformRead(
    userId: string,
    academyId: string,
    permission: AcademyPermission,
  ): Promise<AcademyAccess | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { platformRole: true },
    });
    // `platformRole` is non-null in the schema, so an absent one means the row
    // was not read — a caller that is not an operator, or a test double.
    // Either way it is not authority.
    if (
      !user?.platformRole ||
      !platformRoleHasPermission(user.platformRole, "platform.academies.inspect")
    ) {
      return null;
    }

    const requested = currentViewRole();
    const role: PlatformViewRole = isPlatformViewRole(requested)
      ? requested
      : "MANAGER";

    return platformViewPermissions(role).includes(permission)
      ? { userId, academyId, role, via: "platform" }
      : null;
  }

  /**
   * Whether this account is a student of any academy.
   *
   * The thirty-minute inactivity lease is a *student* policy, but the lease
   * itself is keyed on the Supabase session rather than on a membership — one
   * session, one lease, whatever academies the person belongs to. So the
   * question the guard has to ask is the session-shaped one: is this person a
   * student anywhere. Asking per academy would be a different question, and
   * the lease has no way to answer it.
   *
   * Staff answer `false` and are not held to the policy. That is not leniency:
   * §5.2 keeps staff session policy separate, and until now a manager was
   * being given a student's lease at sign-in with nothing to renew it — which
   * expired thirty minutes later and locked them out of curriculum they are
   * entitled to read.
   *
   * A `count` against the composite index, not a membership load: the answer
   * is one bit and this runs on every request to the learning surfaces.
   */
  async isStudentAnywhere(authUserId: string): Promise<boolean> {
    const count = await this.prisma.academyMembership.count({
      where: {
        role: "STUDENT",
        status: "ACTIVE",
        user: { authUserId },
        academy: { status: "ACTIVE" },
      },
    });
    return count > 0;
  }
}
