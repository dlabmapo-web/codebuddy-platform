import { HttpStatus, Injectable } from "@nestjs/common";
import type { JoinRequestKind } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";

/**
 * What somebody waiting for approval may read about the academy they applied
 * to.
 *
 * The entire surface an applicant has, and it is deliberately this small: a
 * name, a cover image, whether the academy runs points, and their own
 * application. The lobby's pages are empty because there is nothing behind
 * them, not because something filtered a list — so no roster, catalog, ranking
 * or count is reachable from here even by mistake.
 *
 * This does not go through `AcademyAccessService`. That gate answers "which
 * permissions does this member hold", and an applicant is not a member: it
 * already refuses them with `ACADEMY_MEMBERSHIP_REQUIRED`, which is exactly
 * the behaviour every other endpoint needs and must keep. Asking it to also
 * describe applicants would put a non-member on the path that decides what
 * members may do. The lobby asks its own, narrower question instead, and it is
 * the only caller that ever asks it.
 */
@Injectable()
export class LobbyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
  ) {}

  /**
   * Resolved by slug rather than id, because the applicant arrives by URL and
   * the id would have to come from somewhere they could equally have guessed.
   *
   * Every refusal is `ACADEMY_NOT_FOUND`, never `PERMISSION_DENIED`: a
   * signed-in stranger probing slugs must not be able to tell an academy that
   * exists from one that does not.
   */
  async academy(
    identity: SupabaseIdentity,
    academySlug: string,
  ): Promise<{
    id: string;
    name: string;
    slug: string;
    imageUrl: string | null;
    hasPoints: boolean;
    application: {
      id: string;
      requestedKind: JoinRequestKind;
      createdAt: string;
    };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true, status: true },
    });
    if (!user || user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const academy = await this.prisma.academy.findFirst({
      // An archived or suspended academy closes its lobby. The status is
      // checked when the request is created and never again, so without this
      // an applicant would keep a branded lobby for a school that has closed.
      where: { slug: academySlug, status: "ACTIVE", kind: "ACADEMY" },
      select: {
        id: true,
        name: true,
        slug: true,
        featureFlags: {
          where: { feature: "STUDENT_POINTS", isEnabled: true },
          select: { feature: true },
        },
        media: {
          where: { kind: "COVER" },
          select: { asset: { select: { id: true, bucket: true, objectKey: true } } },
          take: 1,
        },
      },
    });
    if (!academy) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const application = await this.prisma.academyJoinRequest.findFirst({
      where: { academyId: academy.id, userId: user.id, status: "PENDING" },
      select: { id: true, requestedKind: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    // Not an applicant here. Same answer as an academy that does not exist,
    // for the reason above.
    if (!application) {
      throw new AppException("ACADEMY_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const asset = academy.media[0]?.asset ?? null;
    const signed = asset ? await this.media.sign(asset) : null;

    return {
      id: academy.id,
      name: academy.name,
      slug: academy.slug,
      imageUrl: signed?.url ?? null,
      hasPoints: academy.featureFlags.length > 0,
      application: {
        id: application.id,
        requestedKind: application.requestedKind,
        createdAt: application.createdAt.toISOString(),
      },
    };
  }
}
