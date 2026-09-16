import { Injectable } from "@nestjs/common";
import {
  TEACHER_ROSTER_MAX_STUDENTS,
  rankEntries,
  resolvePointsPeriod,
  type TeacherRoster,
  type TeacherRosterClass,
  type TeacherRosterInput,
  type TeacherRosterStudent,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { LeaderboardRepository } from "../points/leaderboard.repository.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import {
  TeacherOverviewAccessService,
  type TeacherOverviewScope,
} from "./teacher-overview-access.service.js";
import { TeacherOverviewRepository } from "./teacher-overview.repository.js";
import { aggregateScopeFor } from "./teacher-overview.service.js";

/**
 * The teacher's students as a roster: who they are, and where they stand.
 *
 * ## One authorization unit
 *
 * The scope comes from `TeacherOverviewAccessService.requireScope`, the same
 * call the analytics list makes. "Which students may this teacher see" is one
 * question, and resolving it twice would eventually be two answers — the sort
 * of divergence nobody notices until a teacher sees a student in one view and
 * not the other.
 *
 * ## All-time, per class
 *
 * A standing is read at the all-time period, because "total score" is the only
 * claim a roster can make honestly; a weekly board answers a question the
 * reader did not ask. It is computed per class because that is the only cohort
 * the platform ranks within — a rank across a teacher's three classes would be
 * a rank in a competition none of those students entered.
 */
@Injectable()
export class TeacherRosterService {
  constructor(
    private readonly access: TeacherOverviewAccessService,
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
    private readonly leaderboard: LeaderboardRepository,
    private readonly overview: TeacherOverviewRepository,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: TeacherRosterInput,
  ): Promise<TeacherRoster> {
    const scope = await this.access.requireScope(identity, {
      academyId: input.academyId,
      ...(input.classId ? { classId: input.classId } : {}),
    });

    const now = new Date();
    const generatedAt = now.toISOString();
    const classOptions = scope.classOptions.map((option) => ({
      value: option.value,
      label: option.label,
    }));
    if (scope.classes.length === 0) {
      return {
        classes: [],
        classOptions,
        pointsEnabled: false,
        truncated: false,
        generatedAt,
      };
    }

    const search = (input.search ?? "").trim().toLowerCase();
    const pointsEnabled = Boolean(
      await this.prisma.academyFeatureFlag.findFirst({
        where: {
          academyId: scope.actor.academyId,
          feature: "STUDENT_POINTS",
          isEnabled: true,
        },
        select: { academyId: true },
      }),
    );

    // Identity for every student in scope, in one read rather than per class:
    // a student in two of this teacher's classes is one membership and must
    // not be two queries.
    const identities = await this.identities(scope.membershipIds);
    const period = resolvePointsPeriod("all", now, scope.timeZone);

    const [avatars, solved, boards] = await Promise.all([
      resolveMemberAvatars(
        this.media,
        [...identities.values()].map((row) => ({ ...row, key: row.id })),
      ),
      this.solvedCounts(scope, now),
      // Every class's board at once. Serially this was three queries per
      // class in a loop, so a teacher running ten classes waited on thirty
      // round trips to draw one page.
      Promise.all(
        scope.classes.map((entry) =>
          pointsEnabled
            ? this.standing(scope.actor.academyId, entry.classId, period)
                // §4.5 — a board that cannot be read costs the teacher two
                // columns in this one class, not the page. `UNAVAILABLE` is
                // the apology, and it is reachable only from here.
                .catch(() => null)
            : Promise.resolve(null),
        ),
      ),
    ]);

    /**
     * How many students are left before the cap.
     *
     * Counted down as classes are filled, and separate from `truncated`
     * below: reaching exactly the cap drops nobody, and a roster of precisely
     * 500 students is complete rather than cut short.
     */
    let remaining = TEACHER_ROSTER_MAX_STUDENTS;
    let truncated = false;
    const classes: TeacherRosterClass[] = [];

    for (const [index, entry] of scope.classes.entries()) {
      const standing = boards[index] ?? null;

      const matching: TeacherRosterStudent[] = [];
      for (const student of entry.students) {
        const row = identities.get(student.membershipId);
        if (!row) continue;
        const displayName =
          row.memberProfile?.academyDisplayName?.trim() ||
          row.user.displayName?.trim() ||
          row.user.username?.trim() ||
          student.displayName;
        if (
          search &&
          !`${displayName} ${row.user.username ?? ""}`
            .toLowerCase()
            .includes(search)
        ) {
          continue;
        }

        const mine = standing?.rows.get(student.membershipId);
        matching.push({
          membershipId: student.membershipId,
          displayName,
          username: row.user.username,
          joinedAt: row.joinedAt?.toISOString() ?? null,
          avatar: avatars.get(row.id) ?? noMemberAvatar,
          solvedProblems: solved.get(student.userId) ?? 0,
          ...(standing && mine
            ? {
                points: mine.points,
                // Present only when the board is ranked at all. An unranked
                // class has no positions to hand out, including to this
                // student — and 1st of nobody is not a fact.
                ...(standing.ranked ? { position: mine.position } : {}),
              }
            : {}),
        });
      }

      const students = matching.slice(0, Math.max(remaining, 0));
      if (students.length < matching.length) truncated = true;
      remaining -= students.length;

      // A class the cap cut away entirely is left out, not drawn empty. The
      // section heading carries a student count, and "0 students" is a claim
      // about the class; the true claim is that the roster stopped before
      // reaching it, which `truncated` makes.
      if (students.length === 0 && matching.length > 0) continue;

      classes.push({
        classId: entry.classId,
        name: entry.className,
        students,
        // Omitted, not reasoned about, when the academy keeps no score. Every
        // reason this union carries is a statement about a board, and an
        // academy that runs no points has none for `NO_ACTIVITY_YET` to be
        // false about.
        ...(pointsEnabled
          ? {
              board:
                standing === null
                  ? ({ ranked: false, reason: "UNAVAILABLE" } as const)
                  : standing.ranked
                    ? ({ ranked: true } as const)
                    : ({ ranked: false, reason: "NO_ACTIVITY_YET" } as const),
            }
          : {}),
      });
    }

    return {
      classes,
      classOptions,
      pointsEnabled,
      truncated,
      generatedAt,
    };
  }

