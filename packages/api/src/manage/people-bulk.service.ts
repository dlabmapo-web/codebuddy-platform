import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  BULK_MAX_TARGETS,
  bulkEligibility,
  wouldStrandAcademy,
  type BulkConsequence,
  type BulkOptions,
  type BulkPreview,
  type BulkResult,
  type BulkResultRow,
  type PeopleSelection,
  type PreviewBulkInput,
  type RunBulkInput,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import {
  ManagerScopeService,
  memberDisplayName,
  type ManagerActor,
} from "./manager-scope.service.js";
import { bumpPeopleRevision } from "./people-revision.js";

/**
 * §12 — bulk enrolment, role changes, suspension, and restoration.
 *
 * The whole service exists to make one guarantee true: **all validated targets
 * change, or none do.** A bulk operation that half-applied would leave a
 * manager with no way to know which half, and no safe way to retry.
 *
 * That guarantee has four parts, and each is a decision below.
 *
 * *One transaction.* Every write for one operation happens inside a single
 * `$transaction`, and the academy row is locked at the top of it. The lock is
 * not decorative: it serializes this operation against imports, single
 * invitations, and other bulk operations, all of which move the same revision.
 *
 * *Idempotency before work.* The operation row is inserted first, with a unique
 * key. A retry after a lost response collides on that index and returns the
 * original result instead of suspending two hundred people a second time.
 *
 * *Eligibility decided once.* `bulkEligibility` in `@cove/shared` is called by
 * both the preview and the commit, so the count a manager approves is the count
 * that changes. Two implementations is how a confirmation says 40 and a result
 * says 37.
 *
 * *Consequences published before confirmation.* Suspending a teacher strands
 * the classes they run; changing a Student to a Teacher drops their enrolments.
 * The directory cannot show either, so the preview names them.
 *
 * Monitoring revocation and email delivery both happen after the commit, never
 * inside it — §12 is explicit, and both are network calls that must not be able
 * to roll back a roster change.
 */
@Injectable()
export class PeopleBulkService {
  private readonly logger = new Logger(PeopleBulkService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly revocation: MonitoringRevocationService,
  ) {}

  /* ------------------------------------------------------------- preview */

