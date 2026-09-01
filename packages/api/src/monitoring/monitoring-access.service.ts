import { HttpStatus, Injectable } from "@nestjs/common";
import { roleCanMonitor } from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  assignedClassWhere,
  classStudentWhere,
  classTaughtMaterialWhere,
} from "../classes/assigned-class-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * The one gate in front of every live monitoring read and command.
 *
 * The oRPC endpoints and the realtime gateway both come through here, so an
 * event handler cannot obtain a class or a student without also obtaining the
 * facts that authorized it. Each method returns a claim rather than a boolean:
 * a caller holding a `MonitoringStudentClaim` is holding proof, not a
 * remembered decision from an earlier request.
 *
 * Claims are short-lived server objects. They are never serialized to a
 * client, and `grantedAt` exists so a long-lived socket revalidates instead of
 * trusting a decision made half an hour ago.
 */

export type MonitoringTeacherActor = {
  userId: string;
  academyId: string;
  /** The teacher's own membership, which is what a class assignment stores.
   *  Empty for a platform operator, who holds none. */
  membershipId: string;
  /**
   * Which classes this actor's teaching surfaces cover.
   *
   * `assigned` is every teacher: the classes their membership is named on.
   * `academy` is somebody standing in the Teacher role without a membership —
   * a platform operator, or an operator inside a support session. Neither has
   * a membership for a class to be assigned to, so the assignment joins would
   * select nothing and "My classes" would be permanently empty.
   *
   * It widens *reading* only — the class list and a class's roster. The live
   * socket refuses it outright (`requireLiveWatch`), so watching a student's
   * screen still needs a real assignment.
   */
  scope?: 'assigned' | 'academy';
};

export type MonitoringClassClaim = MonitoringTeacherActor & {
  classId: string;
  grantedAt: number;
};

export type MonitoringStudentClaim = MonitoringClassClaim & {
  studentMembershipId: string;
  studentUserId: string;
};

export type MonitoringMaterialClaim = MonitoringStudentClaim & {
  materialId: string;
  courseId: string;
};

