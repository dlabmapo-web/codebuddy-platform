import { Injectable } from "@nestjs/common";
import { LEAD_MAX_PREVIEW_ROWS } from "@cove/shared";

import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../database/prisma.service.js";
import type { OverviewAggregateScope } from "../teach/teacher-overview.repository.js";

/**
 * Every aggregate behind the curriculum overview, in PostgreSQL.
 *
 * The repository holds no authorization and no arithmetic. It is handed an
 * academy id that `LeadScopeService` has already vouched for, and it returns
 * rows; which of them is a defect, how a rate is computed, and what order any
 * of it appears in are all decided in `@cove/shared` where they can be tested
 * at their boundaries.
 *
 * ## The visibility chain, written once
 *
 * "Can a student see this" is never one column here — the 2026-08-03 design
 * made hiding a parent hide its descendants without touching their own flags.
 * `EFFECTIVE_VISIBILITY` is that chain as SQL, and every scan below composes it
 * rather than restating it, for the same reason
 * `effectivelyVisibleMaterialWhere` exists on the Prisma side: a new scan that
 * checked only the material would silently report content students cannot
 * reach.
 */

/** The four flags that decide whether a student can reach a material. */
const EFFECTIVE_VISIBILITY = Prisma.sql`
  mat.is_visible AND lec.is_visible AND cm.is_visible AND crs.is_visible
`;

/** The curriculum tree, from one material up to its academy. */
const CURRICULUM_TREE = Prisma.sql`
  FROM materials mat
  JOIN lectures lec ON lec.id = mat.lecture_id
  JOIN course_modules cm ON cm.id = lec.course_module_id
  JOIN courses crs ON crs.id = cm.course_id
  JOIN programming_exercises pe ON pe.material_id = mat.id
`;

/** An active student seat, which is what "reaches" means everywhere below. */
const ACTIVE_SEAT = Prisma.sql`
  JOIN class_enrollments en ON en.class_id = cls.id
  JOIN academy_memberships am ON am.id = en.membership_id
    AND am.status = 'ACTIVE'
    AND am.role = 'STUDENT'
`;

export type CatalogRow = {
  courseTotal: number;
  courseVisible: number;
  moduleTotal: number;
  moduleVisible: number;
  lectureTotal: number;
  lectureVisible: number;
  exerciseTotal: number;
  exerciseLive: number;
  exerciseHidden: number;
  exerciseBuried: number;
  easy: number;
  medium: number;
  hard: number;
};

export type BlockerQueryRow = {
  id: string;
  label: string;
  context: string | null;
  courseId: string | null;
  lectureId: string | null;
  materialId: string | null;
  classId: string | null;
  studentsAffected: number;
  total: number;
  distinctStudents: number;
};

export type ChangeRow = {
  id: string;
  action: string;
  actorName: string | null;
  targetType: string;
  targetLabel: string | null;
  wasVisible: boolean | null;
  at: Date;
};

