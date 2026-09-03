import { HttpStatus, Injectable } from "@nestjs/common";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async resolve(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId?: string; classId?: string },
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

    if (!reader) {
      // A platform operator standing in one of the academy's roles. They hold
      // no membership, so the lookup above finds nothing — and the board is a
      // read of the academy, not of themselves. `AcademyAccessService` is the
      // authority here, as it is everywhere else; this service resolving its
      // own reader from a membership row is why it had to be asked separately.
      //
      // `membershipId` is forwarded, unlike on the two board paths: here it
      // names the *student being read*, not the reader, and dropping it
      // answered an operator's ledger request with a page about nobody.
      return this.platformScope(identity, input);
    }
    if (reader.academy.status !== "ACTIVE") {
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

    const classes = await this.classesFor(
      membershipId,
      reader.role === "TEACHER" ? reader.id : null,
    );
    if (
      input.classId &&
      !classes.some((entry) => entry.classId === input.classId)
    ) {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
    }

    return {
      academyId: input.academyId,
      timeZone: reader.academy.timeZone,
      membershipId,
      subjectName,
      isSelf: membershipId === reader.id,
      classes,
      leaderboardEnabled: enabled.has("STUDENT_CLASS_LEADERBOARD"),
    };
  }

  /**
   * A platform operator reading an academy's boards, or one of its students.
   *
   * **The operator is never the subject.** They hold no membership, sit on no
   * ranking, and have no points — so `isSelf` is false unconditionally, which
   * is what keeps `isYou` off every row rather than landing on whichever row
   * happens to share a blank id.
   *
   * Who the subject *is* depends on the caller. The two board paths ask about
   * a class and pass no `membershipId`, so the scope keeps an empty subject —
   * correct, because a board is a read of the class rather than of anybody.
   * `resolve` asks about one student and passes theirs, and dropping it there
   * was a defect: `subjectName` came back empty, which fails `labelSchema`'s
   * own `.min(1)`, and `listLedger` filtered on `membershipId: ""`, which
   * matches nothing. An operator opening a child's ledger got a nameless page
   * with no rows on it.
   *
   * Every class in the academy is in scope, matching the Teacher view's own
   * academy-wide reach. The feature flag still decides whether a board renders
   * at all, so an academy that never switched points on answers the same way
   * for an operator as it does for its own staff.
   */
  private async platformScope(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId?: string; classId?: string },
  ): Promise<PointsScope> {
    let academy: { timeZone: string; status: string } | null = null;
    try {
      await this.access.requirePermission(
        identity.authUserId,
        input.academyId,
        "academy.read",
      );
      academy = await this.prisma.academy.findUnique({
        where: { id: input.academyId },
        select: { timeZone: true, status: true },
      });
    } catch {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }
    if (!academy || academy.status !== "ACTIVE") {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    const enabled = await this.enabledFeatures(input.academyId);
    if (!enabled.has("STUDENT_POINTS")) {
      throw new AppException("POINTS_UNAVAILABLE", HttpStatus.NOT_FOUND);
    }

    const classes = await this.prisma.class.findMany({
      where: { academyId: input.academyId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    if (
      input.classId &&
      !classes.some((entry) => entry.id === input.classId)
    ) {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
    }

    // The student this read is about, when the caller named one. Scoped by
    // academy, so an operator cannot reach a child through another tenant's
    // route — and a membership that exists in a different academy answers
    // exactly as one that does not exist, which is what stops the refusal
    // being used to test ids.
    const subject = input.membershipId
      ? await this.requirePlatformSubject(input.academyId, input.membershipId)
      : null;

    return {
      academyId: input.academyId,
      timeZone: academy.timeZone,
      membershipId: subject?.id ?? "",
      subjectName: subject?.name ?? "",
      // Never true here, whatever the subject: the reader is an operator, and
      // the subject is somebody else by construction.
      isSelf: false,
      classes: classes.map((entry) => ({ classId: entry.id, name: entry.name })),
      leaderboardEnabled: enabled.has("STUDENT_CLASS_LEADERBOARD"),
    };
  }

  /**
   * The student an operator named, or the same refusal an absent one gets.
   *
   * `requireReadableStudent`'s counterpart for a reader with no membership. It
   * carries no teacher-assignment narrowing — an operator's reach is the whole
   * academy, which is what `platformScope` already grants for classes — but it
   * keeps the two rules that matter: the membership must be an `ACTIVE`
   * `STUDENT`, and it must belong to *this* academy.
   */
  private async requirePlatformSubject(
    academyId: string,
    membershipId: string,
  ): Promise<{ id: string; name: string }> {
    const subject = await this.prisma.academyMembership.findFirst({
      where: {
        id: membershipId,
        academyId,
        role: "STUDENT",
        status: "ACTIVE",
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
    return { id: subject.id, name: displayNameOf(subject) };
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

    if (!reader) {
      // A platform operator, who holds no membership. Same fallback as
      // `resolve`, with the class name this board also reports.
      const scope = await this.platformScope(identity, input);
      const target = input.classId
        ? scope.classes.find((entry) => entry.classId === input.classId)
        : scope.classes[0];
      if (input.classId && !target) {
        throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
      }
      return { ...scope, className: target?.name ?? null };
    }
    if (reader.academy.status !== "ACTIVE" || reader.role === "STUDENT") {
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

  /**
   * The class-scoped preview shared by all four academy overviews.
   *
   * Students follow their enrollments; teachers follow their assignments;
   * team leads and managers may choose any active class. The complete class
   * list and the selected board come from this one scope so the picker can
   * never offer a class the next request would reject.
   */
  async resolveOverviewBoard(
    identity: SupabaseIdentity,
    input: { academyId: string; classId?: string },
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
        academy: { select: { timeZone: true, status: true } },
      },
    });

    if (!reader) {
      // A platform operator standing in one of the academy's roles. They hold
      // no membership, so the lookup above finds nothing — and the board is a
      // read of the academy, not of themselves. `AcademyAccessService` is the
      // authority here, as it is everywhere else; this service resolving its
      // own reader from a membership row is why it had to be asked separately.
      return this.platformScope(identity, input);
    }
    if (reader.academy.status !== "ACTIVE") {
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }

    const enabled = await this.enabledFeatures(input.academyId);
    if (
      !enabled.has("STUDENT_POINTS") ||
      !enabled.has("STUDENT_CLASS_LEADERBOARD")
    ) {
      throw new AppException("POINTS_UNAVAILABLE", HttpStatus.NOT_FOUND);
    }

    const classes =
      reader.role === "STUDENT"
        ? await this.classesFor(reader.id, null)
        : (
            await this.prisma.class.findMany({
              where: {
                academyId: input.academyId,
                status: "ACTIVE",
                ...(reader.role === "TEACHER"
                  ? { teacherMembershipId: reader.id }
                  : {}),
              },
              orderBy: { name: "asc" },
              select: { id: true, name: true },
            })
          ).map((entry) => ({ classId: entry.id, name: entry.name }));

    if (
      input.classId &&
      !classes.some((entry) => entry.classId === input.classId)
    ) {
      // Not-found for both an absent and an unauthorized id prevents class
      // enumeration outside the reader's scope.
      throw new AppException("POINTS_ACCESS_DENIED", HttpStatus.NOT_FOUND);
    }

    return {
      academyId: input.academyId,
      timeZone: reader.academy.timeZone,
      membershipId: reader.id,
      subjectName: displayNameOf(reader),
      isSelf: reader.role === "STUDENT",
      classes,
      leaderboardEnabled: true,
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