@Injectable()
export class MonitoringAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
  ) {}

  async isFeatureEnabled(academyId: string): Promise<boolean> {
    const flag = await this.prisma.academyFeatureFlag.findUnique({
      where: {
        academyId_feature: { academyId, feature: "TEACHER_LIVE_MONITORING" },
      },
      select: { isEnabled: true },
    });
    // A missing row is off: an academy is never inside a rollout by default.
    return flag?.isEnabled ?? false;
  }

  async requireFeature(academyId: string): Promise<void> {
    if (!(await this.isFeatureEnabled(academyId))) {
      throw new AppException("MONITORING_DISABLED", HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Resolves the acting teacher, or refuses.
   *
   * `classes.assigned.manage` alone is not enough. Team Leads hold it for
   * later operational reasons, so monitoring additionally requires the actor
   * to be an active `TEACHER` — the explicit conjunction that stops a change
   * to the role map from quietly handing monitoring to another role.
   */
  async requireTeacher(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<MonitoringTeacherActor> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "classes.assigned.manage",
    );
    if (!roleCanMonitor(actor.role)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    const membership = await this.prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: actor.userId } },
      select: { id: true },
    });
    if (!membership) {
      // A platform operator, or an operator inside a support session. Both
      // read the academy's classes; `requireLiveWatch` still refuses them the
      // live watch, which is the thing this service exists to protect.
      if (actor.via === "platform" || actor.via === "support") {
        return {
          userId: actor.userId,
          academyId,
          membershipId: "",
          scope: "academy",
        };
      }
      throw new AppException(
        "ACADEMY_MEMBERSHIP_REQUIRED",
        HttpStatus.FORBIDDEN,
      );
    }
    return { userId: actor.userId, academyId, membershipId: membership.id };
  }

  /**
   * One academy-scoped query for the whole effective-assignment predicate.
   *
   * Not a re-read of the class followed by checks in TypeScript: the joins are
   * the check, so a class in another academy, an archived one, or one assigned
   * to somebody else is not merely rejected — it is never selected.
   */
  async requireAssignedClass(
    actor: MonitoringTeacherActor,
    classId: string,
  ): Promise<MonitoringClassClaim> {
    const record = await this.prisma.class.findFirst({
      where: { id: classId, ...assignedClassWhere(actor) },
      select: { id: true },
    });
    if (!record) {
      // One code for every failure — not assigned, archived, wrong academy,
      // suspended membership, no such class — so a teacher cannot map another
      // academy's classes by reading the errors they get back.
      throw new AppException(
        "MONITORING_ACCESS_DENIED",
        HttpStatus.FORBIDDEN,
      );
    }
    return { ...actor, classId, grantedAt: Date.now() };
  }

  /**
   * The gate in front of the live socket, and nothing else.
   *
   * Reading a class — who is in it, what it teaches — is a read, and a platform
   * operator standing in the Teacher role does it academy-wide. Watching a
   * student work is not: it is a live channel into one named child's screen,
   * and it belongs to the teacher responsible for them. An academy-wide actor
   * has no such responsibility, so this is where the platform's reach stops.
   */
  requireLiveWatch(actor: MonitoringTeacherActor): void {
    if (actor.scope === "academy") {
      throw new AppException("MONITORING_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }
  }

  /** The classes this teacher is currently responsible for, and no others. */
  assignedClassScope(actor: MonitoringTeacherActor): Prisma.ClassWhereInput {
    return assignedClassWhere(actor);
  }

  /**
   * The caller as a student of this academy.
   *
   * The counterpart to `requireTeacher`, and the only authorization a student
   * reading their own feedback needs. It takes no membership id — the identity
   * is the subject, so there is no parameter here that could name somebody
   * else. Returns the membership id every student-owned row is keyed on.
   */
  async requireStudentSelf(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ academyId: string; membershipId: string; userId: string }> {
    const membership = await this.prisma.academyMembership.findFirst({
      where: {
        academyId,
        role: "STUDENT",
        status: "ACTIVE",
        user: { authUserId: identity.authUserId, status: "ACTIVE" },
      },
      select: { id: true, userId: true },
    });
    if (!membership) {
      throw new AppException("MONITORING_ACCESS_DENIED", HttpStatus.FORBIDDEN);
    }
    return {
      academyId,
      membershipId: membership.id,
      userId: membership.userId,
    };
  }

  async requireMonitorableStudent(
    claim: MonitoringClassClaim,
    studentMembershipId: string,
  ): Promise<MonitoringStudentClaim> {
    const membership = await this.prisma.academyMembership.findFirst({
      where: {
        id: studentMembershipId,
        ...monitorableStudentWhere(claim.academyId, claim.classId),
      },
      select: { id: true, userId: true },
    });
    if (!membership) {
      throw new AppException(
        "MONITORING_STUDENT_UNAVAILABLE",
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      ...claim,
      studentMembershipId: membership.id,
      studentUserId: membership.userId,
    };
  }

  /**
   * The exercise a teacher may open beside this student.
   *
   * Reachability is measured through *this* class's assigned courses, not
   * through everything the student can reach: a student sitting in two classes
   * must not expose one class's work to the other class's teacher.
   */
  async requireMonitorableMaterial(
    claim: MonitoringStudentClaim,
    materialId: string,
  ): Promise<MonitoringMaterialClaim> {
    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        ...monitoredMaterialWhere(claim.academyId, claim.classId),
      },
      select: { id: true, lecture: { select: { courseModule: { select: { courseId: true } } } } },
    });
    if (!material) {
      throw new AppException(
        "MONITORING_STUDENT_UNAVAILABLE",
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      ...claim,
      materialId: material.id,
      courseId: material.lecture.courseModule.courseId,
    };
  }

  /** Where clause form, for the read services that need to join through it. */
  monitoredMaterialScope(claim: MonitoringClassClaim): Prisma.MaterialWhereInput {
    return monitoredMaterialWhere(claim.academyId, claim.classId);
  }

  monitorableStudentScope(
    claim: MonitoringClassClaim,
  ): Prisma.AcademyMembershipWhereInput {
    return monitorableStudentWhere(claim.academyId, claim.classId);
  }
}

/**
 * The assigned-class, student, and curriculum predicates all live in
 * `classes/assigned-class-access.ts` — they are the same facts Solution status
 * authorizes on, and one definition is what keeps the two features from
 * drifting apart. `grantsLiveMonitoring` in `@cove/shared` is the canonical
 * statement of the rule; both are tested against the same denial cases.
 */
const monitorableStudentWhere = classStudentWhere;
const monitoredMaterialWhere = classTaughtMaterialWhere;