  /** What would happen, without anything happening. */
  async preview(
    identity: SupabaseIdentity,
    input: PreviewBulkInput,
  ): Promise<BulkPreview> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );

    const targets = await this.resolveTargets(
      input.academyId,
      input.selection,
      this.prisma,
    );
    const academy = await this.prisma.academy.findUniqueOrThrow({
      where: { id: input.academyId },
      select: { peopleRevision: true },
    });

    const decided = await this.decide(
      input.academyId,
      targets,
      input.options,
      this.prisma,
    );

    return {
      kind: input.options.kind,
      affected: decided.eligible.length,
      blocked: decided.blocked.length,
      consequences: await this.consequencesFor(
        input.academyId,
        decided,
        input.options,
      ),
      peopleRevision: academy.peopleRevision,
    };
  }

  /* ----------------------------------------------------------------- run */

  async run(
    identity: SupabaseIdentity,
    input: RunBulkInput,
  ): Promise<BulkResult> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    this.rateLimit.assert(`bulk-run:${input.academyId}`, 20, 60_000);

    // Idempotent replay, checked before any work. §14 — the same key returns
    // the original result, which is the only safe answer when the first
    // attempt may already have committed.
    const existing = await this.prisma.peopleBulkOperation.findUnique({
      where: {
        academyId_kind_idempotencyKey: {
          academyId: input.academyId,
          kind: input.options.kind,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.status === "PENDING") {
        throw new AppException(
          "BULK_OPERATION_IN_PROGRESS",
          HttpStatus.CONFLICT,
        );
      }
      return toResult(existing, true);
    }

    const outcome = await this.prisma.$transaction(async (transaction) => {
      // The serialization point for every people mutation in this academy.
      await transaction.$queryRaw`
        SELECT id FROM academies WHERE id = ${input.academyId}::uuid FOR UPDATE
      `;
      const academy = await transaction.academy.findUniqueOrThrow({
        where: { id: input.academyId },
        select: { peopleRevision: true },
      });
      if (academy.peopleRevision !== input.peopleRevision) {
        throw new AppException("PEOPLE_REVISION_CONFLICT", HttpStatus.CONFLICT);
      }

      const targets = await this.resolveTargets(
        input.academyId,
        input.selection,
        transaction,
      );
      const decided = await this.decide(
        input.academyId,
        targets,
        input.options,
        transaction,
      );

      if (decided.eligible.length === 0) {
        throw new AppException(
          "BULK_SELECTION_EMPTY",
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      // Claimed inside the transaction, so the unique index rejects a
      // concurrent duplicate rather than two operations both proceeding.
      const operation = await transaction.peopleBulkOperation.create({
        data: {
          academyId: input.academyId,
          actorUserId: actor.userId,
          kind: input.options.kind,
          selection: input.selection as unknown as Prisma.InputJsonValue,
          requestedCount: targets.length,
          idempotencyKey: input.idempotencyKey,
          status: "PENDING",
        },
      });

      const rows = await this.apply({
        actor,
        academyId: input.academyId,
        eligible: decided.eligible,
        blocked: decided.blocked,
        options: input.options,
        transaction,
      });

      const succeeded = rows.filter((row) => row.outcome === "changed").length;
      const completed = await transaction.peopleBulkOperation.update({
        where: { id: operation.id },
        data: {
          status: "COMPLETED",
          succeededCount: succeeded,
          failedCount: rows.length - succeeded,
          result: rows as unknown as Prisma.InputJsonValue,
        },
      });

      // §12 — one operation summary plus the affected records, in the same
      // transaction as the change. An audit trail written afterwards disagrees
      // with the database whenever the process dies in between.
      await this.audit.write(transaction, {
        actorUserId: actor.userId,
        academyId: input.academyId,
        action: `academy.people.bulk.${input.options.kind.toLowerCase()}`,
        targetType: "PeopleBulkOperation",
        targetId: operation.id,
        after: {
          kind: input.options.kind,
          requested: targets.length,
          succeeded,
          failed: rows.length - succeeded,
        },
      });

      await bumpPeopleRevision(transaction, input.academyId);

      return {
        operation: completed,
        replayed: false,
        revokeMemberships: decided.eligible
          .filter(() => needsRevocation(input.options))
          .map((member) => member.id),
      };
    }).catch(async (error: unknown) => {
      // A concurrent retry can pass the optimistic lookup before the first
      // request commits, then lose on the durable unique key after waiting for
      // the academy lock. That collision is an idempotent replay, not a 500.
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.prisma.peopleBulkOperation.findUnique({
        where: {
          academyId_kind_idempotencyKey: {
            academyId: input.academyId,
            kind: input.options.kind,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!replay || replay.status === "PENDING") {
        throw new AppException("BULK_OPERATION_IN_PROGRESS", HttpStatus.CONFLICT);
      }
      return { operation: replay, replayed: true, revokeMemberships: [] };
    });

    // §12 — monitoring revocation publishes only after the commit. Revoking
    // inside the transaction would cut a teacher's live session for a change
    // that then rolled back.
    //
    // Both sides of every watch are revoked: the person may have been the
    // teacher watching or the student being watched, and a membership that is
    // no longer active must not remain in either seat.
    for (const membershipId of outcome.revokeMemberships) {
      await Promise.all([
        this.revocation.revokeTeacher(membershipId, "MEMBERSHIP_INACTIVE"),
        this.revocation.revokeStudent(membershipId, "MEMBERSHIP_INACTIVE"),
      ]).catch((error: unknown) =>
        this.logger.warn(
          `monitoring revocation after bulk failed: ${
            error instanceof Error ? error.message : "unknown"
          }`,
        ),
      );
    }

    this.logger.log(
      `bulk ${input.options.kind} academy=${input.academyId} ` +
        `succeeded=${outcome.operation.succeededCount} ` +
        `failed=${outcome.operation.failedCount}`,
    );

    return toResult(outcome.operation, outcome.replayed);
  }

  /* ------------------------------------------------------------ internals */

  /**
   * Who the selection names, resolved on the server.
   *
   * A filter selection is expanded here and nowhere else — §12 forbids the
   * browser expanding it, because the set it would send is the set as it was
   * when the page rendered, not as it is when the mutation runs.
   *
   * The cap is applied after resolution and refuses rather than truncating. An
   * operation that silently suspended the first 500 of 1,840 matches would be
   * the worst possible outcome: plausible, wrong, and impossible to notice.
   */
  private async resolveTargets(
    academyId: string,
    selection: PeopleSelection,
    client: Pick<PrismaService, "academyMembership">,
  ): Promise<TargetMember[]> {
    const where: Prisma.AcademyMembershipWhereInput =
      selection.mode === "ids"
        ? { academyId, id: { in: selection.membershipIds } }
        : {
            academyId,
            id:
              selection.excludedMembershipIds.length > 0
                ? { notIn: selection.excludedMembershipIds }
                : undefined,
            status:
              selection.statuses.length > 0
                ? { in: selection.statuses }
                : { not: "LEFT" },
            ...(selection.roles.length > 0
              ? { role: { in: selection.roles } }
              : {}),
            user: { status: { not: "DELETED" } },
            ...(selection.search
              ? {
                  OR: [
                    {
                      user: {
                        displayName: {
                          contains: selection.search,
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      user: {
                        email: {
                          contains: selection.search,
                          mode: "insensitive",
                        },
                      },
                    },
                    {
                      memberProfile: {
                        academyDisplayName: {
                          contains: selection.search,
                          mode: "insensitive",
                        },
                      },
                    },
                  ],
                }
              : {}),
          };

    const members = await client.academyMembership.findMany({
      where,
      select: {
        id: true,
        role: true,
        status: true,
        user: { select: { displayName: true, username: true, email: true } },
        memberProfile: { select: { academyDisplayName: true } },
        extraRoles: { select: { role: true } },
        assignedClasses: {
          where: { status: "ACTIVE" },
          select: { id: true },
        },
        // Assisting a class is teaching it, so it strands the same way.
        assistedClasses: {
          where: { class: { status: "ACTIVE" } },
          select: { classId: true },
        },
        classEnrollments: {
          where: { class: { status: "ACTIVE" } },
          select: { classId: true },
        },
      },
      // One past the cap, so "too many" is distinguishable from "exactly the
      // cap" without a second count query.
      take: BULK_MAX_TARGETS + 1,
      orderBy: { id: "asc" },
    });

    if (members.length > BULK_MAX_TARGETS) {
      throw new AppException(
        "BULK_SELECTION_EMPTY",
        HttpStatus.UNPROCESSABLE_ENTITY,
        `selection exceeds ${BULK_MAX_TARGETS}`,
      );
    }

    return members.map((member) => ({
      id: member.id,
      role: member.role,
      status: member.status,
      displayName: memberDisplayName(member),
      extraRoles: member.extraRoles.map((entry) => entry.role),
      teachesClassIds: [
        ...member.assignedClasses.map((entry) => entry.id),
        ...member.assistedClasses.map((entry) => entry.classId),
      ],
      enrolledClassIds: member.classEnrollments.map((entry) => entry.classId),
    }));
  }

  /**
   * Split the selection into what will change and what will not.
   *
   * The last-active-manager rule is applied here, once, over the whole
   * selection rather than per row. A per-row check would let a manager select
   * both remaining managers and have each row individually conclude "there is
   * still another one".
   */
  private async decide(
    academyId: string,
    targets: TargetMember[],
    options: BulkOptions,
    client: Pick<PrismaService, "academyMembership">,
  ): Promise<Decided> {
    const eligible: TargetMember[] = [];
    const blocked: BlockedMember[] = [];

    for (const target of targets) {
      const verdict = bulkEligibility(target, options);
      if (verdict.eligible) eligible.push(target);
      else blocked.push({ member: target, code: verdict.code });
    }

    const removesManagers =
      options.kind === "SUSPEND" ||
      (options.kind === "ROLE_CHANGE" && options.role !== "MANAGER");
    if (removesManagers) {
      const losing = eligible.filter(
        (target) => target.role === "MANAGER" && target.status === "ACTIVE",
      );
      if (losing.length > 0) {
        const activeManagers = await client.academyMembership.count({
          where: { academyId, role: "MANAGER", status: "ACTIVE" },
        });
        if (
          wouldStrandAcademy({
            activeManagers,
            managersLosingTheRole: losing.length,
          })
        ) {
          // Every manager in the selection is blocked, not an arbitrary one:
          // choosing which manager survives is the academy's decision, and a
          // bulk operation must not make it for them.
          const losingIds = new Set(losing.map((target) => target.id));
          return {
            eligible: eligible.filter((target) => !losingIds.has(target.id)),
            blocked: [
              ...blocked,
              ...losing.map((member) => ({
                member,
                code: "last_manager_blocked",
              })),
            ],
          };
        }
      }
    }

    return { eligible, blocked };
  }

  /** §12 — the consequences a manager cannot see from the table. */
  private async consequencesFor(
    academyId: string,
    decided: Decided,
    options: BulkOptions,
  ): Promise<BulkConsequence[]> {
    const consequences: BulkConsequence[] = [];

    const add = (
      kind: BulkConsequence["kind"],
      members: { displayName: string }[],
    ) => {
      if (members.length === 0) return;
      consequences.push({
        kind,
        count: members.length,
        sample: members.slice(0, 5).map((member) => member.displayName),
      });
    };

    if (options.kind === "SUSPEND") {
      add(
        "teacher_assignments_stranded",
        decided.eligible.filter((member) => member.teachesClassIds.length > 0),
      );
      add(
        "monitoring_revoked",
        decided.eligible.filter(holdsTeacher),
      );
    }

    if (options.kind === "ROLE_CHANGE") {
      // A Student promoted out of the role loses their seat in every class:
      // enrolment is a Student-only relation, and nothing else on this page
      // would tell the manager that.
      add(
        "enrollments_dropped",
        decided.eligible.filter(
          (member) =>
            member.role === "STUDENT" &&
            options.role !== "STUDENT" &&
            member.enrolledClassIds.length > 0,
        ),
      );
      // Stranded only if the change actually takes TEACHER away. A bulk role
      // change rewrites the primary role and leaves extra grants alone, so a
      // member moved to MANAGER who still holds TEACHER keeps their classes
      // and must not be warned about losing them.
      add(
        "teacher_assignments_stranded",
        decided.eligible.filter(
          (member) =>
            holdsTeacher(member) &&
            !holdsTeacherAfterRoleChange(member, options.role) &&
            member.teachesClassIds.length > 0,
        ),
      );
    }

    if (options.kind === "ENROLL") {
      add(
        "already_in_state",
        decided.eligible.filter((member) =>
          member.enrolledClassIds.includes(options.classId),
        ),
      );
    }

    for (const code of ["already_in_state", "last_manager_blocked"] as const) {
      add(
        code,
        decided.blocked
          .filter((entry) => entry.code === code)
          .map((entry) => entry.member),
      );
    }
    add(
      "ineligible",
      decided.blocked
        .filter(
          (entry) =>
            entry.code !== "already_in_state" &&
            entry.code !== "last_manager_blocked",
        )
        .map((entry) => entry.member),
    );

    return consequences;
  }

  /**
   * The writes, all of them, inside the caller's transaction.
   *
   * Grouped by kind rather than looped per member: four `updateMany` calls beat
   * four hundred `update` calls, and a set-based write is also the one that
   * cannot partially succeed.
   */
  private async apply(input: {
    actor: ManagerActor;
    academyId: string;
    eligible: TargetMember[];
    blocked: BlockedMember[];
    options: BulkOptions;
    transaction: Prisma.TransactionClient;
  }): Promise<BulkResultRow[]> {
    const { transaction, options } = input;
    const ids = input.eligible.map((member) => member.id);
    const now = new Date();

    switch (options.kind) {
      case "SUSPEND":
        await transaction.academyMembership.updateMany({
          where: { id: { in: ids }, academyId: input.academyId },
          data: { status: "SUSPENDED", suspendedAt: now },
        });
        break;

      case "RESTORE":
        await transaction.academyMembership.updateMany({
          where: { id: { in: ids }, academyId: input.academyId },
          data: { status: "ACTIVE", suspendedAt: null },
        });
        break;

      case "ROLE_CHANGE": {
        await transaction.academyMembership.updateMany({
          where: { id: { in: ids }, academyId: input.academyId },
          data: { role: options.role },
        });
        // A member who is no longer a Student cannot hold a class seat. Removed
        // in the same transaction, so the roster and the role never disagree —
        // the preview said this would happen.
        if (options.role !== "STUDENT") {
          await transaction.classEnrollment.deleteMany({
            where: { membershipId: { in: ids } },
          });
        }
        // Likewise a class whose teacher is no longer a Teacher is unassigned
        // rather than left pointing at somebody who cannot teach it.
        //
        // Scoped to members who no longer hold TEACHER *at all*: this writes
        // the primary role only, so somebody moved to MANAGER who still holds
        // a TEACHER grant beside it keeps every class they run.
        if (options.role !== "TEACHER") {
          const lostTeacher = {
            extraRoles: { none: { role: "TEACHER" } },
          } satisfies Prisma.AcademyMembershipWhereInput;
          await transaction.class.updateMany({
            where: {
              academyId: input.academyId,
              teacherMembershipId: { in: ids },
              assignedTeacher: lostTeacher,
            },
            data: { teacherMembershipId: null },
          });
          // An assistant has no "unassigned" state to fall back to, so the
          // row goes rather than being emptied.
          await transaction.classAssistantTeacher.deleteMany({
            where: {
              membershipId: { in: ids },
              class: { academyId: input.academyId },
              teacher: lostTeacher,
            },
          });
        }
        break;
      }

      case "ENROLL": {
        const target = await transaction.class.findUnique({
          where: { id: options.classId },
          select: { id: true, academyId: true, status: true },
        });
        // §12 — an archived class or another academy's class fails the whole
        // operation rather than being skipped. A manager who named the wrong
        // class must be told, not quietly obeyed for a subset.
        if (
          !target ||
          target.academyId !== input.academyId ||
          target.status !== "ACTIVE"
        ) {
          throw new AppException("CLASS_NOT_FOUND", HttpStatus.NOT_FOUND);
        }
        await transaction.classEnrollment.createMany({
          data: ids.map((membershipId) => ({
            classId: options.classId,
            membershipId,
            enrolledByUserId: input.actor.userId,
          })),
          // A member already enrolled is not an error — the preview called it
          // `already_in_state` — and re-enrolling them must not fail the batch.
          skipDuplicates: true,
        });
        break;
      }

    }

    return [
      ...input.eligible.map(
        (member): BulkResultRow => ({
          membershipId: member.id,
          displayName: member.displayName,
          outcome: "changed",
          code: "ok",
        }),
      ),
      ...input.blocked.map(
        (entry): BulkResultRow => ({
          membershipId: entry.member.id,
          displayName: entry.member.displayName,
          outcome:
            entry.code === "already_in_state" ? "skipped" : "blocked",
          code: entry.code,
        }),
      ),
    ];
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

type TargetMember = {
  id: string;
  role: string;
  status: string;
  displayName: string;
  /**
   * Roles granted beside the primary one. A bulk role change rewrites only
   * the primary, so these survive it — which is why the primary role alone is
   * the wrong thing to ask about a director who also teaches.
   */
  extraRoles: string[];
  /** Classes they teach, as homeroom teacher or as an assistant. */
  teachesClassIds: string[];
  enrolledClassIds: string[];
};

type BlockedMember = { member: TargetMember; code: string };
type Decided = { eligible: TargetMember[]; blocked: BlockedMember[] };

/** Whether this member holds TEACHER now, primary or granted beside it. */
function holdsTeacher(member: TargetMember): boolean {
  return member.role === "TEACHER" || member.extraRoles.includes("TEACHER");
}

/**
 * Whether a bulk role change leaves this member still holding TEACHER.
 *
 * The change writes the primary role and nothing else, so a grant sitting in
 * `extraRoles` survives it — which is exactly why the primary role alone is
 * the wrong thing to ask.
 */
function holdsTeacherAfterRoleChange(
  member: TargetMember,
  role: string,
): boolean {
  return role === "TEACHER" || member.extraRoles.includes("TEACHER");
}

/** Which kinds end a member's ability to hold a live monitoring session. */
function needsRevocation(options: BulkOptions): boolean {
  return options.kind === "SUSPEND" || options.kind === "ROLE_CHANGE";
}

function toResult(
  operation: {
    id: string;
    kind: string;
    status: string;
    requestedCount: number;
    succeededCount: number;
    failedCount: number;
    result: unknown;
    createdAt: Date;
  },
  replayed: boolean,
): BulkResult {
  return {
    operationId: operation.id,
    kind: operation.kind as BulkResult["kind"],
    status: operation.status as BulkResult["status"],
    requested: operation.requestedCount,
    succeeded: operation.succeededCount,
    failed: operation.failedCount,
    rows: Array.isArray(operation.result)
      ? (operation.result as BulkResultRow[])
      : [],
    replayed,
    createdAt: operation.createdAt.toISOString(),
  };
}
