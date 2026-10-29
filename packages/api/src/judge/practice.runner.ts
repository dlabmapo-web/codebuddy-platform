import { executionEngineVersion } from "@cove/shared";
import type { RuntimeCoordinator } from "./runtime-coordinator.js";
import type { ExecutionSession } from "./execution-lease.js";
import { gradingPolicySnapshotSchema } from "./grading-profile.js";
import { quizFeedback, submissionResultSchema } from "@cove/shared";
import type { PrismaService } from "../database/prisma.service.js";
import type { GradingService, GradeSink } from "./grading.service.js";
import { practiceSnapshotSchema } from "./practice-snapshot.js";

/** Dispatches through the same evaluator, with a persistence sink that has no student writes. */
export class PracticeRunner {
  constructor(private readonly prisma: PrismaService, private readonly grading: GradingService, private readonly coordinator?: RuntimeCoordinator) {}

  async run(id: string, recovery = false): Promise<void> {
    let session: ExecutionSession | undefined;
    if (!this.coordinator) {
    const claimed = await this.prisma.staffPracticeAttempt.updateMany({
      where: { id, status: "QUEUED" }, data: { status: "RUNNING", startedAt: new Date() },
    });
    if (!claimed.count) return;
    }
    const row = await this.prisma.staffPracticeAttempt.findUniqueOrThrow({ where: { id }, include: { material: { select: { lecture: { select: { courseModule: { select: { courseId: true } } } } } } } });
    if (!["QUEUED", "RUNNING"].includes(row.status)) return;
    const parsed = practiceSnapshotSchema.safeParse(row.snapshot);
    if (!parsed.success) {
      if (row.executionGeneration !== null) throw new Error("Frozen practice snapshot unavailable");
      await this.prisma.staffPracticeAttempt.updateMany({ where: { id, status: { in: ["QUEUED", "RUNNING"] }, executionGeneration: null }, data: { status: "ERRORED", gradedAt: new Date() } });
      return;
    }
    const snapshot = parsed.data;
    if (this.coordinator && !snapshot.quizSnapshot) {
      recovery ||= row.status === "RUNNING" && !this.coordinator.ownedAttempts.has(id);
      const policy = gradingPolicySnapshotSchema.safeParse(snapshot.gradingPolicySnapshot);
      const engineVersion = snapshot.version === 2 ? executionEngineVersion(snapshot.executionRuntimeSnapshot)
        : policy.success ? `pyodide-${policy.data.runtime.engineVersion}` : 'unrecorded-practice-v1';
      let runtime;
      try { runtime = this.coordinator.descriptor({ engineVersion, executionRuntimeSnapshot: snapshot.version === 2 ? snapshot.executionRuntimeSnapshot : undefined }); }
      catch {
        if (row.status !== 'QUEUED') throw new Error('Frozen running practice runtime unavailable');
        await this.prisma.staffPracticeAttempt.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'ERRORED', gradedAt: new Date() } });
        return;
      }
      session = await this.coordinator.claim({ staffPracticeAttemptId: id }, { runtime, memoryLimitMb: snapshot.memoryLimitMb, kind: 'practice' }, recovery) ?? undefined;
      if (!session) return;
    } else if (this.coordinator) {
      const claimed = await this.prisma.staffPracticeAttempt.updateMany({ where: { id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: new Date() } });
      if (!claimed.count) return;
    }
    const persist = async (data: import('../generated/prisma/client.js').Prisma.StaffPracticeAttemptUpdateManyMutationInput, cases?: import('./grading.service.js').CaseRow[]) => {
      await this.grading.telemetry.time("commit", () => this.prisma.$transaction(async tx => {
        await session?.fence(tx);
        if (cases && session) await session.consume(tx, cases);
        await session?.terminal(tx);
        await tx.staffPracticeAttempt.updateMany({ where: { id, status: 'RUNNING', ...session?.fenceWhere }, data });
      }));
    };
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
      await persist({ status: summary.status, gradedAt, result }, cases);
    };
    try {
    try { await session?.restore(); }
    catch { await persist({ status: "ERRORED", gradedAt: new Date() }); return; }
    await (session ? this.grading.bindSession(session) : this.grading).execute({
      ...snapshot, id, materialId: row.materialId, userId: row.userId,
      courseId: snapshot.courseId ?? row.material.lecture.courseModule.courseId, code: row.code,
    }, async () => undefined, recovery ? row.startedAt!.getTime() : Date.now(), {
      complete: finish,
      fail: async (reason, cases = []) => {
        const result = submissionResultSchema.parse({
          submissionId: id, materialId: row.materialId, status: "ERRORED", passedCount: 0,
          totalCount: snapshot.quizSnapshot ? 1 : snapshot.gradingCases.length, score: 0,
          runtimeMs: null, failureReason: reason, elapsedSec: 0, attemptCount: 0,
          createdAt: row.createdAt.toISOString(), gradedAt: new Date().toISOString(),
          cases: cases.map((item) => ({ ...item, input: null, expectedOutput: null, actualOutput: null })),
        });
        await persist({ status: "ERRORED", result, gradedAt: new Date() });
      },
    });
    } finally { if (session) await this.coordinator!.finished(session); }
  }
}
