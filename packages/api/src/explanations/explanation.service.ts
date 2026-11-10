import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import { Injectable } from "@nestjs/common";
import type { ExplanationRead, ExplanationReadResult, SaveExplanation } from "@cove/shared";
import { PrismaService } from "../database/prisma.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { ManualAssetsService } from "../manual/manual-assets.service.js";
import { learningScopeFor, enrolledClassWhere, taughtClassWhere } from "../classes/assigned-course-access.js";
import { effectivelyVisibleActivityWhere } from "../learn/curriculum-visibility.js";
import { withCurriculum } from "../learn/curriculum-read.js";
import { CurriculumOutlineService } from "../learn/curriculum-outline.service.js";
import { assertLessonImages, lessonImageIds } from "../content/lesson-images.js";
import { bumpContentRevision, nextMaterialPosition, compactMaterialPositions } from "../content/content-positions.js";
import { sanitizeExplanation } from "./explanation-html.js";

type Target = { academyId: string; courseId: string; lectureId: string; materialId: string };
@Injectable()
export class ExplanationService {
  constructor(private readonly db: PrismaService, private readonly access: AcademyAccessService,
    private readonly images: ManualAssetsService, private readonly audit: AuditService,
    private readonly outlines: CurriculumOutlineService, private readonly revocation: MonitoringRevocationService) {}

