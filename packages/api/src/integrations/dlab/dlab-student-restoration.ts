import type { Prisma } from "../../generated/prisma/client.js";
import { DlabError } from "./dlab-error.js";

export type StudentRestorationNotice = "classes_unavailable" | "history_missing";

/** Acquire after the D.LAB advisory lock when a transaction also uses it. */
export async function lockAcademyRosters(tx: Prisma.TransactionClient, academyIds: readonly string[]) {
  if (!academyIds.length) return;
  await tx.$queryRaw`
    SELECT id FROM academies WHERE id = ANY(${academyIds}::uuid[])
    ORDER BY id FOR UPDATE
  `;
}

export async function captureStudentEnrollments(
  tx: Prisma.TransactionClient,
  input: { membershipIds: string[]; academyId: string; operationId: string; actorUserId: string },
) {
  if (!input.membershipIds.length) return;
  await tx.dlabStudentRemoval.updateMany({
    where: { membershipId: { in: input.membershipIds }, status: "PENDING" },
    data: { status: "SUPERSEDED" },
  });
  // Copy in PostgreSQL to preserve the enrollment's full timestamp precision.
  const [captured] = await tx.$queryRaw<Array<{ count: number }>>`
    WITH snapshots AS (
      INSERT INTO dlab_student_removals
        (external_user_id, user_id, academy_id, membership_id, actor_user_id,
         origin, deletion_operation_id, deleted_at, was_locally_suspended)
      SELECT b.external_user_id, m.user_id, m.academy_id, m.id, ${input.actorUserId}::uuid,
        'LIVE_CAPTURE', ${input.operationId}::uuid, now(), b.local_suspended_at IS NOT NULL
      FROM academy_memberships m
      JOIN dlab_membership_bindings b ON b.membership_id = m.id
      JOIN dlab_identities i ON i.external_user_id = b.external_user_id AND i.user_id = m.user_id
      WHERE m.id = ANY(${input.membershipIds}::uuid[])
        AND m.academy_id = ${input.academyId}::uuid AND m.role = 'STUDENT'
      RETURNING id, membership_id
    ), saved AS (
      INSERT INTO dlab_student_saved_enrollments
        (removal_id, class_id, enrolled_by_user_id, enrolled_at, last_learning_seen_at)
      SELECT s.id, e.class_id, e.enrolled_by_user_id, e.enrolled_at, e.last_learning_seen_at
      FROM snapshots s JOIN class_enrollments e ON e.membership_id = s.membership_id
    )
    SELECT count(*)::int AS count FROM snapshots
  `;
  if (captured?.count !== input.membershipIds.length)
    throw new DlabError("student_restoration_conflict", 409);
}

export type PendingStudentRemoval = {
  id: string;
  externalUserId: string;
  userId: string;
  academyId: string;
  membershipId: string;
  wasLocallySuspended: boolean;
};

export async function readPendingStudentRemovals(
  tx: Prisma.TransactionClient,
  membershipIds: string[],
): Promise<Map<string, PendingStudentRemoval>> {
  if (!membershipIds.length) return new Map();
  const snapshots = await tx.dlabStudentRemoval.findMany({
    where: { membershipId: { in: membershipIds }, status: "PENDING" },
    select: {
      id: true,
      externalUserId: true,
      userId: true,
      academyId: true,
      membershipId: true,
      wasLocallySuspended: true,
    },
  });
  return new Map(snapshots.map((snapshot) => [snapshot.membershipId, snapshot]));
}

export async function restoreStudentEnrollments(
  tx: Prisma.TransactionClient,
  snapshots: PendingStudentRemoval[],
  context: { requestId?: string; revisionByIdentity: Map<string, number> },
) {
  const result = { changedAcademies: new Set<string>(), unavailableAcademies: new Set<string>() };
  if (!snapshots.length) return result;
  const ids = snapshots.map((snapshot) => snapshot.id);

  const [conflict] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT s.id
    FROM dlab_student_removals s
    JOIN dlab_student_saved_enrollments e ON e.removal_id = s.id
    JOIN classes c ON c.id = e.class_id
    WHERE s.id = ANY(${ids}::uuid[]) AND c.academy_id <> s.academy_id
    LIMIT 1
  `;
  if (conflict) throw new DlabError("student_restoration_conflict", 409);

  const restoredClasses = await tx.$queryRaw<Array<{ academyId: string }>>`
    WITH enrolled AS (
      INSERT INTO class_enrollments (class_id, membership_id, enrolled_by_user_id, enrolled_at, last_learning_seen_at)
      SELECT e.class_id, s.membership_id, COALESCE(e.enrolled_by_user_id, s.actor_user_id),
        COALESCE(e.enrolled_at, now()), e.last_learning_seen_at
      FROM dlab_student_saved_enrollments e
      JOIN dlab_student_removals s ON s.id = e.removal_id
      JOIN classes c ON c.id = e.class_id AND c.academy_id = s.academy_id AND c.status = 'ACTIVE'
      WHERE s.id = ANY(${ids}::uuid[]) AND e.outcome = 'PENDING'
      ON CONFLICT (class_id, membership_id) DO NOTHING
      RETURNING class_id
    )
    UPDATE classes c SET updated_at = now()
    WHERE c.id IN (SELECT class_id FROM enrolled)
    RETURNING c.academy_id AS "academyId"
  `;
  for (const row of restoredClasses) result.changedAcademies.add(row.academyId);

  const counts = await tx.$queryRaw<Array<{ id: string; restored: number; skipped: number }>>`
    WITH resolved AS (
      UPDATE dlab_student_saved_enrollments e
      SET outcome = CASE WHEN c.status = 'ACTIVE' THEN 'RESTORED' ELSE 'SKIPPED' END,
        skip_reason = CASE WHEN c.id IS NULL THEN 'class_missing'
                           WHEN c.status <> 'ACTIVE' THEN 'class_archived' END
      FROM dlab_student_saved_enrollments original LEFT JOIN classes c ON c.id = original.class_id
      WHERE e.removal_id = original.removal_id AND e.class_id = original.class_id
        AND e.removal_id = ANY(${ids}::uuid[]) AND e.outcome = 'PENDING'
      RETURNING e.removal_id, e.outcome
    )
    SELECT removal_id AS id, count(*) FILTER (WHERE outcome = 'RESTORED')::int AS restored,
      count(*) FILTER (WHERE outcome = 'SKIPPED')::int AS skipped
    FROM resolved GROUP BY removal_id
  `;

  await tx.dlabStudentRemoval.updateMany({
    where: { id: { in: ids }, status: "PENDING" },
    data: { status: "RESTORED", restoredAt: new Date(), restorationRequestId: context.requestId },
  });
  const byId = new Map(counts.map(({ id, restored, skipped }) => [id, { restored, skipped }]));
  await tx.auditLog.createMany({
    data: snapshots.map((snapshot) => {
      const count = byId.get(snapshot.id) ?? { restored: 0, skipped: 0 };
      if (count.skipped) result.unavailableAcademies.add(snapshot.academyId);
      return {
        academyId: snapshot.academyId,
        action: "academy.student.restored_from_os",
        targetType: "AcademyMembership",
        targetId: snapshot.membershipId,
        requestId: context.requestId,
        after: {
          removalId: snapshot.id,
          externalUserId: snapshot.externalUserId,
          userId: snapshot.userId,
          revision: context.revisionByIdentity.get(snapshot.externalUserId) ?? null,
          ...count,
        },
      };
    }),
  });
  return result;
}
