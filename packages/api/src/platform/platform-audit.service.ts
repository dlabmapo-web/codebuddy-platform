import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  AuditEntry,
  AuditEntryDetail,
  ListAuditResult,
  ResolvedListAuditInput,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";

const entrySelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  actorUserId: true,
  academyId: true,
  reason: true,
  createdAt: true,
  supportGrantId: true,
  actor: { select: { displayName: true, username: true, email: true } },
  academy: { select: { name: true, slug: true } },
} as const satisfies Prisma.AuditLogSelect;

type EntryRecord = Prisma.AuditLogGetPayload<{ select: typeof entrySelect }>;

/**
 * Reading the audit trail.
 *
 * Read-only, and there is no write here on purpose: every feature writes its
 * own records through `AuditService`, and a platform surface that could add to
 * the trail would make the trail something an operator can shape.
 */
@Injectable()
export class PlatformAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async list(
    identity: SupabaseIdentity,
    input: ResolvedListAuditInput,
  ): Promise<ListAuditResult> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.audit.read",
    );

    const where: Prisma.AuditLogWhereInput = {
      ...(input.academyId ? { academyId: input.academyId } : {}),
      ...(input.actorUserId ? { actorUserId: input.actorUserId } : {}),
      ...(input.supportGrantId
        ? { supportGrantId: input.supportGrantId }
        : {}),
      ...(input.action
        ? { action: { contains: input.action, mode: "insensitive" } }
        : {}),
      ...(input.targetIds?.length ? { targetId: { in: input.targetIds } } : {}),
    };

    const [total, records] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        select: entrySelect,
        // Newest first, then by id: `createdAt` is not unique — one
        // transaction writes several records in the same instant — and
        // without the tiebreak a page boundary can repeat or drop one.
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
    ]);

    return {
      entries: records.map(toEntry),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }

  async get(
    identity: SupabaseIdentity,
    entryId: string,
  ): Promise<AuditEntryDetail> {
    await this.access.requirePermission(
      identity.authUserId,
      "platform.audit.read",
    );

    const record = await this.prisma.auditLog.findUnique({
      where: { id: entryId },
      select: {
        ...entrySelect,
        before: true,
        after: true,
        requestId: true,
        ipAddress: true,
        userAgent: true,
      },
    });
    if (!record) {
      throw new AppException("PLATFORM_USER_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    return {
      ...toEntry(record),
      before: record.before ?? null,
      after: record.after ?? null,
      requestId: record.requestId,
      ipAddress: record.ipAddress,
      userAgent: record.userAgent,
    };
  }
}

function toEntry(record: EntryRecord): AuditEntry {
  return {
    id: record.id,
    action: record.action,
    targetType: record.targetType,
    targetId: record.targetId,
    actorUserId: record.actorUserId,
    actorName:
      record.actor?.displayName?.trim() ||
      record.actor?.username?.trim() ||
      record.actor?.email ||
      null,
    academyId: record.academyId,
    academyName: record.academy?.name ?? null,
    academySlug: record.academy?.slug ?? null,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
    supportGrantId: record.supportGrantId,
  };
}
