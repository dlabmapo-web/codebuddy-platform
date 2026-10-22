import { resolveGradingProfile } from "../judge/grading-profile.js";
import { rolesHavePermission, roleCanMonitor } from "@cove/shared";
import { StaffPracticeService } from "./staff-practice.service.js";
import { referencePdfMetadata } from "../documents/pdf-reference.js";
import { publicQuiz } from "@cove/shared";
import { HttpStatus, Injectable, Optional } from "@nestjs/common";

import {
  SOLVE_SESSION_MAX_SECONDS,
  flattenOutlineExercises,
  progressStatusFromDraft,
  toNavigatorContext,
  resolveExerciseNeighbors,
  type LearnCourseOutlineResult,
  type LearnCourseSummary,
  type LearnExerciseBootstrap,
  type LearnExerciseWorkspace,
  type SaveDraftResult,
  type SolveSession,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import {
  learningScopeFor,
  type LearningScope,
} from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { DraftCoordinator } from "../drafts/draft-coordinator.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  courseSummaryFor,
  CurriculumOutlineService,
  exerciseMaterialIds,
  nonemptyModules,
  visibleCurriculumInclude,
  previewCurriculumInclude,
} from "./curriculum-outline.service.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { SubmissionService } from "./submission.service.js";
import { LearningClassContextService } from "./learning-class-context.service.js";

/** The material graph one authorized workspace read produces. */
const workspaceMaterialInclude = {
  programmingExercise: {
    include: {
      referencePdf: { include: { asset: true, material: true } },
      testCases: { orderBy: [{ position: "asc" }, { id: "asc" }] },
      hints: { orderBy: [{ position: "asc" }, { id: "asc" }] },
    },
  },
  lecture: {
    include: {
      courseModule: { include: { course: { include: visibleCurriculumInclude } } },
    },
  },
} as const satisfies Prisma.MaterialInclude;

/**
 * A material that is known to carry an exercise.
 *
 * The `NonNullable` is what lets `buildWorkspace` be written without a second
 * existence check: the only way to obtain this type is through the lookup that
 * already refused a material without one.
 */
type WorkspaceMaterial = Omit<
  Prisma.MaterialGetPayload<{ include: typeof workspaceMaterialInclude }>,
  "programmingExercise"
> & {
  programmingExercise: NonNullable<
    Prisma.MaterialGetPayload<{
      include: typeof workspaceMaterialInclude;
    }>["programmingExercise"]
  >;
};