  async read(identity: SupabaseIdentity, input: ExplanationRead): Promise<ExplanationReadResult> {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, input.preview ? "curriculum.review" : "curriculum.read");
    const scope = learningScopeFor(input.academyId, actor);
    const roles = actor.roles ?? [actor.role];
    const classScope = !input.classId ? {} : {
      lecture: { courseModule: { course: { classAssignments: { some: { class: {
        id: input.classId,
        ...(roles.includes("MANAGER") || roles.includes("TEAM_LEAD") ? { academyId: input.academyId, status: "ACTIVE" as const }
          : roles.includes("TEACHER") ? taughtClassWhere(input.academyId, actor.userId) : enrolledClassWhere(input.academyId, actor.userId)),
      } } } } } },
    };
    // Select only an ID through the full authorization predicate. The joins
    // below then read the body/breadcrumb in one statement, not a deep include.
    const allowed = await this.db.material.findFirst({ where: { id: input.materialId, type: "EXPLANATION", AND: [
      input.preview ? { lecture: { courseModule: { course: { academyId: input.academyId } } } }
        : { AND: [effectivelyVisibleActivityWhere(input.academyId), scope.material, classScope] },
    ] }, select: { id: true } });
    if (!allowed) throw new AppException("EXERCISE_NOT_AVAILABLE", 404);
    const [row] = await this.db.$queryRaw<Array<{ materialId: string; title: string; isVisible: boolean; body: string; revision: number; courseId: string; courseTitle: string; lectureId: string; lectureTitle: string }>>`
      SELECT m.id AS "materialId", m.title, m.is_visible AS "isVisible", e.body, e.revision,
        c.id AS "courseId", c.title AS "courseTitle", l.id AS "lectureId", l.title AS "lectureTitle"
      FROM materials m JOIN explanation_materials e ON e.material_id = m.id
      JOIN lectures l ON l.id = m.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id
      JOIN courses c ON c.id = cm.course_id WHERE m.id = ${allowed.id}::uuid`;
    if (!row) throw new AppException("EXERCISE_NOT_AVAILABLE", 404);
    const [images, outline] = await Promise.all([
      this.images.imageDataUrls(lessonImageIds(row.body)),
      this.readOutline(row.courseId, actor.userId, input.classId, Boolean(input.preview), !roles.includes("STUDENT")),
    ]);
    return { materialId: row.materialId, title: row.title, body: row.body, revision: row.revision, isVisible: row.isVisible,
      course: { id: row.courseId, title: row.courseTitle }, lecture: { id: row.lectureId, title: row.lectureTitle }, images, outline };
  }
  private async readOutline(courseId: string, userId: string, classId: string | undefined, preview: boolean, staff: boolean) {
    const course = await this.db.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true, description: true } });
    return this.outlines.outlineFor(await withCurriculum(this.db, course, preview), userId, classId, preview || staff);
  }
  async save(identity: SupabaseIdentity, input: SaveExplanation) {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    const body = sanitizeExplanation(input.body);
    const saved = await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.courseId}::uuid FOR UPDATE`;
      const lecture = await tx.lecture.findFirst({ where: { id: input.lectureId, courseModule: { courseId: input.courseId, course: { academyId: input.academyId } } }, select: { id: true } });
      if (!lecture) throw new AppException("CONTENT_PARENT_MISMATCH", 404);
      const previous = input.materialId ? await tx.explanationMaterial.findFirst({ where: { materialId: input.materialId, material: { lectureId: input.lectureId, type: "EXPLANATION" } }, select: { materialId: true, body: true, revision: true } }) : null;
      if (input.materialId && !previous) throw new AppException("EXERCISE_NOT_AVAILABLE", 404);
      if (previous && previous.revision !== input.expectedRevision) throw new AppException("CONTENT_EDIT_CONFLICT", 409);
      await assertLessonImages(tx, { ...input, html: body, previousHtml: previous?.body });
      const material = previous ? await tx.material.update({ where: { id: previous.materialId }, data: {
        title: input.title, isVisible: input.isVisible, explanationMaterial: { update: { body, revision: { increment: 1 } } },
      }, select: { id: true } }) : await tx.material.create({ data: {
        lectureId: input.lectureId, type: "EXPLANATION", title: input.title, isVisible: false, isRequired: false,
        position: await nextMaterialPosition(tx, input.lectureId), explanationMaterial: { create: { body } },
      }, select: { id: true } });
      await bumpContentRevision(tx, input.courseId);
      await this.audit.write(tx, { actorUserId: actor.userId, academyId: input.academyId, action: previous ? "content.explanation.updated" : "content.explanation.created", targetType: "Material", targetId: material.id, after: { title: input.title, revision: (previous?.revision ?? 0) + 1 } });
      return { materialId: material.id, revision: (previous?.revision ?? 0) + 1 };
    });
    if (input.materialId && !input.isVisible) await this.revoke(input.courseId);
    return saved;
  }
  private async revoke(courseId: string) {
    const assignments = await this.db.classCourse.findMany({ where: { courseId }, select: { classId: true } });
    await Promise.all(assignments.map(({ classId }) => this.revocation.revokeClass(classId, "MATERIAL_UNAVAILABLE")));
  }
  async mutate(identity: SupabaseIdentity, input: Target & { isVisible?: boolean }) {
    const actor = await this.access.requirePermission(identity.authUserId, input.academyId, "curriculum.manage");
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM courses WHERE id = ${input.courseId}::uuid FOR UPDATE`;
      const row = await tx.material.findFirst({ where: { id: input.materialId, type: "EXPLANATION", lectureId: input.lectureId,
        lecture: { courseModule: { courseId: input.courseId, course: { academyId: input.academyId } } } }, select: { id: true } });
      if (!row) throw new AppException("EXERCISE_NOT_AVAILABLE", 404);
      if (input.isVisible === undefined) {
        await tx.material.delete({ where: { id: row.id } });
        await compactMaterialPositions(tx, input.lectureId);
      } else await tx.material.update({ where: { id: row.id }, data: { isVisible: input.isVisible, explanationMaterial: { update: { revision: { increment: 1 } } } } });
      await bumpContentRevision(tx, input.courseId);
      await this.audit.write(tx, { actorUserId: actor.userId, academyId: input.academyId, action: input.isVisible === undefined ? "content.explanation.deleted" : "content.explanation.visibility", targetType: "Material", targetId: row.id, after: { isVisible: input.isVisible ?? false } });
    });
    if (!input.isVisible) await this.revoke(input.courseId);
    return { ok: true };
  }
}