export type MaterialFactsRow = {
  materialId: string;
  title: string;
  position: number;
  lectureId: string;
  lectureTitle: string;
  lecturePosition: number;
  moduleTitle: string;
  modulePosition: number;
  courseId: string;
  courseTitle: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

export type ClassRosterQueryRow = {
  classId: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  teacherMembershipId: string | null;
  teacherName: string | null;
  teacherUnavailable: boolean;
  students: number;
  courses: number;
  courseTitles: string[];
  liveExercises: number;
  total: number;
};

export type RosterTotalsRow = {
  activeClasses: number;
  archivedClasses: number;
  unstaffedClasses: number;
  teachers: number;
  idleTeachers: number;
  students: number;
  unplacedStudents: number;
};

export type CourseFactsRow = {
  courseId: string;
  title: string;
  isVisible: boolean;
  liveExercises: number;
  hiddenExercises: number;
  classes: number;
  studentsReached: number;
  lastChangeAt: Date | null;
};

@Injectable()
export class TeamLeadOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §9.1 — the whole catalog in one pass.
   *
   * One query rather than nine counts. The four levels share the same join
   * chain, and issuing them separately would let the course total and the
   * exercise total be read a few milliseconds apart — which on a page whose
   * entire claim is "this is your curriculum" is a difference somebody would
   * eventually notice and be right about.
   */
  async catalog(academyId: string): Promise<CatalogRow> {
    const [row] = await this.prisma.$queryRaw<CatalogRow[]>`
      WITH tree AS (
        SELECT
          crs.id AS course_id,
          cm.id AS module_id,
          lec.id AS lecture_id,
          mat.id AS material_id,
          mat.is_visible AS material_visible,
          ${EFFECTIVE_VISIBILITY} AS live,
          (lec.is_visible AND cm.is_visible AND crs.is_visible) AS ancestors_visible,
          (cm.is_visible AND crs.is_visible) AS lecture_ancestors_visible,
          crs.is_visible AS module_ancestor_visible,
          lec.is_visible AS lecture_visible,
          cm.is_visible AS module_visible,
          crs.is_visible AS course_visible,
          pe.difficulty AS difficulty
        ${CURRICULUM_TREE}
        WHERE crs.academy_id = ${academyId}::uuid
      )
      SELECT
        (SELECT COUNT(*)::int FROM courses WHERE academy_id = ${academyId}::uuid)
          AS "courseTotal",
        (SELECT COUNT(*)::int FROM courses
          WHERE academy_id = ${academyId}::uuid AND is_visible) AS "courseVisible",
        (SELECT COUNT(*)::int FROM course_modules m
           JOIN courses c ON c.id = m.course_id
          WHERE c.academy_id = ${academyId}::uuid) AS "moduleTotal",
        (SELECT COUNT(*)::int FROM course_modules m
           JOIN courses c ON c.id = m.course_id
          WHERE c.academy_id = ${academyId}::uuid AND m.is_visible AND c.is_visible)
          AS "moduleVisible",
        (SELECT COUNT(*)::int FROM lectures l
           JOIN course_modules m ON m.id = l.course_module_id
           JOIN courses c ON c.id = m.course_id
          WHERE c.academy_id = ${academyId}::uuid) AS "lectureTotal",
        (SELECT COUNT(*)::int FROM lectures l
           JOIN course_modules m ON m.id = l.course_module_id
           JOIN courses c ON c.id = m.course_id
          WHERE c.academy_id = ${academyId}::uuid
            AND l.is_visible AND m.is_visible AND c.is_visible) AS "lectureVisible",
        COUNT(*)::int AS "exerciseTotal",
        COUNT(*) FILTER (WHERE live)::int AS "exerciseLive",
        COUNT(*) FILTER (WHERE NOT material_visible)::int AS "exerciseHidden",
        COUNT(*) FILTER (WHERE material_visible AND NOT ancestors_visible)::int
          AS "exerciseBuried",
        COUNT(*) FILTER (WHERE live AND difficulty = 'EASY')::int AS easy,
        COUNT(*) FILTER (WHERE live AND difficulty = 'MEDIUM')::int AS medium,
        COUNT(*) FILTER (WHERE live AND difficulty = 'HARD')::int AS hard
      FROM tree
    `;
    return (
      row ?? {
        courseTotal: 0,
        courseVisible: 0,
        moduleTotal: 0,
        moduleVisible: 0,
        lectureTotal: 0,
        lectureVisible: 0,
        exerciseTotal: 0,
        exerciseLive: 0,
        exerciseHidden: 0,
        exerciseBuried: 0,
        easy: 0,
        medium: 0,
        hard: 0,
      }
    );
  }

  /** Courses reaching at least one active class, and students reached overall. */
  async reachTotals(
    academyId: string,
  ): Promise<{ taughtCourses: number; studentsReached: number }> {
    const [row] = await this.prisma.$queryRaw<
      { taughtCourses: number; studentsReached: number }[]
    >`
      SELECT
        (SELECT COUNT(DISTINCT cc.course_id)::int
           FROM class_courses cc
           JOIN classes cls ON cls.id = cc.class_id AND cls.status = 'ACTIVE'
           JOIN courses c ON c.id = cc.course_id
          WHERE c.academy_id = ${academyId}::uuid) AS "taughtCourses",
        (SELECT COUNT(DISTINCT en.membership_id)::int
           FROM classes cls
           ${ACTIVE_SEAT}
          WHERE cls.academy_id = ${academyId}::uuid
            AND cls.status = 'ACTIVE'
            AND EXISTS (SELECT 1 FROM class_courses cc WHERE cc.class_id = cls.id))
          AS "studentsReached"
    `;
    return row ?? { taughtCourses: 0, studentsReached: 0 };
  }

  /**
   * One blocker scan, given what counts as an offender.
   *
   * The three parts every scan shares — count the offenders, count the students
   * each one reaches, count the distinct students the whole group reaches —
   * are written once here. §9.2 needs that last figure to be distinct rather
   * than a sum of rows: one class sitting behind three defective exercises is
   * one affected class, and adding the rows would report its students three
   * times.
   *
   * `COUNT(*) OVER ()` is evaluated before `LIMIT`, so the total is the true
   * one even though the caller only ever renders five rows.
   */
  private async scan(
    offenders: Prisma.Sql,
    reach: "course" | "class",
  ): Promise<BlockerQueryRow[]> {
    const students =
      reach === "course"
        ? Prisma.sql`
            SELECT o.id AS offender_id, en.membership_id
            FROM offenders o
            JOIN class_courses cc ON cc.course_id = o.course_id
            JOIN classes cls ON cls.id = cc.class_id AND cls.status = 'ACTIVE'
            ${ACTIVE_SEAT}
          `
        : Prisma.sql`
            SELECT o.id AS offender_id, en.membership_id
            FROM offenders o
            JOIN classes cls ON cls.id = o.class_id
            ${ACTIVE_SEAT}
          `;

    return this.prisma.$queryRaw<BlockerQueryRow[]>`
      WITH offenders AS (${offenders}),
      reached AS (${students})
      SELECT
        o.id,
        o.label,
        o.context,
        o.course_id AS "courseId",
        o.lecture_id AS "lectureId",
        o.material_id AS "materialId",
        o.class_id AS "classId",
        COUNT(DISTINCT r.membership_id)::int AS "studentsAffected",
        COUNT(*) OVER ()::int AS total,
        (SELECT COUNT(DISTINCT membership_id)::int FROM reached) AS "distinctStudents"
      FROM offenders o
      LEFT JOIN reached r ON r.offender_id = o.id
      GROUP BY o.id, o.label, o.context, o.course_id, o.lecture_id,
               o.material_id, o.class_id
      ORDER BY "studentsAffected" DESC, o.label ASC, o.id ASC
      LIMIT 50
    `;
  }

  /** An active class is assigned a course students cannot see. §9.2. */
  hiddenCourseAssigned(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          (cc.class_id::text || ':' || cc.course_id::text) AS id,
          crs.title AS label,
          cls.name AS context,
          crs.id AS course_id,
          NULL::uuid AS lecture_id,
          NULL::uuid AS material_id,
          cls.id AS class_id
        FROM class_courses cc
        JOIN classes cls ON cls.id = cc.class_id AND cls.status = 'ACTIVE'
        JOIN courses crs ON crs.id = cc.course_id
        WHERE crs.academy_id = ${academyId}::uuid AND NOT crs.is_visible
      `,
      "class",
    );
  }

  /** A visible course with nothing in it a student could open. §9.2. */
  emptyVisibleCourse(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          crs.id::text AS id,
          crs.title AS label,
          NULL::text AS context,
          crs.id AS course_id,
          NULL::uuid AS lecture_id,
          NULL::uuid AS material_id,
          NULL::uuid AS class_id
        FROM courses crs
        WHERE crs.academy_id = ${academyId}::uuid
          AND crs.is_visible
          AND NOT EXISTS (
            SELECT 1
            FROM materials mat
            JOIN lectures lec ON lec.id = mat.lecture_id
            JOIN course_modules cm ON cm.id = lec.course_module_id
            WHERE cm.course_id = crs.id
              AND mat.is_visible AND lec.is_visible AND cm.is_visible
          )
      `,
      "course",
    );
  }

  /**
   * A live exercise that cannot grade anybody. §9.2.
   *
   * "Only sample cases" counts. A student can read every sample and pass
   * without solving anything, which is not a grading outcome anybody authored
   * on purpose.
   */
  ungradeableExercise(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          mat.id::text AS id,
          mat.title AS label,
          (crs.title || ' › ' || lec.title) AS context,
          crs.id AS course_id,
          lec.id AS lecture_id,
          mat.id AS material_id,
          NULL::uuid AS class_id
        ${CURRICULUM_TREE}
        WHERE crs.academy_id = ${academyId}::uuid
          AND ${EFFECTIVE_VISIBILITY}
          AND NOT EXISTS (
            SELECT 1 FROM exercise_test_cases tc
            WHERE tc.exercise_material_id = mat.id AND tc.visibility = 'HIDDEN'
          )
      `,
      "course",
    );
  }

  /** A live exercise with no description to solve. §9.2. */
  unfinishedExercise(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          mat.id::text AS id,
          mat.title AS label,
          (crs.title || ' › ' || lec.title) AS context,
          crs.id AS course_id,
          lec.id AS lecture_id,
          mat.id AS material_id,
          NULL::uuid AS class_id
        ${CURRICULUM_TREE}
        WHERE crs.academy_id = ${academyId}::uuid
          AND ${EFFECTIVE_VISIBILITY}
          AND btrim(pe.description) = ''
      `,
      "course",
    );
  }

  /** An active class with nobody responsible for it. §9.2. */
  classWithoutTeacher(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          cls.id::text AS id,
          cls.name AS label,
          NULL::text AS context,
          NULL::uuid AS course_id,
          NULL::uuid AS lecture_id,
          NULL::uuid AS material_id,
          cls.id AS class_id
        FROM classes cls
        WHERE cls.academy_id = ${academyId}::uuid
          AND cls.status = 'ACTIVE'
          AND cls.teacher_membership_id IS NULL
      `,
      "class",
    );
  }

  /**
   * An active class whose stored teacher no longer grants access. §9.2.
   *
   * The same three conditions `assignmentGrantsAccess` checks in
   * `@cove/shared`, because the fix differs from an unassigned class — somebody
   * has to decide whether to replace or clear — and a page that folded the two
   * together would name one action for two situations.
   */
  classTeacherUnavailable(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          cls.id::text AS id,
          cls.name AS label,
          usr.display_name AS context,
          NULL::uuid AS course_id,
          NULL::uuid AS lecture_id,
          NULL::uuid AS material_id,
          cls.id AS class_id
        FROM classes cls
        JOIN academy_memberships tm ON tm.id = cls.teacher_membership_id
        JOIN users usr ON usr.id = tm.user_id
        WHERE cls.academy_id = ${academyId}::uuid
          AND cls.status = 'ACTIVE'
          AND NOT (tm.status = 'ACTIVE' AND tm.role = 'TEACHER' AND usr.status = 'ACTIVE')
      `,
      "class",
    );
  }

  /** An active class with nothing to learn. §9.2. */
  classWithoutCourse(academyId: string) {
    return this.scan(
      Prisma.sql`
        SELECT
          cls.id::text AS id,
          cls.name AS label,
          NULL::text AS context,
          NULL::uuid AS course_id,
          NULL::uuid AS lecture_id,
          NULL::uuid AS material_id,
          cls.id AS class_id
        FROM classes cls
        WHERE cls.academy_id = ${academyId}::uuid
          AND cls.status = 'ACTIVE'
          AND NOT EXISTS (
            SELECT 1 FROM class_courses cc WHERE cc.class_id = cls.id
          )
      `,
      "class",
    );
  }

  /**
   * §9.3 — recent audited curriculum changes, with the label each one touched.
   *
   * The target's name is resolved by a union rather than four round trips, and
   * `wasVisible` comes from the audit row's own `after` document: it is what
   * the change left behind, which is the only place the state at that moment
   * still exists. A row whose payload never carried the flag answers null,
   * because "we did not record it" and "it was hidden" are different claims.
   */
  async changes(academyId: string, limit: number): Promise<ChangeRow[]> {
    return this.prisma.$queryRaw<ChangeRow[]>`
      WITH content_log AS (
        SELECT
          a.id,
          a.action,
          a.actor_user_id,
          a.target_type,
          a.target_id::uuid AS target_uuid,
          a.after,
          a.created_at
        FROM audit_logs a
        WHERE a.academy_id = ${academyId}::uuid
          AND a.action LIKE 'content.%'
          AND a.target_type IN ('Course', 'CourseModule', 'Lecture', 'Material')
          AND a.target_id IS NOT NULL
        ORDER BY a.created_at DESC, a.id ASC
        LIMIT ${limit}
      )
      SELECT
        c.id,
        c.action,
        usr.display_name AS "actorName",
        c.target_type AS "targetType",
        COALESCE(crs.title, cm.title, lec.title, mat.title) AS "targetLabel",
        CASE
          WHEN jsonb_exists(c.after, 'isVisible')
            THEN (c.after ->> 'isVisible')::boolean
          ELSE NULL
        END AS "wasVisible",
        c.created_at AS at
      FROM content_log c
      LEFT JOIN users usr ON usr.id = c.actor_user_id
      LEFT JOIN courses crs
        ON c.target_type = 'Course' AND crs.id = c.target_uuid
      LEFT JOIN course_modules cm
        ON c.target_type = 'CourseModule' AND cm.id = c.target_uuid
      LEFT JOIN lectures lec
        ON c.target_type = 'Lecture' AND lec.id = c.target_uuid
      LEFT JOIN materials mat
        ON c.target_type = 'Material' AND mat.id = c.target_uuid
      ORDER BY c.created_at DESC, c.id ASC
    `;
  }

  /**
   * Every live exercise with the curriculum path that names it.
   *
   * Read once and joined in memory to the measurement rows, rather than
   * decorating each aggregate with its own copy of this join. Four sections
   * need the same path for the same exercise, and four joins is four chances
   * for them to disagree about which lecture a problem is in.
   */
  async liveMaterials(academyId: string): Promise<MaterialFactsRow[]> {
    return this.prisma.$queryRaw<MaterialFactsRow[]>`
      SELECT
        mat.id AS "materialId",
        mat.title,
        mat.position,
        lec.id AS "lectureId",
        lec.title AS "lectureTitle",
        lec.position AS "lecturePosition",
        cm.title AS "moduleTitle",
        cm.position AS "modulePosition",
        crs.id AS "courseId",
        crs.title AS "courseTitle",
        pe.difficulty
      ${CURRICULUM_TREE}
      WHERE crs.academy_id = ${academyId}::uuid AND ${EFFECTIVE_VISIBILITY}
    `;
  }

  /**
   * The academy's active classes as an analytics scope.
   *
   * The same shape `aggregateScopeFor` builds from one teacher's assigned
   * classes, built instead from every active class in the academy. That is the
   * whole of the difference between a teacher's reach and this one, and
   * building it here rather than branching inside the teach module is what
   * stops either reach from widening by an edit to the other's predicate.
   */
  async aggregateScope(academyId: string): Promise<OverviewAggregateScope> {
    const [studentClasses, materialClasses] = await Promise.all([
      this.prisma.$queryRaw<
        { classId: string; userId: string; membershipId: string }[]
      >`
        SELECT cls.id AS "classId", am.user_id AS "userId", am.id AS "membershipId"
        FROM classes cls
        ${ACTIVE_SEAT}
        WHERE cls.academy_id = ${academyId}::uuid AND cls.status = 'ACTIVE'
      `,
      this.prisma.$queryRaw<
        { classId: string; courseId: string; materialId: string }[]
      >`
        SELECT cls.id AS "classId", crs.id AS "courseId", mat.id AS "materialId"
        FROM classes cls
        JOIN class_courses cc ON cc.class_id = cls.id
        JOIN courses crs ON crs.id = cc.course_id
        JOIN course_modules cm ON cm.course_id = crs.id
        JOIN lectures lec ON lec.course_module_id = cm.id
        JOIN materials mat ON mat.lecture_id = lec.id
        JOIN programming_exercises pe ON pe.material_id = mat.id
        WHERE cls.academy_id = ${academyId}::uuid
          AND cls.status = 'ACTIVE'
          AND ${EFFECTIVE_VISIBILITY}
      `,
    ]);
    return { studentClasses, materialClasses };
  }

  /**
   * One row per class, with its teacher, its seat count, and its courses.
   *
   * `teacherUnavailable` is computed here from the same three conditions the
   * `class_teacher_unavailable` blocker scans for — a membership that is not
   * ACTIVE, or no longer holds TEACHER. Deriving it twice from one predicate
   * written once is what stops the queue and the roster disagreeing about a
   * class while sitting on the same screen.
   *
   * The teacher join is LEFT and unconditional on status: a stale assignment
   * has to stay visible in order to be cleared, and an inner join on an active
   * teacher would render exactly the broken classes invisible.
   *
   * Course titles are cut to the preview bound inside the query rather than in
   * memory, so a class with forty courses does not ship forty strings to draw
   * five.
   */
  async classRoster(
    academyId: string,
    limit: number,
  ): Promise<ClassRosterQueryRow[]> {
    return this.prisma.$queryRaw<ClassRosterQueryRow[]>`
      WITH seats AS (
        SELECT en.class_id, COUNT(*)::int AS students
        FROM class_enrollments en
        JOIN academy_memberships am ON am.id = en.membership_id
          AND am.status = 'ACTIVE'
          AND am.role = 'STUDENT'
        GROUP BY en.class_id
      ),
      attached AS (
        SELECT
          cc.class_id,
          COUNT(*)::int AS courses,
          (ARRAY_AGG(crs.title ORDER BY crs.title ASC))[1:${Prisma.raw(String(LEAD_MAX_PREVIEW_ROWS))}]
            AS course_titles
        FROM class_courses cc
        JOIN courses crs ON crs.id = cc.course_id
        GROUP BY cc.class_id
      ),
      live AS (
        SELECT cc.class_id, COUNT(DISTINCT mat.id)::int AS live_exercises
        FROM class_courses cc
        JOIN courses crs ON crs.id = cc.course_id
        JOIN course_modules cm ON cm.course_id = crs.id
        JOIN lectures lec ON lec.course_module_id = cm.id
        JOIN materials mat ON mat.lecture_id = lec.id
        JOIN programming_exercises pe ON pe.material_id = mat.id
        WHERE ${EFFECTIVE_VISIBILITY}
        GROUP BY cc.class_id
      )
      SELECT
        cls.id AS "classId",
        cls.name,
        cls.status::text AS status,
        cls.teacher_membership_id AS "teacherMembershipId",
        usr.display_name AS "teacherName",
        (cls.teacher_membership_id IS NOT NULL
          AND (tm.id IS NULL OR tm.status <> 'ACTIVE' OR tm.role <> 'TEACHER'))
          AS "teacherUnavailable",
        COALESCE(s.students, 0) AS students,
        COALESCE(a.courses, 0) AS courses,
        COALESCE(a.course_titles, ARRAY[]::text[]) AS "courseTitles",
        COALESCE(l.live_exercises, 0) AS "liveExercises",
        COUNT(*) OVER ()::int AS total
      FROM classes cls
      LEFT JOIN academy_memberships tm ON tm.id = cls.teacher_membership_id
      LEFT JOIN users usr ON usr.id = tm.user_id
      LEFT JOIN seats s ON s.class_id = cls.id
      LEFT JOIN attached a ON a.class_id = cls.id
      LEFT JOIN live l ON l.class_id = cls.id
      WHERE cls.academy_id = ${academyId}::uuid
      ORDER BY
        (cls.status = 'ARCHIVED') ASC,
        COALESCE(s.students, 0) DESC,
        cls.name ASC,
        cls.id ASC
      LIMIT ${limit}
    `;
  }

  /**
   * The academy's teaching capacity, as totals and loose ends.
   *
   * One query rather than six, because these numbers are read as a set — "four
   * teachers, one running nothing" is a sentence, and assembling it from
   * separately clocked reads is how a page ends up claiming an academy has
   * more idle teachers than teachers.
   *
   * "Loose" is always counted against ACTIVE classes only. A teacher whose only
   * class was archived is idle, and a student whose only seat was in an
   * archived class is unplaced; both are true statements about right now, and
   * counting archived rows would hide exactly the person who needs placing.
   */
  async rosterTotals(academyId: string): Promise<RosterTotalsRow> {
    const [row] = await this.prisma.$queryRaw<RosterTotalsRow[]>`
      SELECT
        (SELECT COUNT(*)::int FROM classes
          WHERE academy_id = ${academyId}::uuid AND status = 'ACTIVE')
          AS "activeClasses",
        (SELECT COUNT(*)::int FROM classes
          WHERE academy_id = ${academyId}::uuid AND status = 'ARCHIVED')
          AS "archivedClasses",
        (SELECT COUNT(*)::int FROM classes cls
          LEFT JOIN academy_memberships tm ON tm.id = cls.teacher_membership_id
          WHERE cls.academy_id = ${academyId}::uuid
            AND cls.status = 'ACTIVE'
            AND (tm.id IS NULL OR tm.status <> 'ACTIVE' OR tm.role <> 'TEACHER'))
          AS "unstaffedClasses",
        (SELECT COUNT(*)::int FROM academy_memberships
          WHERE academy_id = ${academyId}::uuid
            AND status = 'ACTIVE' AND role = 'TEACHER')
          AS teachers,
        (SELECT COUNT(*)::int FROM academy_memberships am
          WHERE am.academy_id = ${academyId}::uuid
            AND am.status = 'ACTIVE' AND am.role = 'TEACHER'
            AND NOT EXISTS (
              SELECT 1 FROM classes cls
              WHERE cls.teacher_membership_id = am.id AND cls.status = 'ACTIVE'))
          AS "idleTeachers",
        (SELECT COUNT(*)::int FROM academy_memberships
          WHERE academy_id = ${academyId}::uuid
            AND status = 'ACTIVE' AND role = 'STUDENT')
          AS students,
        (SELECT COUNT(*)::int FROM academy_memberships am
          WHERE am.academy_id = ${academyId}::uuid
            AND am.status = 'ACTIVE' AND am.role = 'STUDENT'
            AND NOT EXISTS (
              SELECT 1 FROM class_enrollments en
              JOIN classes cls ON cls.id = en.class_id AND cls.status = 'ACTIVE'
              WHERE en.membership_id = am.id))
          AS "unplacedStudents"
    `;
    return (
      row ?? {
        activeClasses: 0,
        archivedClasses: 0,
        unstaffedClasses: 0,
        teachers: 0,
        idleTeachers: 0,
        students: 0,
        unplacedStudents: 0,
      }
    );
  }

  /** §11 — one row per course, before any period-scoped measurement. */
  async courseFacts(academyId: string): Promise<CourseFactsRow[]> {
    return this.prisma.$queryRaw<CourseFactsRow[]>`
      SELECT
        crs.id AS "courseId",
        crs.title,
        crs.is_visible AS "isVisible",
        COALESCE(ex.live, 0)::int AS "liveExercises",
        COALESCE(ex.hidden, 0)::int AS "hiddenExercises",
        COALESCE(cl.classes, 0)::int AS classes,
        COALESCE(cl.students, 0)::int AS "studentsReached",
        chg.last_change_at AS "lastChangeAt"
      FROM courses crs
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE mat.is_visible AND lec.is_visible AND cm.is_visible AND crs.is_visible) AS live,
          COUNT(*) FILTER (WHERE NOT (mat.is_visible AND lec.is_visible AND cm.is_visible AND crs.is_visible)) AS hidden
        FROM materials mat
        JOIN lectures lec ON lec.id = mat.lecture_id
        JOIN course_modules cm ON cm.id = lec.course_module_id
        JOIN programming_exercises pe ON pe.material_id = mat.id
        WHERE cm.course_id = crs.id
      ) ex ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT cls.id) AS classes,
          COUNT(DISTINCT en.membership_id) AS students
        FROM class_courses cc
        JOIN classes cls ON cls.id = cc.class_id AND cls.status = 'ACTIVE'
        ${ACTIVE_SEAT}
        WHERE cc.course_id = crs.id
      ) cl ON TRUE
      LEFT JOIN LATERAL (
        SELECT MAX(a.created_at) AS last_change_at
        FROM audit_logs a
        WHERE a.academy_id = crs.academy_id
          AND a.action LIKE 'content.%'
          AND a.target_type = 'Course'
          AND a.target_id = crs.id::text
      ) chg ON TRUE
      WHERE crs.academy_id = ${academyId}::uuid
    `;
  }

  /** Median counted learning seconds per reached student, by course. */
  async medianActiveByCourse(
    academyId: string,
    startDate: string | null,
    endDate: string,
  ): Promise<{ courseId: string; medianSeconds: number }[]> {
    const from = startDate
      ? Prisma.sql`AND d.local_date >= ${startDate}::date`
      : Prisma.empty;
    return this.prisma.$queryRaw<{ courseId: string; medianSeconds: number }[]>`
      WITH per_student AS (
        SELECT d.course_id, d.membership_id, SUM(d.active_seconds)::int AS seconds
        FROM student_course_learning_days d
        WHERE d.academy_id = ${academyId}::uuid
          AND d.local_date <= ${endDate}::date
          ${from}
        GROUP BY d.course_id, d.membership_id
      )
      SELECT
        course_id AS "courseId",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY seconds)::int AS "medianSeconds"
      FROM per_student
      GROUP BY course_id
    `;
  }

  /**
   * Distinct students with a counted attempt in the period, by course.
   *
   * Its own query rather than an inference from the per-problem difficulty
   * rows: those count distinct students *per problem*, and no combination of
   * them answers "how many distinct students worked in this course" — the same
   * child appears in every problem they opened.
   */
  async activeStudentsByCourse(
    academyId: string,
    startAt: Date | null,
    endAt: Date,
  ): Promise<{ courseId: string; activeStudents: number }[]> {
    const from = startAt ? Prisma.sql`AND s.created_at >= ${startAt}` : Prisma.empty;
    return this.prisma.$queryRaw<{ courseId: string; activeStudents: number }[]>`
      SELECT crs.id AS "courseId", COUNT(DISTINCT s.user_id)::int AS "activeStudents"
      FROM submissions s
      JOIN materials mat ON mat.id = s.material_id
      JOIN lectures lec ON lec.id = mat.lecture_id
      JOIN course_modules cm ON cm.id = lec.course_module_id
      JOIN courses crs ON crs.id = cm.course_id
      WHERE crs.academy_id = ${academyId}::uuid
        AND s.created_at < ${endAt}
        ${from}
      GROUP BY crs.id
    `;
  }

  /** Distinct solved (student, exercise) pairs by course, for §11's completion. */
  async solvedPairsByCourse(
    academyId: string,
  ): Promise<{ courseId: string; solvedPairs: number }[]> {
    return this.prisma.$queryRaw<{ courseId: string; solvedPairs: number }[]>`
      SELECT crs.id AS "courseId", COUNT(*)::int AS "solvedPairs"
      FROM student_exercise_progress sep
      JOIN materials mat ON mat.id = sep.material_id
      JOIN lectures lec ON lec.id = mat.lecture_id
      JOIN course_modules cm ON cm.id = lec.course_module_id
      JOIN courses crs ON crs.id = cm.course_id
      JOIN programming_exercises pe ON pe.material_id = mat.id
      WHERE crs.academy_id = ${academyId}::uuid
        AND sep.status = 'SOLVED'
        AND mat.is_visible AND lec.is_visible AND cm.is_visible AND crs.is_visible
      GROUP BY crs.id
    `;
  }
}