@Injectable()
export class LearnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: DraftCoordinator,
    private readonly access: AcademyAccessService,
    private readonly curriculum: CurriculumOutlineService,
    private readonly submissions: SubmissionService,
    private readonly classContext: LearningClassContextService,
    @Optional() private readonly practice?: StaffPracticeService,
  ) {}

  async listCourses(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ courses: LearnCourseSummary[] }> {
    const { userId, scope, role, roles } = await this.requireLearner(identity, academyId);
    const courses = await this.prisma.course.findMany({
      where: { ...scope.course, isVisible: true },
      include: visibleCurriculumInclude,
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });
    const materialIds = courses.flatMap(exerciseMaterialIds);
    const statuses = rolesHavePermission(roles ?? [role], "practice.own.create") ? new Map() : await this.curriculum.statusByMaterial(userId, materialIds);

    return {
      courses: courses.map((course) => courseSummaryFor(course, statuses)),
    };
  }

  async getCourseOutline(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; classId?: string; mode?: "student" | "staff-practice" },
  ): Promise<LearnCourseOutlineResult> {
    const { userId, role, roles, scope } = await this.requireLearner(
      identity,
      input.academyId,
    );
    const student = input.mode === "student" || !rolesHavePermission(roles ?? [role], "practice.own.create");
    if (student && !(roles ?? [role]).includes("STUDENT")) throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    const course = await this.requireVisibleCourse(input, scope);
    // Delivery is a student's relationship to a course: the class decides
    // progress, presence and points. Staff reach this course through their
    // own permissions and have no enrollment to deliver against, so they get
    // an empty context and the outline renders as a preview.
    const [outline, classContext] = await Promise.all([
      this.curriculum.outlineFor(course, userId,input.classId, !student),
      student
        ? this.classContext.resolve({
            academyId: input.academyId,
            userId,
            courseId: course.id,
            requestedClassId: input.classId,
          })
        : Promise.resolve({ classes: [], classId: null }),
    ]);
    return { ...outline, classContext };
  }

  /**
   * The fullscreen workspace and the course it sits in, from one read.
   *
   * The material query already joins its whole visible course — it has to, to
   * resolve Previous/Next — so the navigator costs one progress query on top
   * of what opening the exercise cost anyway. Splitting this into two
   * authorized endpoints would read the same curriculum graph twice.
   */
  async getExerciseBootstrap(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      materialId: string;
      submissionId?: string;
      mode?: "student" | "staff-practice";
      preview?: boolean;
      classId?: string;
    },
  ): Promise<LearnExerciseBootstrap> {
    const learner = await this.requireLearner(identity, input.academyId);
    const roles = learner.roles ?? [learner.role];
    const staff = rolesHavePermission(roles, "practice.own.create") && input.mode !== "student";
    if (input.mode === "student" && !roles.includes("STUDENT")) throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    if (input.preview && (!staff || !rolesHavePermission(roles, "curriculum.review"))) throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    const material = await this.requireWorkspaceMaterial(input, learner.scope, input.preview);
    const course = material.lecture.courseModule.course;
    // Only student participation needs a delivery class. Staff practice is independent.
    const classContext =
      !staff && roles.includes("STUDENT")
        ? await this.classContext.resolve({
            academyId: input.academyId,
            userId: learner.userId,
            courseId: course.id,
            requestedClassId: input.classId,
          })
        : { classes: [], classId: null };

    // The historical attempt is loaded beside the workspace, not instead of
    // it. A submission that does not resolve leaves the ordinary workspace
    // exactly as it was — including whatever draft is already saved.
    const [workspace, outline, selectedSubmission] = await Promise.all([
      this.buildWorkspace(material, learner.userId, staff),
      this.curriculum.outlineFor(course, learner.userId, undefined, staff),
      input.submissionId
        ? this.submissions.findSelected(
            {
              userId: learner.userId,
              academyId: input.academyId,
              scope: learner.scope,
            },
            { materialId: material.id, submissionId: input.submissionId },
          )
        : Promise.resolve(null),
    ]);
    const navigator = toNavigatorContext(outline, material.id);
    if (!navigator) {
      // The material resolved through the visibility predicate but is absent
      // from the outline the same predicate produced. That is a contradiction
      // rather than a missing exercise, and it must not render half a page.
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }
    if (staff && this.practice && learner.via === "membership") {
      workspace.draft = await this.practice.draft(identity, input);
      workspace.status = workspace.draft ? "IN_PROGRESS" : "NOT_STARTED";
    }
    let canParticipateAsStudent = false;
    if (staff && roles.includes("STUDENT") && !input.preview) {
      canParticipateAsStudent = await this.classContext.resolve({ academyId: input.academyId, userId: learner.userId, courseId: course.id }).then(() => true, () => false);
    }
    const canAuthor = rolesHavePermission(roles, "exercises.manage") && (
      learner.via === "membership" || await this.access.requirePermission(identity.authUserId, input.academyId, "exercises.manage").then(() => true, () => false)
    );
    return { workspace, navigator, selectedSubmission: staff ? null : selectedSubmission, classContext,
      access: {
        mode: staff ? "staff-practice" : "student",
        preview: Boolean(input.preview),
        canParticipateAsStudent,
        canPractice: rolesHavePermission(roles, "practice.own.create") && learner.via === "membership",
        canSubmit: staff ? learner.via === "membership" : roles.includes("STUDENT"),
        canAuthor,
        canReview: rolesHavePermission(roles, "curriculum.review"),
        canViewSolutions: rolesHavePermission(roles, "curriculum.review"),
        canObserveAssignedStudents: learner.via === "membership" && roles.some(roleCanMonitor),
        canObserve: learner.via === "membership" && rolesHavePermission(roles, "submissions.assigned.review"),
      },
    };
  }

  /**
   * Opens a sitting with one problem.
   *
   * Behind the ordinary learning gate, and pinned to the material it was asked
   * for: the timer a student watches and the solve time their history reports
   * both read the `startedAt` this returns, so the two cannot disagree.
   */
  async startSolveSession(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; classId: string },
  ): Promise<SolveSession> {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    const material = await this.requireVisibleMaterial(
      input.academyId,
      input.materialId,
      scope,
    );
    await this.classContext.resolve({
      academyId: input.academyId,
      userId,
      courseId: material.lecture.courseModule.courseId,
      requestedClassId: input.classId,
    });
    const session = await this.prisma.exerciseSolveSession.create({
      data: { userId, materialId: input.materialId, classId: input.classId },
      select: { id: true, startedAt: true },
    });
    return {
      solveSessionId: session.id,
      startedAt: session.startedAt.toISOString(),
      expiresAt: new Date(
        session.startedAt.getTime() + SOLVE_SESSION_MAX_SECONDS * 1_000,
      ).toISOString(),
    };
  }

  async getExerciseWorkspace(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; classId: string },
  ): Promise<LearnExerciseWorkspace> {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    const material = await this.requireWorkspaceMaterial(input, scope);
    await this.classContext.resolve({
      academyId: input.academyId,
      userId,
      courseId: material.lecture.courseModule.courseId,
      requestedClassId: input.classId,
    });
    return this.buildWorkspace(material, userId);
  }

  private async requireWorkspaceMaterial(
    input: { academyId: string; materialId: string },
    scope: LearningScope,
    preview = false,
  ) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        ...(preview ? { AND: [scope.material, { lecture: { courseModule: { course: { academyId: input.academyId } } } }] } : reachableMaterialWhere(input.academyId, scope)),
      },
      include: preview ? { ...workspaceMaterialInclude, lecture: { include: { courseModule: { include: { course: { include: previewCurriculumInclude } } } } } } : workspaceMaterialInclude,
    });
    if (!material?.programmingExercise) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }
    return material as WorkspaceMaterial;
  }

  /** One material's own payload. Nothing here reads the course a second time. */
  private async buildWorkspace(
    material: WorkspaceMaterial,
    userId: string,
    staffPractice = false,
  ): Promise<LearnExerciseWorkspace> {
    const exercise = material.programmingExercise;
    const { courseModule } = material.lecture;
    const course = courseModule.course;
    const [draft, progress, sampleChecks] = await Promise.all([
      staffPractice ? Promise.resolve(null) : this.prisma.exerciseDraft.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { code: true, updatedAt: true },
      }),
      staffPractice ? Promise.resolve(null) : this.prisma.studentExerciseProgress.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { status: true, gradingRevision: true },
      }),
      // The academy rollout flag applies to both supported grading modes.
      this.prisma.academyFeatureFlag.findUnique({
        where: {
          academyId_feature: {
            academyId: course.academyId,
            feature: "SERVER_SAMPLE_CHECKS",
          },
        },
        select: { isEnabled: true },
      }),
    ]);
    const ordered = flattenOutlineExercises(
      nonemptyModules(course).map((module) => ({
        position: module.position,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          position: lecture.position,
          exercises: lecture.materials.flatMap((item) =>
            (item.programmingExercise || item.manualMaterial || (item.videoLesson?.asset.state === "READY" && item.videoLesson.placement !== "SUPPLEMENTARY") || (item.pdfDocument?.asset.state === "READY" && item.pdfDocument.placement !== "SUPPLEMENTARY"))
              ? [{ materialId: item.id, title: item.title, position: item.position }]
              : []
          ),
        })),
      })),
    );

    return {
      breadcrumb: {
        course: { id: course.id, title: course.title },
        module: { id: courseModule.id, title: courseModule.title },
        lecture: { id: material.lecture.id, title: material.lecture.title },
      },
      exercise: {
        submissionPolicy: exercise.submissionPolicy ?? "AUTOMATIC",
        submissionAvailability: exercise.submissionPolicy === "PRACTICE_ONLY" ? "PRACTICE_ONLY" : exercise.quiz || (exercise.testCases.length && resolveGradingProfile(exercise, exercise.testCases).kind !== "unsupported") ? "READY" : "INVALID_GRADING",
        maximumPoints: (exercise.materialMaximumHundredths ?? 10000) / 100,
        hasReferencePdf: Boolean(exercise.referencePdfMaterialId),
        referencePdf: referencePdfMetadata(exercise.referencePdf),
        quiz: publicQuiz(exercise.quiz),
        materialId: material.id,
        title: material.title,
        difficulty: exercise.difficulty,
        language: exercise.language,
        description: exercise.description,
        inputFormat: exercise.inputFormat,
        outputFormat: exercise.outputFormat,
        constraints: exercise.constraints,
        starterCode: exercise.starterCode,
        timeLimitMs: exercise.timeLimitMs,
        memoryLimitMb: exercise.memoryLimitMb,
        gradingMode: exercise.gradingMode,
        inputPromptPolicy: exercise.inputPromptPolicy,
        gradingRevision: exercise.gradingRevision,
        serverSampleChecks: sampleChecks?.isEnabled ?? false,
        sampleTestCases: (exercise.submissionPolicy === "PRACTICE_ONLY" ? [] : exercise.testCases)
          .filter((testCase) => testCase.visibility === "SAMPLE")
          .map((testCase) => ({
            position: testCase.position,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            comparator: testCase.comparator,
          })),
        hints: exercise.hints.map((hint) => ({
          position: hint.position,
          content: hint.content,
        })),
        hiddenTestCaseCount: (exercise.submissionPolicy === "PRACTICE_ONLY" ? [] : exercise.testCases).filter(
          (testCase) => testCase.visibility === "HIDDEN",
        ).length,
      },
      neighbors: resolveExerciseNeighbors(ordered, material.id),
      draft: draft
        ? { code: draft.code, updatedAt: draft.updatedAt.toISOString() }
        : null,
      status:
        progress &&
          progress.gradingRevision === exercise.gradingRevision &&
          progress.status !== "NOT_STARTED"
          ? progress.status
          : progressStatusFromDraft(draft !== null),
    };
  }

  async listDrafts(identity: SupabaseIdentity, academyId: string) {
    const { userId, scope } = await this.requireLearner(identity, academyId);
    const drafts = await this.prisma.exerciseDraft.findMany({
      where: {
        userId,
        material: { is: reachableMaterialWhere(academyId, scope) },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: {
        material: {
          include: {
            lecture: { include: { courseModule: { include: { course: true } } } },
          },
        },
      },
    });
    return {
      drafts: drafts.flatMap((draft) => {
        if (!draft.material) return [];
        const course = draft.material.lecture.courseModule.course;
        return [{
          materialId: draft.material.id,
          exerciseTitle: draft.material.title,
          courseId: course.id,
          courseTitle: course.title,
          lineCount: countLines(draft.code),
          updatedAt: draft.updatedAt.toISOString(),
        }];
      }),
    };
  }

  /**
   * The student's work, written through the one authority that owns it.
   *
   * Not a bare upsert any more: while a teacher is in the room the CRDT owns
   * this draft's text, and a plain snapshot written past it would be undone by
   * the next flush and would take the other person's edits with it. The
   * coordinator decides which writer is authoritative and reconciles rather
   * than overwrites.
   */
  async saveDraft(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      materialId: string;
      code: string;
      baseUpdatedAt?: string | null;
    },
  ): Promise<SaveDraftResult> {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    const material = await this.requireVisibleMaterial(
      input.academyId,
      input.materialId,
      scope,
    );
    const base = input.baseUpdatedAt ? new Date(input.baseUpdatedAt) : null;
    const result = await this.drafts.save({
      userId,
      materialId: input.materialId,
      sourceMaterialId: input.materialId,
      courseId: material.lecture.courseModule.courseId,
      code: input.code,
      baseUpdatedAt: base && !Number.isNaN(base.getTime()) ? base : null,
    });
    return result.outcome === "SAVED"
      ? {
          outcome: "SAVED",
          updatedAt: result.updatedAt.toISOString(),
          serverCode: null,
        }
      : {
          outcome: "CONFLICT",
          updatedAt: result.updatedAt.toISOString(),
          serverCode: result.code,
        };
  }

  async discardDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ) {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    await this.requireVisibleMaterial(input.academyId, input.materialId, scope);
    // Through the coordinator, so any live document goes with the row rather
    // than outliving it and failing its next flush against a missing draft.
    const discarded = await this.drafts.discard({
      userId,
      materialId: input.materialId,
    });
    return { discarded };
  }

  /**
   * The single entry gate for every learning read: it resolves the actor and,
   * in the same step, the scope their role may reach. Returning them together
   * is deliberate — a method cannot obtain a `userId` here without also
   * receiving the predicate it has to apply.
   */
  private async requireLearner(identity: SupabaseIdentity, academyId: string) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    return { ...actor, scope: learningScopeFor(academyId, actor) };
  }

  private async requireVisibleCourse(
    input: { academyId: string; courseId: string },
    scope: LearningScope,
  ) {
    const course = await this.prisma.course.findFirst({
      where: { ...scope.course, id: input.courseId, isVisible: true },
      include: visibleCurriculumInclude,
    });
    if (!course) {
      // Deliberately the same response as a hidden or nonexistent course: an
      // unassigned course must not be distinguishable by its error.
      throw new AppException("COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return course;
  }

  private async requireVisibleMaterial(
    academyId: string,
    materialId: string,
    scope: LearningScope,
  ) {
    const material = await this.prisma.material.findFirst({
      where: { id: materialId, ...reachableMaterialWhere(academyId, scope) },
      include: { lecture: { include: { courseModule: true } } },
    });
    if (!material) {
      throw new AppException("EXERCISE_NOT_AVAILABLE", HttpStatus.NOT_FOUND);
    }
    return material;
  }

}

function countLines(code: string): number {
  const trimmed = code.trim();
  return trimmed.length === 0 ? 0 : trimmed.split("\n").length;
}
