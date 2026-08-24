import { HttpStatus, Injectable } from "@nestjs/common";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";

/**
 * The one gate in front of the points page.
 *
 * It resolves a scope rather than returning a boolean, the same way the
 * student overview's access service does: a caller holding a scope is holding
 * the subject membership, the academy, its timezone, and the two flags that
 * decide what may be rendered. Nothing below can widen them.
 *
 * A student's subject is always themselves. `membershipId` on the input is
 * ignored unless the caller is staff — the subject comes from the identity,
 * and no student request can be aimed at another child.
 *
 * Staff read, and only read. There is no award path anywhere in this module,
 * so "may this person give points" is not a question the gate has to answer.
 * §5 of the student points design.
 */

export type PointsScope = {
  academyId: string;
  timeZone: string;
  /** Whose points are being read. */
  membershipId: string;
  /** The name that subject's academy calls them. Never an email or an id. */
  subjectName: string;
  /** True when the reader is the subject. Decides `isYou` on the board. */
  isSelf: boolean;
  /** Classes the subject may be ranked in, most recently active first. */
  classes: { classId: string; name: string }[];
  /** §5 — whether the named board may render at all for this academy. */
  leaderboardEnabled: boolean;
};

@Injectable()
export class PointsAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId?: string },
  ): Promise<PointsScope> {
    const reader = await this.prisma.academyMembership.findFirst({
      where: {
        academyId: input.academyId,
        user: { authUserId: identity.authUserId },
        status: "ACTIVE",
      },
      select: {
        id: true,
        role: true,
        user: { select: { displayName: true } },
        memberProfile: { select: { academyDisplayName: true } },
        academy: { select: { id: true, timeZone: true, status: true } },
      },
    });

    if (!reader || reader.academy.status !== "ACTIVE") {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    // The flag is read before any aggregate runs, so an academy that has not
    // enabled points costs one indexed lookup to answer.
    const enabled = await this.enabledFeatures(input.academyId);
    if (!enabled.has("STUDENT_POINTS")) {
      throw new AppException("POINTS_UNAVAILABLE", HttpStatus.NOT_FOUND);
    }

    const isStaff = reader.role !== "STUDENT";
    const membershipId =
      isStaff && input.membershipId ? input.membershipId : reader.id;

    const subjectName =
      membershipId === reader.id
        ? displayNameOf(reader)
        : await this.requireReadableStudent(
            reader,
            input.academyId,
            membershipId,
          );

    return {
      academyId: input.academyId,
      timeZone: reader.academy.timeZone,
      membershipId,
      subjectName,
      isSelf: membershipId === reader.id,
      classes: await this.classesFor(membershipId, reader.role === "TEACHER" ? reader.id : null),
      leaderboardEnabled: enabled.has("STUDENT_CLASS_LEADERBOARD"),
    };
  }

  /**
   * Staff reading one class's board.
   *
   * Not the same question as `resolve`: there the subject is a student and the
   * scope follows their enrolments, here the subject is a class and the reader
   * is never on it. `membershipId` is the reader's own so `isYou` is false on
   * every row — a teacher is not in their own class ranking.
   *
   * A teacher may read the classes assigned to them; a team lead or manager
   * may read any class in the academy. A student never reaches this at all:
   * their board comes from `resolve`, which is scoped to the classes they are
   * actually enrolled in, and routing a student through here would let them
   * name a class they are not in.
   *
   * `classId` is optional. Absent, the scope falls to the first class the
   * reader may open — the academy-wide page opens on something rather than on
   * a picker with an empty table beside it. A reader who runs no classes gets
   * an empty `classes` list and a null `className`, which the board renders as
   * its own quiet state rather than as an error.
   */
  async resolveClassBoard(
    identity: SupabaseIdentity,
    input: { academyId: string; classId?: string },
  ): Promise<PointsScope & { className: string | null }> {
    const reader = await this.prisma.academyMembership.findFirst({
      where: {
        academyId: input.academyId,
        user: { authUserId: identity.authUserId },
        status: "ACTIVE",
      },
      select: {
        id: true,
        role: true,
        user: { select: { displayName: true } },
        memberProfile: { select: { academyDisplayName: true } },
        academy: { select: { timeZone: true, status: true } },
      },
    });

    if (!reader || reader.academy.status !== "ACTIVE" || reader.role === "STUDENT") {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    const enabled = await this.enabledFeatures(input.academyId);
    if (!enabled.has("STUDENT_POINTS")) {
      throw new AppException("POINTS_UNAVAILABLE", HttpStatus.NOT_FOUND);
    }

    // Every class this reader may open, in one query — the picker's options and
    // the board's scope are the same list, so a manager can never be offered a
    // class the board would then refuse. A teacher's list is their assignment;
    // a team lead's or manager's is the academy.
    const readable = await this.prisma.class.findMany({
      where: {
        academyId: input.academyId,
        status: "ACTIVE",
        ...(reader.role === "TEACHER"
          ? { teacherMembershipId: reader.id }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    // A named class that is not on the list gets the same `NOT_FOUND` an absent
    // one would, so the error cannot be used to enumerate the academy.
    const target = input.classId
      ? readable.find((entry) => entry.id === input.classId)
      : readable[0];
    if (input.classId && !target) {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
    }

    return {
      academyId: input.academyId,
      timeZone: reader.academy.timeZone,
      membershipId: reader.id,
      isSelf: false,
      classes: readable.map((entry) => ({
        classId: entry.id,
        name: entry.name,
      })),
      subjectName: displayNameOf(reader),
      className: target?.name ?? null,
      leaderboardEnabled: enabled.has("STUDENT_CLASS_LEADERBOARD"),
    };
  }

  /** The academy's enabled points flags, in one indexed lookup. */
  private async enabledFeatures(academyId: string): Promise<Set<string>> {
    const flags = await this.prisma.academyFeatureFlag.findMany({
      where: {
        academyId,
        feature: { in: ["STUDENT_POINTS", "STUDENT_CLASS_LEADERBOARD"] },
        isEnabled: true,
      },
      select: { feature: true },
    });
    return new Set(flags.map((flag) => flag.feature));
  }

  /**
   * A teacher may read the students in the classes assigned to them; a team
   * lead or manager may read any student in the academy.
   *
   * A teacher reading outside their assignment gets the same `NOT_FOUND` an
   * absent student would, so the error cannot be used to enumerate a roster.
   */
  private async requireReadableStudent(
    reader: { id: string; role: string },
    academyId: string,
    membershipId: string,
  ): Promise<string> {
    const subject = await this.prisma.academyMembership.findFirst({
      where: {
        id: membershipId,
        academyId,
        role: "STUDENT",
        ...(reader.role === "TEACHER"
          ? {
              classEnrollments: {
                some: { class: { teacherMembershipId: reader.id } },
              },
            }
          : {}),
      },
      select: {
        id: true,
        user: { select: { displayName: true } },
        memberProfile: { select: { academyDisplayName: true } },
      },
    });
    if (!subject) {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
    }
    return displayNameOf(subject);
  }

  /**
   * The classes a board could be drawn for, most recently active first.
   *
   * §10.7 — a student enrolled in more than one class defaults to the one they
   * have been working in, and switches from a selector rather than seeing an
   * arbitrary first.
   */
  private async classesFor(
    membershipId: string,
    _teacherMembershipId: string | null,
  ): Promise<{ classId: string; name: string }[]> {
    const enrollments = await this.prisma.classEnrollment.findMany({
      where: { membershipId, class: { status: "ACTIVE" } },
      orderBy: [{ lastLearningSeenAt: { sort: "desc", nulls: "last" } }],
      select: { classId: true, class: { select: { name: true } } },
    });
    return enrollments.map((enrollment) => ({
      classId: enrollment.classId,
      name: enrollment.class.name,
    }));
  }
}

/**
 * The academy-scoped name, falling back to the account's own.
 *
 * Never an email, a username, or an id — §17. The last resort is a dash rather
 * than the username the people directory falls back to, because this name is
 * printed on a page children read.
 */
function displayNameOf(membership: {
  user: { displayName: string | null };
  memberProfile: { academyDisplayName: string | null } | null;
}): string {
  return (
    membership.memberProfile?.academyDisplayName?.trim() ||
    membership.user.displayName?.trim() ||
    "\u2014"
  );
}