  /** Name, sign-in name, join date and photo for everybody in scope. */
  private async identities(membershipIds: readonly string[]) {
    const rows = await this.prisma.academyMembership.findMany({
      where: { id: { in: [...membershipIds] } },
      select: {
        id: true,
        joinedAt: true,
        user: {
          select: {
            displayName: true,
            username: true,
            ...memberAvatarSelect.user.select,
          },
        },
        memberProfile: {
          select: {
            academyDisplayName: true,
            ...memberAvatarSelect.memberProfile.select,
          },
        },
      },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * Solved problems per student, over everything.
   *
   * §4.2 — the same unit `student-facts` measures with, so the count beside a
   * name in Roster view and the count beside the same name in Analytics view
   * cannot disagree. `workByStudent` is where "solved" is defined: a distinct
   * problem with at least one counted passing attempt, against the live
   * material relation, at the revision the problem currently grades at.
   *
   * Counting `StudentExerciseProgress` rows instead was cheaper and wrong.
   * That table is keyed on user and material with no academy column, so a
   * student enrolled at two academies carried the other one's work into this
   * roster, and its notion of solved is not the one the table next door
   * prints.
   *
   * The period has no start, which is what makes the claim lifetime. The
   * analytics view narrows; this one does not.
   */
  private async solvedCounts(scope: TeacherOverviewScope, now: Date) {
    if (scope.students.length === 0 || scope.materialIds.length === 0) {
      return new Map<string, number>();
    }
    const rows = await this.overview.workByStudent(aggregateScopeFor(scope), {
      startAt: null,
      endAt: now,
    });
    return new Map(rows.map((row) => [row.userId, row.solvedProblems]));
  }

  /**
   * One class's board, as a lookup.
   *
   * `ranked` is false when nobody in the class has earned anything — the same
   * condition `PointsService` reports as `NO_ACTIVITY_YET`. Points are still
   * returned in that case, and they are all zero; what is withheld is the
   * position, because ordering a field of zeroes produces a ranking that says
   * nothing and looks like it says something.
   */
  private async standing(
    academyId: string,
    classId: string,
    period: ReturnType<typeof resolvePointsPeriod>,
  ) {
    const members = await this.leaderboard.roster(classId);
    const ids = members.map((member) => member.membershipId);
    const [totals, days] = await Promise.all([
      this.leaderboard.totals(academyId, classId, ids, period),
      this.leaderboard.activeDays(classId, ids, period),
    ]);

    const ranked = rankEntries(
      members.map((member) => ({
        membershipId: member.membershipId,
        points: totals.get(member.membershipId)?.points ?? 0,
        solvedProblems: totals.get(member.membershipId)?.solvedProblems ?? 0,
        activeDays: days.get(member.membershipId) ?? 0,
      })),
    );

    return {
      ranked: ranked.some((row) => row.points > 0),
      rows: new Map(ranked.map((row) => [row.membershipId, row])),
    };
  }
}
