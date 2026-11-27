import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaService } from "../../database/prisma.service.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { DlabError } from "./dlab-error.js";
import { lockAcademyRosters } from "./dlab-student-restoration.js";
import { dlabTransaction } from "./dlab-transaction.js";

export const studentRecoveryInput = z.object({
  externalUserId: z.string().min(1).max(64),
  userId: z.uuid(),
  academyId: z.uuid(),
  membershipId: z.uuid(),
  classIds: z.array(z.uuid()).max(500),
});

const factsSchema = z.object({
  deletionId: z.uuid(),
  generation: z.number().int(),
  peopleRevision: z.number().int(),
  classes: z.array(z.object({ id: z.uuid(), status: z.string(), updatedAt: z.string() })),
});
export const studentRecoveryPlan = z.object({
  version: z.literal(1),
  operationId: z.uuid(),
  target: z.string(),
  actorUserId: z.uuid(),
  input: studentRecoveryInput,
  facts: factsSchema,
  digest: z.string().regex(/^[0-9a-f]{64}$/),
});

type Input = z.infer<typeof studentRecoveryInput>;
type Plan = z.infer<typeof studentRecoveryPlan>;
type Facts = z.infer<typeof factsSchema>;

function planDigest(plan: Omit<Plan, "digest">) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

async function requireOperator(tx: Prisma.TransactionClient, actorUserId: string) {
  const actor = await tx.user.findUnique({
    where: { id: actorUserId },
    select: { status: true, platformRole: true },
  });
  if (actor?.status !== "ACTIVE" || actor.platformRole !== "ADMIN")
    throw new DlabError("platform_operator_required", 403);
}

async function readFacts(tx: Prisma.TransactionClient, input: Input): Promise<Facts> {
  if (!input.classIds.length) throw new DlabError("original_enrollments_unknown", 409);
  // The old bulk deletion receipt proves a removal, not the former class list.
  // Only the operator's reviewed class IDs are used for the recovery plan.
  const [facts] = await tx.$queryRaw<Array<Facts & { hasCapture: boolean }>>`
    SELECT deletion.id AS "deletionId", i.generation, a.people_revision AS "peopleRevision",
      EXISTS (
        SELECT 1 FROM dlab_student_removals r WHERE r.membership_id = m.id
          AND (r.deletion_operation_id = deletion.id OR r.status = 'PENDING'
               OR (r.origin = 'LEGACY_REPAIR' AND r.captured_at >= deletion.created_at))
      ) AS "hasCapture",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', c.id, 'status', c.status, 'updatedAt', c.updated_at::text)
                         ORDER BY c.id)
        FROM classes c WHERE c.academy_id = m.academy_id AND c.id = ANY(${input.classIds}::uuid[])
      ), '[]'::jsonb) AS classes
    FROM dlab_identities i
    JOIN dlab_membership_bindings b ON b.external_user_id = i.external_user_id
    JOIN academy_memberships m ON m.id = b.membership_id AND m.user_id = i.user_id
    JOIN academies a ON a.id = m.academy_id
    JOIN LATERAL (
      SELECT op.id, op.created_at FROM people_bulk_operations op
      WHERE op.academy_id = m.academy_id AND op.kind = 'DELETE' AND op.status = 'COMPLETED'
        AND op.result @> jsonb_build_array(jsonb_build_object('membershipId', m.id, 'outcome', 'changed'))
      ORDER BY op.created_at DESC, op.id DESC LIMIT 1
    ) deletion ON true
    WHERE i.external_user_id = ${input.externalUserId} AND m.user_id = ${input.userId}::uuid
      AND m.academy_id = ${input.academyId}::uuid AND m.id = ${input.membershipId}::uuid
      AND m.role = 'STUDENT'
  `;
  if (!facts || facts.hasCapture || facts.classes.length !== input.classIds.length) {
    throw new DlabError("student_recovery_conflict", 409);
  }
  return factsSchema.parse(facts);
}

export async function previewStudentRecovery(db: PrismaService, actorUserId: string, target: string, input: Input) {
  const normalized = { ...input, classIds: [...new Set(input.classIds)].sort() };
  return dlabTransaction(db, async (tx) => {
    await requireOperator(tx, actorUserId);
    const facts = await readFacts(tx, normalized);
    const plan = { version: 1 as const, operationId: randomUUID(), target, actorUserId, input: normalized, facts };
    return { ...plan, digest: planDigest(plan) };
  });
}

export async function applyStudentRecovery(db: PrismaService, target: string, plan: Plan, reviewedDigest: string) {
  const { digest, ...unsigned } = plan;
  if (target !== plan.target || digest !== reviewedDigest || digest !== planDigest(unsigned))
    throw new DlabError("student_recovery_plan_changed", 409);
  return dlabTransaction(db, async (tx) => {
    await lockAcademyRosters(tx, [plan.input.academyId]);
    await requireOperator(tx, plan.actorUserId);
    const existing = await tx.dlabStudentRemoval.findFirst({
      where: { recoveryOperationId: plan.operationId, membershipId: plan.input.membershipId },
      select: { id: true, planDigest: true },
    });
    if (existing?.planDigest === digest) return { id: existing.id, replayed: true };
    const facts = await readFacts(tx, plan.input);
    if (existing || JSON.stringify(facts) !== JSON.stringify(plan.facts))
      throw new DlabError("student_recovery_plan_changed", 409);

    const { classIds, ...identity } = plan.input;
    const { id } = await tx.dlabStudentRemoval.create({
      data: {
        ...identity,
        actorUserId: plan.actorUserId,
        origin: "LEGACY_REPAIR",
        recoveryOperationId: plan.operationId,
        planDigest: digest,
        enrollments: { createMany: { data: classIds.map((classId) => ({ classId })) } },
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: {
        academyId: identity.academyId,
        actorUserId: plan.actorUserId,
        action: "academy.student.recovery_recorded",
        targetType: "AcademyMembership",
        targetId: identity.membershipId,
        after: { removalId: id, classIds, enrollmentMetadata: "unknown", planDigest: digest },
      },
    });
    return { id, replayed: false };
  });
}
