import { randomUUID } from "node:crypto";
import { createPracticeAttempt } from "../learn/staff-practice.repository.js";
import { Injectable, ConflictException, ForbiddenException } from "@nestjs/common";
import { manualConfigSchema, sourceFilesSchema, shortAnswerSchema, multipleChoiceSchema, publicChoice,
  rolesHavePermission, type ManualSubmit, type ManualAttempt } from "@cove/shared";
import type { AcademyAccess } from "../authorization/academy-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ShortAnswerService } from "./short-answer.service.js";
import { MultipleChoiceService } from "./multiple-choice.service.js";

@Injectable()
export class ManualPracticeService {
  constructor(private readonly db: PrismaService, private readonly short: ShortAnswerService, private readonly choices: MultipleChoiceService) {}
  allowed(actor: AcademyAccess) {
    return actor.via === "membership" && rolesHavePermission(actor.roles, "practice.own.create");
  }
  private context(preview = false, revision?: number) {
    if (preview && (!revision || !Number.isInteger(revision))) throw new ConflictException('Content revision required');
    return preview ? `manual-preview:${revision}` : 'manual-live';
  }
  async read(academyId: string, userId: string, materialId: string, preview = false, revision?: number) {
    const key = { academyId, userId, materialId, context: this.context(preview, revision) };
    const [draft, attempts] = await Promise.all([
      this.db.staffPracticeDraft.findUnique({ where: { academyId_userId_materialId_context: key } }),
      this.db.staffPracticeAttempt.findMany({ where: key, orderBy: [{ createdAt: "desc" }, { id: 'desc' }], take: 30 }),
    ]);
    return { draft: draft ? { ...JSON.parse(draft.code) as { files: Record<string,string>; answer: string }, revision: draft.updatedAt.getTime() } : null,
      attempts: attempts.flatMap((row) => row.result ? [row.result as unknown as ManualAttempt] : []) };
  }
  async draft(actor: AcademyAccess, input: { academyId: string; materialId: string; files: Record<string,string>; answer: string; revision: number; preview?: boolean; contentRevision?: number }) {
    if (!this.allowed(actor)) throw new ForbiddenException();
    const key = { academyId: input.academyId, userId: actor.userId, materialId: input.materialId, context: this.context(input.preview, input.contentRevision) };
    return this.db.$transaction(async (tx) => {
      const current = await tx.staffPracticeDraft.findUnique({ where: { academyId_userId_materialId_context: key } });
      if ((current?.updatedAt.getTime() ?? 0) !== input.revision) throw new ConflictException("Practice changed in another tab");
      const row = await tx.staffPracticeDraft.upsert({ where: { academyId_userId_materialId_context: key },
        create: { ...key, code: JSON.stringify({ files: input.files, answer: input.answer }) },
        update: { code: JSON.stringify({ files: input.files, answer: input.answer }) } });
      return { revision: row.updatedAt.getTime() };
    }, { isolationLevel: "Serializable" });
  }
  async submit(actor: AcademyAccess, input: Omit<ManualSubmit, "classId">, rawConfig: unknown) {
    if (!this.allowed(actor)) throw new ForbiddenException();
    const config = manualConfigSchema.parse(rawConfig);
    const context = this.context(input.preview, input.contentRevision);
    if (!config.submitEnabled || (config.shortAnswer && !input.answer.length)) throw new ForbiddenException("Practice submission is unavailable");
    const code = JSON.stringify({ files: input.files, answer: input.answer, selected: input.selectedOptionIds, order: input.displayOrder });
    const key = { academyId: input.academyId, userId: actor.userId, requestId: input.requestKey };
    const prior = await this.db.staffPracticeAttempt.findUnique({ where: { academyId_userId_requestId: key } });
    if (prior) {
      if (prior.materialId !== input.materialId || prior.code !== code || prior.context !== context) throw new ConflictException("Request key already used");
      return { submissionId: prior.id };
    }
    let correct: boolean | null = null;
    if (config.multipleChoice) {
      this.choices.assertEnabled();
      correct = this.choices.evaluate(multipleChoiceSchema.parse(config.multipleChoice), input.selectedOptionIds ?? [], input.displayOrder ?? []);
    } else if (config.shortAnswer && config.shortAnswer.gradingMode !== "MANUAL") {
      this.short.assertEnabled();
      correct = await this.short.evaluator.evaluate(shortAnswerSchema.parse(config.shortAnswer), input.answer);
    }
    const id = randomUUID();
    const result: ManualAttempt = {
      id, userId: actor.userId, classId: "", files: sourceFilesSchema.parse(input.files), answer: input.answer,
      createdAt: new Date().toISOString(), maximumHundredths: config.maximumHundredths,
      includeInScore: false, reviewVersion: 0, reviews: [],
      shortAnswerAssessment: config.shortAnswer ? { status: correct === null ? "MANUAL" : "GRADED",
        verdict: correct === null ? null : correct ? "CORRECT" : "INCORRECT",
        completed: correct, scoreHundredths: correct === null ? null : correct ? config.maximumHundredths : 0 } : null,
      multipleChoiceAssessment: config.multipleChoice ? { status: "GRADED", verdict: correct ? "CORRECT" : "INCORRECT",
        scoreHundredths: correct ? config.maximumHundredths : 0, completed: Boolean(correct),
        definition: publicChoice(multipleChoiceSchema.parse(config.multipleChoice)), selectedOptionIds: input.selectedOptionIds ?? [], displayOrder: input.displayOrder ?? [] } : null,
    };
    const row = await createPracticeAttempt(this.db, { ...key, id, materialId: input.materialId, context, code,
        snapshot: JSON.parse(JSON.stringify({ version: 2, config, contentRevision: input.contentRevision })),
        result: JSON.parse(JSON.stringify(result)), status: correct === false ? "FAILED" : "PASSED", gradedAt: new Date() });
    if (row.materialId !== input.materialId || row.code !== code || row.context !== context) throw new ConflictException("Request key already used");
    return { submissionId: row.id };
  }
}
