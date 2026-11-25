import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AI_LIBRARY_TEXT_MAX, type AiLibraryView, type UpdateAiLibraryItemInput } from "@cove/shared";

import { AuditService } from "../../academies/audit.service.js";
import type { SupabaseIdentity } from "../../auth/auth.types.js";
import { AcademyAccessService } from "../../authorization/academy-access.service.js";
import { AppException } from "../../common/app-exception.js";
import type { ApiEnvironment } from "../../config/env.schema.js";
import { PrismaService } from "../../database/prisma.service.js";
import { aiSettings } from "../ai-settings.js";
import { checkReply } from "../text-check.js";

type LibraryInput = { academyId: string; courseId: string; materialId: string };

/** One problem's library for the staff who may edit that problem (§10.8, §9). */
@Injectable()
export class AiLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly config: ConfigService<ApiEnvironment, true>,
    private readonly audit: AuditService,
  ) {}

  async get(identity: SupabaseIdentity, input: LibraryInput): Promise<AiLibraryView> {
    await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    return this.read(input);
  }

  async updateItem(identity: SupabaseIdentity, input: UpdateAiLibraryItemInput): Promise<AiLibraryView> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    await this.requireExercise(input);
    for (const [locale, text] of [["ko", input.textKo], ["en", input.textEn]] as const) {
      // Staff may write what they like, within what a hint may be. Their own
      // words are trusted, so a solution line is theirs to judge.
      if (text !== undefined && checkReply({ text, locale, max: AI_LIBRARY_TEXT_MAX, solutions: [], visible: text }) === "SIZE")
        throw new AppException("CONTENT_VALIDATION_FAILED", HttpStatus.BAD_REQUEST);
    }
    const edited = input.textKo !== undefined || input.textEn !== undefined;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.aiLibraryItem.findFirst({
        where: { id: input.itemId, materialId: input.materialId, state: { in: ["ACTIVE", "HIDDEN"] } },
        select: { textKo: true, textEn: true, state: true, origin: true, version: true },
      });
      if (!before) throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
      const changed = await tx.aiLibraryItem.updateMany({
        where: { id: input.itemId, materialId: input.materialId, version: input.expectedVersion, state: { in: ["ACTIVE", "HIDDEN"] } },
        data: {
          ...(input.textKo !== undefined ? { textKo: input.textKo } : {}), ...(input.textEn !== undefined ? { textEn: input.textEn } : {}),
          ...(input.state ? { state: input.state, rejectReason: input.state === "HIDDEN" ? "STAFF" : null } : {}),
          // What staff wrote is theirs: kept when the problem changes.
          ...(edited ? { origin: "STAFF" as const } : {}),
          version: { increment: 1 }, updatedBy: actor.userId,
        },
      });
      if (!changed.count) throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
      // Staff have looked: the reports that hid it are settled.
      if (input.state === "ACTIVE") await tx.aiLibraryReport.deleteMany({ where: { itemId: input.itemId } });
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "ai.library_item.updated", targetType: "AiLibraryItem", targetId: input.itemId,
        before: { ...before }, after: { textKo: input.textKo ?? before.textKo, textEn: input.textEn ?? before.textEn, state: input.state ?? before.state },
      });
    });
    return this.read(input);
  }

  async regenerate(identity: SupabaseIdentity, input: LibraryInput): Promise<AiLibraryView> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage");
    await this.requireExercise(input);
    await this.prisma.$transaction(async (tx) => {
      // A library being written now finishes first; asking again would pay twice.
      const queued = await tx.aiLibrary.updateMany({
        where: { materialId: input.materialId, state: { in: ["READY", "FAILED"] } },
        data: { state: "WAITING", attempts: 0, nextAttemptAt: new Date(), lastErrorCode: null, leaseId: null, leaseUntil: null },
      });
      if (!queued.count) return;
      await this.audit.write(tx, {
        actorUserId: actor.userId, academyId: input.academyId, action: "ai.library.regenerated", targetType: "ProgrammingExercise", targetId: input.materialId,
      });
    });
    return this.read(input);
  }

  private async requireExercise(input: LibraryInput) {
    const found = await this.prisma.programmingExercise.findFirst({
      where: { materialId: input.materialId, material: { lecture: { courseModule: { course: { id: input.courseId, academyId: input.academyId } } } } },
      select: { materialId: true, gradingRevision: true, aiFeedbackEnabled: true, language: true, submissionPolicy: true, quiz: true, aiLibrary: true },
    });
    if (!found) throw new AppException("EXERCISE_NOT_FOUND", HttpStatus.NOT_FOUND);
    return found;
  }

  private async read(input: LibraryInput): Promise<AiLibraryView> {
    const exercise = await this.requireExercise(input);
    const library = exercise.aiLibrary;
    const [flag, items, errors, totals, matched] = await Promise.all([
      this.prisma.academyFeatureFlag.findUnique({ where: { academyId_feature: { academyId: input.academyId, feature: "AI_ASSISTANT" } }, select: { isEnabled: true } }),
      this.prisma.aiLibraryItem.findMany({
        where: { materialId: input.materialId, OR: [{ state: { in: ["ACTIVE", "HIDDEN", "CHECKING"] } }, { state: "REJECTED", rejectReason: { not: "REPLACED" } }] },
        orderBy: [{ kind: "asc" }, { state: "asc" }, { position: "asc" }], take: 60,
        include: { _count: { select: { reports: true } } },
      }),
      // Every read below is one problem and thirty days.
      this.prisma.$queryRaw<{ type: string; count: number; students: number }[]>`
        SELECT k.python_error_type AS type, count(DISTINCT s.id)::int AS count, count(DISTINCT s.user_id)::int AS students
        FROM submissions s JOIN submission_cases k ON k.submission_id = s.id AND k.python_error_type IS NOT NULL
        WHERE s.material_id = ${input.materialId}::uuid AND s.created_at > now() - interval '30 days' AND s.status = 'FAILED' AND s.regrade_run_id IS NULL AND s.test_attempt_id IS NULL
        GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 10`,
      this.prisma.$queryRaw<{ failures: number; students: number }[]>`
        SELECT count(*)::int AS failures, count(DISTINCT s.user_id)::int AS students FROM submissions s
        WHERE s.material_id = ${input.materialId}::uuid AND s.created_at > now() - interval '30 days' AND s.status = 'FAILED' AND s.regrade_run_id IS NULL AND s.test_attempt_id IS NULL`,
      this.prisma.$queryRaw<{ item_id: string | null; count: number; students: number }[]>`
        SELECT r.library_item_id AS item_id, count(DISTINCT r.submission_id)::int AS count, count(DISTINCT r.user_id)::int AS students
        FROM ai_help_replies r WHERE r.material_id = ${input.materialId}::uuid AND r.status = 'DONE' AND r.created_at > now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    ]);
    return {
      enabled: aiSettings(this.config).help.enabled && (flag?.isEnabled ?? false) && exercise.aiFeedbackEnabled &&
        exercise.submissionPolicy === "AUTOMATIC" && exercise.language === "PYTHON" && exercise.quiz === null,
      state: library?.state ?? "NONE",
      errorCode: library?.lastErrorCode ?? null,
      current: library?.gradingRevision === exercise.gradingRevision,
      items: items.map((item) => ({
        id: item.id, kind: item.kind, position: item.position, label: item.label, textKo: item.textKo, textEn: item.textEn,
        wrongProgram: item.wrongProgram, origin: item.origin, state: item.state, rejectReason: item.rejectReason, reports: item._count.reports, version: item.version,
      })),
      correctPrograms: (library?.correctPrograms as { approach: string; code: string }[] | undefined) ?? [],
      mistakes: {
        failures: totals[0]?.failures ?? 0, students: totals[0]?.students ?? 0,
        pythonErrors: errors, unmatched: matched.find((row) => row.item_id === null)?.count ?? 0,
        library: matched.flatMap((row) => row.item_id ? [{ itemId: row.item_id, count: row.count, students: row.students }] : []),
      },
    };
  }
}
