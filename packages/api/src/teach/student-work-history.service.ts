import { AppException } from "../common/app-exception.js";
import { Injectable } from "@nestjs/common";
import {
  effectiveManualResult,
  academyLocalDate,
  manualConfigSchema,
  multipleChoiceSchema,
  publicChoice,
  sourceFilesSchema,
  type HistoryFilter,
  type HistoryMaterial,
  type HistorySummary,
  type HistorySubmission,
  type HistoryAttempt,
  type HistoryReviewRun,
} from "@cove/shared";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  assignedClassWhere,
  classStudentWhere,
} from "../classes/assigned-class-access.js";
import { effectivelyVisibleActivityWhere } from "../learn/curriculum-visibility.js";
import { TeacherProgressAccessService } from "./teacher-progress-access.service.js";
import { TeacherProgressRepository } from "./teacher-progress.repository.js";
import { TeacherProgressService } from "./teacher-progress.service.js";

type Scope = { academyId: string; classId: string };
type Student = Scope & { membershipId: string };
type Target = Student & { materialId: string };
const assessmentSelect = {
  status: true,
  completed: true,
  scoreHundredths: true,
} as const;
const resultSelect = {
  maximumHundredths: true,
  revision: true,
  createdAt: true,
  shortAnswerAssessment: { select: assessmentSelect },
  multipleChoiceAssessment: { select: assessmentSelect },
  reviews: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: { completed: true, scoreHundredths: true },
  },
};

export function historyPage<T>(rows: T[], requested = 1, pageSize = 25) {
  const pageCount = Math.ceil(rows.length / pageSize);
  const page = Math.max(1, Math.min(requested, pageCount || 1));
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, pageCount, totalCount: rows.length },
  };
}
export function historyTotals(rows: HistoryMaterial[]) {
  const eligible = rows.filter(
    (r) =>
      r.required &&
      [
        "PROGRAMMING_EXERCISE",
        "TURTLE_EXERCISE",
        "WRITTEN_RESPONSE",
        "MULTIPLE_CHOICE",
      ].includes(r.type),
  );
  const scored = rows.filter(
    (r) =>
      r.includedInScore &&
      r.score !== null &&
      r.maximum !== null &&
      r.maximum > 0,
  );
  return {
    eligible: eligible.length,
    completed: eligible.filter((r) => r.status === "completed").length,
    programmingCompleted: eligible.filter(
      (r) => r.type === "PROGRAMMING_EXERCISE" && r.status === "completed",
    ).length,
    manualCompleted: eligible.filter(
      (r) => r.type !== "PROGRAMMING_EXERCISE" && r.status === "completed",
    ).length,
    programmingSubmissions: rows
      .filter((r) => r.type === "PROGRAMMING_EXERCISE")
      .reduce((n, r) => n + r.submissions, 0),
    manualSubmissions: rows
      .filter((r) => r.type !== "PROGRAMMING_EXERCISE")
      .reduce((n, r) => n + r.submissions, 0),
    averageScore: scored.length
      ? scored.reduce((n, r) => n + (r.score! / r.maximum!) * 100, 0) /
        scored.length
      : null,
    evaluatedItems: scored.length,
    totalScore: scored.reduce((n, r) => n + r.score!, 0),
    maximumScore: scored.reduce((n, r) => n + r.maximum!, 0),
  };
}

