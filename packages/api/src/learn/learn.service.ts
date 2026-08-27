import { HttpStatus, Injectable } from "@nestjs/common";

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
import type { Prisma } from "../generated/prisma/client.js";
import {
  courseSummaryFor,
  CurriculumOutlineService,
  exerciseMaterialIds,
  nonemptyModules,
  visibleCurriculumInclude,
} from "./curriculum-outline.service.js";
import { reachableMaterialWhere } from "./curriculum-visibility.js";
import { SubmissionService } from "./submission.service.js";
import { LearningClassContextService } from "./learning-class-context.service.js";

/** The material graph one authorized workspace read produces. */
const workspaceMaterialInclude = {
  programmingExercise: {
    include: {
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
    private readonly access: AcademyAccessService,
    private readonly curriculum: CurriculumOutlineService,
    private readonly submissions: SubmissionService,
    private readonly classContext: LearningClassContextService,
  ) {}

  async listCourses(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ courses: LearnCourseSummary[] }> {
    const { userId, scope } = await this.requireLearner(identity, academyId);
    const courses = await this.prisma.course.findMany({
      where: { ...scope.course, isVisible: true },
      include: visibleCurriculumInclude,
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });
    const materialIds = courses.flatMap(exerciseMaterialIds);
    const statuses = await this.curriculum.statusByMaterial(userId, materialIds);

    return {
      courses: courses.flatMap(
        (course) => courseSummaryFor(course, statuses) ?? [],
      ),
    };
  }

  async getCourseOutline(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; classId?: string },
  ): Promise<LearnCourseOutlineResult> {
    const { userId, role, scope } = await this.requireLearner(
      identity,
      input.academyId,
    );
    const course = await this.requireVisibleCourse(input, scope);
    // Delivery is a student's relationship to a course: the class decides
    // progress, presence and points. Staff reach this course through their
    // own permissions and have no enrollment to deliver against, so they get
    // an empty context and the outline renders as a preview.
    const [outline, classContext] = await Promise.all([
      this.curriculum.outlineFor(course, userId),
      role === "STUDENT"
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
      classId?: string;
    },
  ): Promise<LearnExerciseBootstrap> {
    const learner = await this.requireLearner(identity, input.academyId);
    const material = await this.requireWorkspaceMaterial(input, learner.scope);
    const course = material.lecture.courseModule.course;
    const classContext = await this.classContext.resolve({
      academyId: input.academyId,
      userId: learner.userId,
      courseId: course.id,
      requestedClassId: input.classId,
    });

    // The historical attempt is loaded beside the workspace, not instead of
    // it. A submission that does not resolve leaves the ordinary workspace
    // exactly as it was — including whatever draft is already saved.
    const [workspace, outline, selectedSubmission] = await Promise.all([
      this.buildWorkspace(material, learner.userId),
      this.curriculum.outlineFor(course, learner.userId),
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
    return { workspace, navigator, selectedSubmission, classContext };
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
  ) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: input.materialId,
        ...reachableMaterialWhere(input.academyId, scope),
      },
      include: workspaceMaterialInclude,
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
  ): Promise<LearnExerciseWorkspace> {
    const exercise = material.programmingExercise;
    const { courseModule } = material.lecture;
    const course = courseModule.course;
    const [draft, progress] = await Promise.all([
      this.prisma.exerciseDraft.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { code: true, updatedAt: true },
      }),
      this.prisma.studentExerciseProgress.findUnique({
        where: { userId_materialId: { userId, materialId: material.id } },
        select: { status: true, gradingRevision: true },
      }),
    ]);
    const ordered = flattenOutlineExercises(
      nonemptyModules(course).map((module) => ({
        position: module.position,
        lectures: module.lectures.map((lecture) => ({
          id: lecture.id,
          position: lecture.position,
          exercises: lecture.materials.flatMap((item) =>
            item.programmingExercise
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
        sampleTestCases: exercise.testCases
          .filter((testCase) => testCase.visibility === "SAMPLE")
          .map((testCase) => ({
            position: testCase.position,
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
          })),
        hints: exercise.hints.map((hint) => ({
          position: hint.position,
          content: hint.content,
        })),
        hiddenTestCaseCount: exercise.testCases.filter(
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

  async saveDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string; code: string },
  ) {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    const material = await this.requireVisibleMaterial(
      input.academyId,
      input.materialId,
      scope,
    );
    const draft = await this.prisma.exerciseDraft.upsert({
      where: { userId_materialId: { userId, materialId: input.materialId } },
      create: {
        userId,
        materialId: input.materialId,
        sourceMaterialId: input.materialId,
        courseId: material.lecture.courseModule.courseId,
        code: input.code,
      },
      update: { code: input.code },
      select: { updatedAt: true },
    });
    return { updatedAt: draft.updatedAt.toISOString() };
  }

  async discardDraft(
    identity: SupabaseIdentity,
    input: { academyId: string; materialId: string },
  ) {
    const { userId, scope } = await this.requireLearner(identity, input.academyId);
    await this.requireVisibleMaterial(input.academyId, input.materialId, scope);
    const { count } = await this.prisma.exerciseDraft.deleteMany({
      where: { userId, materialId: input.materialId },
    });
    return { discarded: count > 0 };
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
