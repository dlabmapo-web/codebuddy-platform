import { quizFeedback, submissionResultSchema } from "@cove/shared";
import type { PrismaService } from "../database/prisma.service.js";
import type { GradingService, GradeSink } from "./grading.service.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";

/** Dispatches through the same evaluator, with a persistence sink that has no student writes. */
export class PracticeRunner {
  constructor(private readonly prisma: PrismaService, private readonly grading: GradingService) {}

  async run(id: string): Promise<void> {
    const claimed = await this.prisma.staffPracticeAttempt.updateMany({
      where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() },
    });
    if (!claimed.count) return;
    const row = await this.prisma.staffPracticeAttempt.findUniqueOrThrow({ where: { id }, include: { material: { select: { lecture: { select: { courseModule: { select: { courseId: true } } } } } } } });
    const parsed = practiceSnapshotSchema.safeParse(row.snapshot);
    if (!parsed.success) {
      await this.prisma.staffPracticeAttempt.updateMany({ where: { id, status: "RUNNING" }, data: { status: "ERRORED", gradedAt: new Date() } });
      return;
    }
    const snapshot = parsed.data;
    const finish: GradeSink["complete"] = async (summary, cases, weighted) => {
      const gradedAt = new Date();
      const result = submissionResultSchema.parse({
        submissionId: id, materialId: row.materialId, ...summary,
        quiz: quizFeedback(snapshot.quizSnapshot, row.code, summary.status),
        totalCount: snapshot.quizSnapshot ? 1 : snapshot.gradingCases.length,
        earnedWeight: weighted.earnedWeight ?? null, possibleWeight: weighted.possibleWeight ?? null,
        failureReason: null, elapsedSec: 0, attemptCount: 0,
        createdAt: row.createdAt.toISOString(), gradedAt: gradedAt.toISOString(),
        cases: cases.map((item) => {
          const source = snapshot.gradingCases.find((test) => test.position === item.position);
          return { ...item, input: item.isSample ? source?.input ?? null : null,
            expectedOutput: item.isSample ? source?.expectedOutput ?? null : null,
            actualOutput: item.isSample ? item.actualOutput : null,
            weight: snapshot.gradingMode === "ELICE_STDIO" ? source?.weight ?? null : null };
        }),
      });
      await this.prisma.staffPracticeAttempt.updateMany({
        where: { id, status: "RUNNING" }, data: { status: summary.status, gradedAt, result },
      });
    };
    await this.grading.execute({
      ...snapshot, id, materialId: row.materialId, userId: row.userId,
      courseId: snapshot.courseId ?? row.material.lecture.courseModule.courseId, code: row.code,
    }, async () => undefined, Date.now(), {
      complete: finish,
      fail: async (reason, cases = []) => {
        const result = submissionResultSchema.parse({
          submissionId: id, materialId: row.materialId, status: "ERRORED", passedCount: 0,
          totalCount: snapshot.quizSnapshot ? 1 : snapshot.gradingCases.length, score: 0,
          runtimeMs: null, failureReason: reason, elapsedSec: 0, attemptCount: 0,
          createdAt: row.createdAt.toISOString(), gradedAt: new Date().toISOString(),
          cases: cases.map((item) => ({ ...item, input: null, expectedOutput: null, actualOutput: null })),
        });
        await this.prisma.staffPracticeAttempt.updateMany({
          where: { id, status: "RUNNING" }, data: { status: "ERRORED", result, gradedAt: new Date() },
        });
      },
    });
  }
}