/** Class-authorized adapters over saved work. No draft writes or live watch dependency. */
@Injectable()
export class StudentWorkHistoryService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: TeacherProgressAccessService,
    private readonly progress: TeacherProgressRepository,
    private readonly reviews: TeacherProgressService,
  ) {}

  async listClasses(
    identity: SupabaseIdentity,
    input: { academyId: string; q?: string; page?: number },
  ) {
    const actor = await this.access.requireTeacher(identity, input.academyId);
    const where = {
      ...assignedClassWhere(actor),
      ...(input.q
        ? { name: { contains: input.q, mode: "insensitive" as const } }
        : {}),
    };
    const totalCount = await this.db.class.count({ where });
    const pageCount = Math.ceil(totalCount / 25),
      page = Math.min(input.page ?? 1, pageCount || 1);
    const rows = await this.db.class.findMany({
      where,
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
    });
    return {
      rows: rows.map((r) => ({ id: r.id, title: r.name })),
      pagination: { page, pageCount, totalCount, pageSize: 25 },
    };
  }
  private async scope(identity: SupabaseIdentity, input: Scope) {
    return this.access.requireClassScope(identity, input);
  }
  async listStudentRoster(
    identity: SupabaseIdentity,
    input: Scope & { q?: string; page?: number },
  ) {
    await this.scope(identity, input);
    const where = {
      ...classStudentWhere(input.academyId, input.classId),
      ...(input.q
        ? {
            user: {
              status: "ACTIVE" as const,
              OR: ["displayName", "username", "email"].map((field) => ({
                [field]: { contains: input.q, mode: "insensitive" as const },
              })),
            },
          }
        : {}),
    };
    const totalCount = await this.db.academyMembership.count({ where });
    const pageCount = Math.ceil(totalCount / 25),
      page = Math.min(input.page ?? 1, pageCount || 1);
    const rows = await this.db.academyMembership.findMany({
      where,
      select: {
        id: true,
        user: { select: { displayName: true, username: true, email: true } },
      },
      orderBy: [{ user: { displayName: "asc" } }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 25,
    });
    return {
      rows: rows.map((r) => ({
        membershipId: r.id,
        name: r.user.displayName ?? r.user.username ?? r.user.email ?? r.id,
        identifier: r.user.email ?? r.user.username,
      })),
      pagination: { page, pageCount, totalCount, pageSize: 25 },
    };
  }
  private async materials(input: Scope) {
    return this.db.material.findMany({
      where: {
        AND: [
          effectivelyVisibleActivityWhere(input.academyId),
          {
            lecture: {
              courseModule: {
                course: {
                  classAssignments: { some: { classId: input.classId } },
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        type: true,
        position: true,
        isRequired: true,
        programmingExercise: { select: { gradingRevision: true } },
        manualMaterial: {
          select: { revision: true, includeInScore: true, submitEnabled: true },
        },
        lecture: {
          select: {
            id: true,
            title: true,
            position: true,
            courseModule: {
              select: {
                id: true,
                title: true,
                position: true,
                course: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { lecture: { courseModule: { courseId: "asc" } } },
        { lecture: { courseModule: { position: "asc" } } },
        { lecture: { position: "asc" } },
        { position: "asc" },
        { id: "asc" },
      ],
    });
  }
  private async studentWork(
    identity: SupabaseIdentity,
    input: Student & { courseId?: string },
  ) {
    const scope = await this.scope(identity, input),
      student = this.access.requireStudent(scope, input.membershipId);
    if (input.courseId && !scope.courses.some((c) => c.id === input.courseId))
      throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    const materials = (await this.materials(input)).filter(
      (m) =>
        !input.courseId || m.lecture.courseModule.course.id === input.courseId,
    );
    const ids = materials.map((m) => m.id),
      programming = materials
        .filter((m) => m.programmingExercise)
        .map((m) => m.id);
    const [counts, progress, manualCounts, latest, video] = await Promise.all([
      this.progress.countedAttemptsByExercise({
        userIds: [student.userId],
        materialIds: programming,
      }),
      this.progress.progressFor({
        userIds: [student.userId],
        materialIds: programming,
      }),
      this.db.manualSubmission.groupBy({
        by: ["materialId"],
        where: {
          classId: input.classId,
          userId: student.userId,
          materialId: { in: ids },
        },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.latestManualResults(input.classId, [student.userId], ids),
      this.db.videoWatchProgress.findMany({
        where: {
          classId: input.classId,
          userId: student.userId,
          materialId: { in: ids },
        },
        select: { materialId: true, watchedMs: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        distinct: ["materialId"],
      }),
    ]);
    const rows: HistoryMaterial[] = materials.map((m) => {
      const c = counts.find((r) => r.materialId === m.id),
        p = progress.find((r) => r.materialId === m.id),
        a = latest.find((r) => r.materialId === m.id),
        mc = manualCounts.find((r) => r.materialId === m.id),
        v = video.find((r) => r.materialId === m.id);
      const manual = m.manualMaterial,
        result = effectiveManualResult(a),
        current = a?.revision === manual?.revision;
      const module = m.lecture.courseModule;
      let status: HistoryMaterial["status"] = "unrecorded",
        score: number | null = null,
        maximum: number | null = null;
      if (m.programmingExercise) {
        status = p?.revisionMatches
          ? p.status === "SOLVED"
            ? "completed"
            : p.status === "IN_PROGRESS"
              ? "in_progress"
              : "not_started"
          : c?.attempts
            ? "previous_revision"
            : "not_started";
        score = p?.revisionMatches && c?.attempts ? p.bestScore : null;
        maximum = 100;
      } else if (manual) {
        status = !a
          ? "not_started"
          : !current
            ? "previous_revision"
            : !result
              ? "pending"
              : result.completed
                ? "completed"
                : "in_progress";
        score = current && result ? result.scoreHundredths / 100 : null;
        maximum = a ? a.maximumHundredths / 100 : null;
      }
      return {
        materialId: m.id,
        title: m.title,
        type: m.type,
        courseId: module.course.id,
        courseTitle: module.course.title,
        moduleId: module.id,
        moduleTitle: module.title,
        lectureId: m.lecture.id,
        lectureTitle: m.lecture.title,
        lectureCompleted: 0,
        lectureEligible: 0,
        required: m.isRequired && (!manual || manual.submitEnabled),
        includedInScore: m.programmingExercise
          ? true
          : (manual?.includeInScore ?? false),
        revision:
          m.programmingExercise?.gradingRevision ?? manual?.revision ?? 0,
        status,
        submissions: c?.attempts ?? mc?._count._all ?? 0,
        score,
        maximum,
        latestAt:
          c?.lastActivityAt?.toISOString() ??
          mc?._max.createdAt?.toISOString() ??
          null,
        watchedMs: v?.watchedMs ?? null,
      };
    });
    const lectureTotals = new Map<
      string,
      { eligible: number; completed: number }
    >();
    for (const row of rows) {
      const totals = lectureTotals.get(row.lectureId) ?? {
        eligible: 0,
        completed: 0,
      };
      if (
        row.required &&
        [
          "PROGRAMMING_EXERCISE",
          "TURTLE_EXERCISE",
          "WRITTEN_RESPONSE",
          "MULTIPLE_CHOICE",
        ].includes(row.type)
      ) {
        totals.eligible++;
        if (row.status === "completed") totals.completed++;
      }
      lectureTotals.set(row.lectureId, totals);
    }
    for (const row of rows) {
      const totals = lectureTotals.get(row.lectureId)!;
      row.lectureCompleted = totals.completed;
      row.lectureEligible = totals.eligible;
    }
    return { scope, student, rows };
  }
  /** Select one ID per student/material in Postgres before loading result metadata.
   * Prisma's client-side distinct would otherwise read every historical attempt. */
  private async latestManualResults(
    classId: string,
    userIds: string[],
    materialIds: string[],
  ) {
    if (!userIds.length || !materialIds.length) return [];
    const latest = await this.db.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT ON (material_id, user_id) id
      FROM manual_submissions
      WHERE class_id = ${classId}::uuid
        AND user_id IN (${Prisma.join(userIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND material_id IN (${Prisma.join(materialIds.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY material_id, user_id, created_at DESC, id DESC
    `;
    return this.db.manualSubmission.findMany({
      where: {
        id: { in: latest.map((row) => row.id) },
        classId,
        userId: { in: userIds },
        materialId: { in: materialIds },
      },
      select: { userId: true, materialId: true, ...resultSelect },
    });
  }
  async getStudentSummary(
    identity: SupabaseIdentity,
    input: Student & { courseId?: string },
  ): Promise<HistorySummary> {
    const { scope, student, rows } = await this.studentWork(identity, input);
    const now = new Date();
    const today = academyLocalDate(now);
    const dates = Array.from({ length: 14 }, (_, i) =>
      new Date(Date.parse(today + "T00:00:00Z") - (13 - i) * 86400000)
        .toISOString()
        .slice(0, 10),
    );
    const activityWhere = {
      academyId: input.academyId,
      classId: input.classId,
      membershipId: input.membershipId,
      courseId: {
        in: scope.courses
          .filter((c) => !input.courseId || c.id === input.courseId)
          .map((c) => c.id),
      },
    };
    const [activity, member, enrollment, days] = await Promise.all([
      this.db.studentClassCourseLearningDay.aggregate({
        where: activityWhere,
        _sum: { activeSeconds: true },
        _min: { firstActiveAt: true },
        _max: { lastActiveAt: true },
      }),
      this.db.academyMembership.findUnique({
        where: { id: input.membershipId },
        select: { user: { select: { email: true, username: true } } },
      }),
      this.db.classEnrollment.findUnique({
        where: {
          classId_membershipId: {
            classId: input.classId,
            membershipId: input.membershipId,
          },
        },
        select: { enrolledAt: true },
      }),
      this.db.studentClassCourseLearningDay.groupBy({
        by: ["localDate"],
        where: {
          ...activityWhere,
          localDate: { gte: new Date(dates[0]), lte: new Date(today) },
        },
        _sum: { activeSeconds: true },
        orderBy: { localDate: "asc" },
      }),
    ]);
    return {
      student: {
        membershipId: student.membershipId,
        name: student.displayName,
        identifier: member?.user.email ?? member?.user.username ?? null,
      },
      className: scope.className,
      courses: scope.courses.map((c) => ({ id: c.id, title: c.title })),
      modules: [
        ...new Map(
          rows.map((r) => [
            r.moduleId,
            { id: r.moduleId, title: r.moduleTitle, courseId: r.courseId },
          ]),
        ).values(),
      ],
      lectures: [
        ...new Map(
          rows.map((r) => [
            r.lectureId,
            {
              id: r.lectureId,
              title: r.lectureTitle,
              moduleId: r.moduleId,
              courseId: r.courseId,
            },
          ]),
        ).values(),
      ],
      asOf: now.toISOString(),
      enrolledAt: enrollment?.enrolledAt.toISOString() ?? null,
      courseProgress: scope.courses
        .filter((c) => !input.courseId || c.id === input.courseId)
        .map((c) => {
          const { completed, eligible } = historyTotals(
            rows.filter((r) => r.courseId === c.id),
          );
          return { id: c.id, title: c.title, completed, eligible };
        }),
      learningDays: dates.map((date) => ({
        date,
        activeSeconds:
          days.find((d) => d.localDate.toISOString().slice(0, 10) === date)
            ?._sum.activeSeconds ?? 0,
      })),
      ...historyTotals(rows),
      activeSeconds: activity._sum.activeSeconds ?? 0,
      firstRecordedAt: activity._min.firstActiveAt?.toISOString() ?? null,
      lastActiveAt: activity._max.lastActiveAt?.toISOString() ?? null,
      latestSubmissionAt:
        rows
          .map((r) => r.latestAt)
          .filter((v): v is string => Boolean(v))
          .sort()
          .at(-1) ?? null,
    };
  }
  async listStudentMaterials(identity: SupabaseIdentity, input: HistoryFilter) {
    const { rows } = await this.studentWork(identity, input),
      needle = input.q?.toLocaleLowerCase();
    return historyPage(
      rows.filter(
        (r) =>
          (!needle || r.title.toLocaleLowerCase().includes(needle)) &&
          (!input.moduleId || r.moduleId === input.moduleId) &&
          (!input.lectureId || r.lectureId === input.lectureId) &&
          (!input.type || r.type === input.type) &&
          (!input.status || r.status === input.status),
      ),
      input.page,
    );
  }
  private async target(identity: SupabaseIdentity, input: Target) {
    const scope = await this.scope(identity, input),
      student = this.access.requireStudent(scope, input.membershipId);
    const material = (await this.materials(input)).find(
      (m) => m.id === input.materialId,
    );
    if (!material) throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    return { scope, student, material };
  }
  async listAttempts(
    identity: SupabaseIdentity,
    input: Target & { page?: number },
  ) {
    const { student, material } = await this.target(identity, input);
    const manual = Boolean(material.manualMaterial);
    const where = {
      classId: input.classId,
      userId: student.userId,
      materialId: input.materialId,
    };
    const totalCount = manual
      ? await this.db.manualSubmission.count({ where })
      : material.programmingExercise
        ? await this.progress.countAttempts(where)
        : 0;
    const pageCount = Math.ceil(totalCount / 20),
      page = Math.min(input.page ?? 1, pageCount || 1),
      skip = (page - 1) * 20;
    let attempts: HistoryAttempt[] = [];
    if (manual) {
      const saved = await this.db.manualSubmission.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: 20,
        select: { id: true, ...resultSelect },
      });
      attempts = saved.map((a) => {
        const r = effectiveManualResult(a);
        return {
          id: a.id,
          kind: "manual",
          createdAt: a.createdAt.toISOString(),
          score: r ? r.scoreHundredths / 100 : null,
          maximum: a.maximumHundredths / 100,
          completed: r?.completed ?? null,
          status: r ? "GRADED" : (a.shortAnswerAssessment?.status ?? "PENDING"),
          currentRevision: a.revision === material.manualMaterial?.revision,
        };
      });
    } else if (material.programmingExercise) {
      const saved = await this.progress.listAttempts({
        ...where,
        skip,
        take: 20,
      });
      // Revision applicability is read alongside these bounded attempts, never inferred from current progress.
      const revisions = await this.db.submission.findMany({
        where: { id: { in: saved.map((a) => a.id) } },
        select: { id: true, gradingRevision: true },
      });
      attempts = saved.map((a) => ({
        id: a.id,
        kind: "programming",
        createdAt: a.createdAt.toISOString(),
        score: a.score,
        maximum: 100,
        completed: a.status === "PASSED",
        status: a.status,
        ...(a.compileFailed ? { compileFailed: true } : {}),
        currentRevision:
          revisions.find((r) => r.id === a.id)?.gradingRevision ===
          material.programmingExercise?.gradingRevision,
      }));
    }
    return {
      attempts,
      material: {
        materialId: material.id,
        title: material.title,
        type: material.type,
      },
      pagination: { page, pageCount, totalCount, pageSize: 20 },
    };
  }
  async listMaterialStudents(
    identity: SupabaseIdentity,
    input: Scope & {
      materialId: string;
      q?: string;
      page?: number;
      submitted?: boolean;
    },
  ) {
    const scope = await this.scope(identity, input);
    const material = (await this.materials(input)).find(
      (m) => m.id === input.materialId,
    );
    if (!material) throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    const [coding, manual, progressRows, manualRows] = await Promise.all([
      this.db.submission.groupBy({
        by: ["userId"],
        where: {
          materialId: input.materialId,
          sourceMaterialId: input.materialId,
          regradeRunId: null,
          userId: { in: scope.studentUserIds },
          status: { in: ["PASSED", "FAILED"] },
        },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.db.manualSubmission.groupBy({
        by: ["userId"],
        where: {
          materialId: input.materialId,
          classId: input.classId,
          userId: { in: scope.studentUserIds },
        },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      this.progress.progressFor({
        userIds: scope.studentUserIds,
        materialIds: [input.materialId],
      }),
      this.latestManualResults(input.classId, scope.studentUserIds, [
        input.materialId,
      ]),
    ]);
    const members = await this.db.academyMembership.findMany({
      where: { id: { in: scope.students.map((s) => s.membershipId) } },
      select: { id: true, user: { select: { email: true, username: true } } },
    });
    const rows = scope.students.map((s) => {
      const m = members.find((m) => m.id === s.membershipId);
      const codingProgress = progressRows.find((p) => p.userId === s.userId),
        saved = manualRows.find((a) => a.userId === s.userId),
        result =
          saved?.revision === material.manualMaterial?.revision
            ? effectiveManualResult(saved)
            : undefined;
      return {
        score: codingProgress?.revisionMatches
          ? codingProgress.bestScore
          : result
            ? result.scoreHundredths / 100
            : null,
        maximum: codingProgress
          ? 100
          : saved
            ? saved.maximumHundredths / 100
            : null,
        completed: codingProgress?.revisionMatches
          ? codingProgress.status === "SOLVED"
          : (result?.completed ?? null),
        latestAt:
          coding
            .find((a) => a.userId === s.userId)
            ?._max.createdAt?.toISOString() ??
          manual
            .find((a) => a.userId === s.userId)
            ?._max.createdAt?.toISOString() ??
          null,
        membershipId: s.membershipId,
        name: s.displayName,
        identifier: m?.user.email ?? m?.user.username ?? null,
        submissions:
          (coding.find((a) => a.userId === s.userId)?._count._all ?? 0) +
          (manual.find((a) => a.userId === s.userId)?._count._all ?? 0),
      };
    });
    return historyPage(
      rows.filter(
        (r) =>
          (!input.q ||
            `${r.name} ${r.identifier ?? ""}`
              .toLocaleLowerCase()
              .includes(input.q.toLocaleLowerCase())) &&
          (input.submitted === undefined ||
            r.submissions > 0 === input.submitted),
      ),
      input.page,
    );
  }
  async getSubmission(
    identity: SupabaseIdentity,
    input: Target & { submissionId: string; kind: "manual" | "programming" },
  ): Promise<HistorySubmission> {
    const { student, material } = await this.target(identity, input);
    if (input.kind === "programming") {
      const review = await this.reviews.getSubmissionReview(identity, input);
      if (review.materialId !== input.materialId)
        throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
      return { kind: "programming", review };
    }
    if (!material.manualMaterial)
      throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    const a = await this.db.manualSubmission.findFirst({
      where: {
        id: input.submissionId,
        classId: input.classId,
        userId: student.userId,
        materialId: input.materialId,
      },
      include: {
        shortAnswerAssessment: { select: assessmentSelect },
        multipleChoiceAssessment: true,
        reviews: { orderBy: { version: "desc" }, take: 1 },
      },
    });
    if (!a) throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    const result = effectiveManualResult(a),
      profile = manualConfigSchema.parse(a.profile),
      choice = a.multipleChoiceAssessment;
    const choiceDefinition = choice
      ? multipleChoiceSchema.parse(choice.definition)
      : null;
    const explanationDefinition = choiceDefinition ?? profile.shortAnswer;
    return {
      kind: "manual",
      submissionId: a.id,
      materialId: material.id,
      membershipId: student.membershipId,
      studentName: student.displayName,
      title: material.title,
      type: material.type,
      createdAt: a.createdAt.toISOString(),
      files: sourceFilesSchema.parse(a.files),
      answer: a.answer,
      description: profile.description,
      entryPoint: profile.entryPoint,
      question: profile.shortAnswer?.question ?? null,
      score: result ? result.scoreHundredths / 100 : null,
      maximum: a.maximumHundredths / 100,
      includeInScore: a.includeInScore,
      completed: result?.completed ?? null,
      status: result
        ? "GRADED"
        : (a.shortAnswerAssessment?.status ?? "PENDING"),
      feedback: a.reviews[0]?.feedback ?? "",
      explanation:
        result?.completed && explanationDefinition?.explanationEnabled
          ? (explanationDefinition.explanation ?? null)
          : null,
      choice: choice
        ? {
            definition: publicChoice(
              multipleChoiceSchema.parse(choice.definition),
            ),
            selectedOptionIds: choice.selectedOptionIds as string[],
            displayOrder: choice.displayOrder as string[],
          }
        : null,
    };
  }
  /** Used again on every reviewer session operation; never trusts a saved grant. */
  async authorizeReviewRun(
    identity: SupabaseIdentity,
    input: HistoryReviewRun,
  ) {
    const { student, material, scope } = await this.target(identity, input);
    if (material.type !== "TURTLE_EXERCISE")
      throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    // Draft review still requires the same class/student/material grant. Only its
    // runtime profile comes from current authoring; submitted work uses its snapshot.
    if (!input.submissionId) {
      const config = await this.db.manualMaterial.findUnique({
        where: { materialId: input.materialId },
      });
      if (!config) throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
      return {
        actor: scope.actor,
        profile: manualConfigSchema.parse(config),
        savedProfile: { runtimeVersion: config.runtimeVersion },
      };
    }
    const submission = await this.db.manualSubmission.findFirst({
      where: {
        id: input.submissionId,
        classId: input.classId,
        userId: student.userId,
        materialId: input.materialId,
      },
      select: { profile: true },
    });
    if (!submission) throw new AppException("TEACHER_PROGRESS_NOT_FOUND", 404);
    return {
      actor: scope.actor,
      profile: manualConfigSchema.parse(submission.profile),
      savedProfile: submission.profile,
    };
  }
}
