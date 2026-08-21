import { Injectable, Logger } from "@nestjs/common";
import {
  LEAD_MAX_CLASS_ROWS,
  LEAD_MAX_COURSE_ROWS,
  MIN_STUDENTS_FOR_PROBLEM_SIGNAL,
  academyDayStart,
  LEAD_MAX_PREVIEW_ROWS,
  buildBlockerGroups,
  compareClassRoster,
  calibrationVerdictFor,
  compareCalibration,
  compareCourseReach,
  compareDifficultProblems,
  compareGrind,
  courseCompletion,
  findDropOff,
  isCurriculumAuditAction,
  isGrind,
  lectureReadiness,
  resolveOverviewPeriod,
  sharePercent,
  submissionsPerSolver,
  teacherOutlineNumber,
  type BlockerKind,
  type BlockerRow,
  type ClassRosterRow,
  type CalibrationRow,
  type CourseReachRow,
  type CurriculumChange,
  type DifficultProblem,
  type GetTeamLeadOverviewInput,
  type GrindRow,
  type NeverAttemptedRow,
  type TeachingRoster,
  type TeamLeadOverview,
  type TeamLeadOverviewSection,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PrismaService } from "../database/prisma.service.js";
import { TeacherOverviewRepository } from "../teach/teacher-overview.repository.js";
import { LeadScopeService } from "./lead-scope.service.js";
import {
  TeamLeadOverviewRepository,
  type BlockerQueryRow,
  type MaterialFactsRow,
} from "./team-lead-overview.repository.js";

/**
 * The Team Lead's curriculum overview, as one bounded snapshot.
 *
 * §8 — one request, one instant. The reads below run together and are settled
 * together, so the catalog, the blockers, and the effectiveness panel all
 * describe the same moment. Composing them in the browser would let three
 * sections of one page disagree about the same academy, and a reader who
 * noticed would be right.
 *
 * §13 — the catalog is the page's own claim and is deliberately not settled: a
 * curriculum overview that cannot count the curriculum is an error page, not a
 * narrower one. Everything below it is evidence, and evidence that could not be
 * gathered says so in its own panel while the rest stands.
 */
@Injectable()
export class TeamLeadOverviewService {
  private readonly logger = new Logger(TeamLeadOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: LeadScopeService,
    private readonly repository: TeamLeadOverviewRepository,
    private readonly learning: TeacherOverviewRepository,
  ) {}

  async get(
    identity: SupabaseIdentity,
    input: GetTeamLeadOverviewInput,
  ): Promise<TeamLeadOverview> {
    const actor = await this.scopes.requireTeamLead(
      identity,
      input.academyId,
      // Held by TEAM_LEAD and nobody else. §5 keeps the explicit role
      // conjunction behind it anyway.
      "curriculum.manage",
    );

    const now = new Date();
    const period = resolveOverviewPeriod({
      range: input.range ?? "30d",
      now,
      timeZone: actor.timeZone,
    });
    const unavailable: TeamLeadOverviewSection[] = [];
    const settle = settler(unavailable, this.logger);

    /* -------------------------------------------------------------- core */

    // Not settled. §13 — if these fail there is no narrower page to render, so
    // the failure reaches the caller and the interface offers a retry.
    const [academy, catalogRow, reachTotals] = await Promise.all([
      this.prisma.academy.findUniqueOrThrow({
        where: { id: actor.academyId },
        select: { id: true, name: true, timeZone: true },
      }),
      this.repository.catalog(actor.academyId),
      this.repository.reachTotals(actor.academyId),
    ]);

    /* ----------------------------------------------------------- evidence */

    const [
      blockerScans,
      changeRows,
      materials,
      scope,
      courseFacts,
      solvedPairs,
      activeStudents,
      medians,
      activityTrackedSince,
      roster,
    ] = await Promise.all([
      settle(["blockers"], () => this.scanBlockers(actor.academyId), null),
      settle(
        ["changes"],
        () => this.repository.changes(actor.academyId, LEAD_MAX_PREVIEW_ROWS),
        [],
      ),
      settle(
        ["effectiveness", "courses"],
        () => this.repository.liveMaterials(actor.academyId),
        [],
      ),
      settle(
        ["effectiveness", "courses"],
        () => this.repository.aggregateScope(actor.academyId),
        { studentClasses: [], materialClasses: [] },
      ),
      settle(
        ["courses"],
        () => this.repository.courseFacts(actor.academyId),
        [],
      ),
      settle(
        ["courses"],
        () => this.repository.solvedPairsByCourse(actor.academyId),
        [],
      ),
      settle(
        ["courses"],
        () =>
          this.repository.activeStudentsByCourse(
            actor.academyId,
            period.startAt ? new Date(period.startAt) : null,
            new Date(period.endAt),
          ),
        [],
      ),
      settle(
        ["courses"],
        () =>
          this.repository.medianActiveByCourse(
            actor.academyId,
            period.startDate,
            period.endDate,
          ),
        [],
      ),
      settle(
        [],
        () => this.learning.activityTrackedSince(actor.academyId),
        null,
      ),
      settle(["roster"], () => this.readRoster(actor.academyId), EMPTY_ROSTER),
    ]);

    const materialById = new Map(
      materials.map((material) => [material.materialId, material]),
    );

    const [difficulty, lectureProgress] = await Promise.all([
      settle(
        ["effectiveness"],
        () =>
          this.learning.problemDifficulty(scope, {
            startAt: period.startAt ? new Date(period.startAt) : null,
            endAt: new Date(period.endAt),
          }),
        [],
      ),
      settle(
        ["courses"],
        () => this.learning.lectureProgressByStudent(scope),
        [],
      ),
    ]);

    /* ------------------------------------------------------------ catalog */

    const visibleCourses = catalogRow.courseVisible;
    const catalog = {
      courses: split(catalogRow.courseTotal, catalogRow.courseVisible),
      modules: split(catalogRow.moduleTotal, catalogRow.moduleVisible),
      lectures: split(catalogRow.lectureTotal, catalogRow.lectureVisible),
      exercises: {
        total: catalogRow.exerciseTotal,
        live: catalogRow.exerciseLive,
        hidden: catalogRow.exerciseHidden,
        buried: catalogRow.exerciseBuried,
      },
      difficulty: {
        EASY: catalogRow.easy,
        MEDIUM: catalogRow.medium,
        HARD: catalogRow.hard,
      },
      taughtCourses: reachTotals.taughtCourses,
      // Only a *visible* course can be shelved. A hidden course reaching nobody
      // is a draft, which is the ordinary state of work in progress and not
      // something worth counting at a Team Lead.
      shelvedCourses: Math.max(0, visibleCourses - reachTotals.taughtCourses),
      studentsReached: reachTotals.studentsReached,
    };

    /* ----------------------------------------------------------- blockers */

    const blockers = blockerScans ? buildBlockerGroups(blockerScans) : [];

    /* ------------------------------------------------------------ changes */

    // A row whose action this build has no name for is dropped rather than
    // printed as a raw dotted code. `curriculumAuditActions` is the shared list
    // both the API and the locale catalogues are tested against, so the only
    // way to reach this filter is a deployment mid-rollout.
    const changes: CurriculumChange[] = changeRows.flatMap((row) => {
      if (!isCurriculumAuditAction(row.action)) return [];
      if (!row.targetLabel) return [];
      return [
        {
          id: row.id,
          action: row.action,
          actorName: row.actorName,
          targetLabel: row.targetLabel,
          targetType: row.targetType as CurriculumChange["targetType"],
          wasVisible: row.wasVisible,
          at: row.at.toISOString(),
        },
      ];
    });

    /* ------------------------------------------------------ effectiveness */

    const attemptedMaterials = new Set(difficulty.map((row) => row.materialId));

    const problems: DifficultProblem[] = [];
    const calibration: CalibrationRow[] = [];
    const grind: GrindRow[] = [];

    for (const row of difficulty) {
      const material = materialById.get(row.materialId);
      if (!material) continue;
      const solveRate =
        sharePercent(row.solvedStudents, row.attemptingStudents) ?? 0;
      const outlineNumber = teacherOutlineNumber({
        modulePosition: material.modulePosition,
        lecturePosition: material.lecturePosition,
        problemPosition: material.position,
      });

      // §10.1's floor gates this panel alone. Calibration and grind carry their
      // own, higher floors below, and skipping the whole row here would make
      // one threshold silently govern three sections.
      if (row.attemptingStudents >= MIN_STUDENTS_FOR_PROBLEM_SIGNAL) {
        problems.push({
          materialId: row.materialId,
          title: material.title,
          courseTitle: material.courseTitle,
          moduleTitle: material.moduleTitle,
          lectureTitle: material.lectureTitle,
          outlineNumber,
          attemptingStudents: row.attemptingStudents,
          solvedStudents: row.solvedStudents,
          solveRate,
          submissions: row.submissions,
          // The class this problem is taught to is not a fact this page is about;
          // the schema requires the field, and the first class teaching it is the
          // one a drill-down would open.
          classId: firstClassFor(scope, row.materialId) ?? material.courseId,
        });
      }

      const verdict = calibrationVerdictFor({
        difficulty: material.difficulty,
        solveRate,
        attemptingStudents: row.attemptingStudents,
      });
      if (verdict) {
        calibration.push({
          materialId: row.materialId,
          title: material.title,
          courseId: material.courseId,
          courseTitle: material.courseTitle,
          lectureTitle: material.lectureTitle,
          outlineNumber,
          difficulty: material.difficulty,
          solveRate,
          attemptingStudents: row.attemptingStudents,
          solvedStudents: row.solvedStudents,
          verdict,
        });
      }

      const ratio = submissionsPerSolver({
        submissions: row.submissions,
        solvedStudents: row.solvedStudents,
      });
      if (isGrind({ ratio, solveRate }) && ratio !== null) {
        grind.push({
          materialId: row.materialId,
          title: material.title,
          courseId: material.courseId,
          courseTitle: material.courseTitle,
          lectureTitle: material.lectureTitle,
          outlineNumber,
          submissions: row.submissions,
          solvedStudents: row.solvedStudents,
          ratio,
          solveRate,
        });
      }
    }

    // §10.5 — live, in front of active students, and still untouched. The
    // trailing qualifier is what keeps one dormant class from filling the panel
    // with exercises nobody was ever going to reach.
    const reachByCourse = courseReachCounts(scope);
    const activeCourses = new Set(
      difficulty.flatMap((row) => {
        const material = materialById.get(row.materialId);
        return material ? [material.courseId] : [];
      }),
    );
    const neverAttemptedAll: NeverAttemptedRow[] = materials
      .filter(
        (material) =>
          !attemptedMaterials.has(material.materialId) &&
          activeCourses.has(material.courseId) &&
          (reachByCourse.get(material.courseId)?.size ?? 0) > 0,
      )
      .map((material) => ({
        materialId: material.materialId,
        title: material.title,
        courseId: material.courseId,
        courseTitle: material.courseTitle,
        lectureTitle: material.lectureTitle,
        outlineNumber: teacherOutlineNumber({
          modulePosition: material.modulePosition,
          lecturePosition: material.lecturePosition,
          problemPosition: material.position,
        }),
        reachableStudents: reachByCourse.get(material.courseId)?.size ?? 0,
      }));

    const effectiveness = {
      problems: problems
        .map((problem, index) => ({ problem, index }))
        .sort((left, right) =>
          compareDifficultProblems(
            { ...left.problem, position: left.index },
            { ...right.problem, position: right.index },
          ),
        )
        .slice(0, LEAD_MAX_PREVIEW_ROWS)
        .map((entry) => entry.problem),
      calibration: [...calibration]
        .sort(compareCalibration)
        .slice(0, LEAD_MAX_PREVIEW_ROWS),
      grind: [...grind].sort(compareGrind).slice(0, LEAD_MAX_PREVIEW_ROWS),
      neverAttempted: [...neverAttemptedAll]
        .sort(
          (left, right) =>
            right.reachableStudents - left.reachableStudents ||
            left.title.localeCompare(right.title) ||
            left.materialId.localeCompare(right.materialId),
        )
        .slice(0, LEAD_MAX_PREVIEW_ROWS),
      neverAttemptedTotal: neverAttemptedAll.length,
    };

    /* --------------------------------------------------------------- reach */

    const dropOffByCourse = buildDropOffs({
      materials,
      scope,
      rows: lectureProgress,
    });
    const solvedByCourse = new Map(
      solvedPairs.map((row) => [row.courseId, row.solvedPairs]),
    );
    const medianByCourse = new Map(
      medians.map((row) => [row.courseId, row.medianSeconds]),
    );
    const activeByCourse = new Map(
      activeStudents.map((row) => [row.courseId, row.activeStudents]),
    );

    const allCourses: CourseReachRow[] = courseFacts.map((course) => ({
      courseId: course.courseId,
      title: course.title,
      isVisible: course.isVisible,
      shelved: course.isVisible && course.classes === 0,
      liveExercises: course.liveExercises,
      hiddenExercises: course.hiddenExercises,
      classes: course.classes,
      studentsReached: course.studentsReached,
      activeStudents: activeByCourse.get(course.courseId) ?? 0,
      completion: courseCompletion({
        solvedPairs: solvedByCourse.get(course.courseId) ?? 0,
        studentsReached: course.studentsReached,
        liveExercises: course.liveExercises,
      }),
      medianActiveSeconds: medianByCourse.get(course.courseId) ?? null,
      dropOff: dropOffByCourse.get(course.courseId) ?? null,
      lastChangeAt: course.lastChangeAt?.toISOString() ?? null,
    }));

    const courses = [...allCourses]
      .sort(compareCourseReach)
      .slice(0, LEAD_MAX_COURSE_ROWS);

    return {
      academy,
      period,
      generatedAt: now.toISOString(),
      // The projection's first counted day, as an instant. The repository
      // answers an academy-local calendar date — `2026-07-01` is the first of
      // July in Seoul, whatever UTC thinks — so it is resolved against the
      // academy's own zone rather than handed over as a bare date string.
      activityTrackedSince: activityTrackedSince
        ? academyDayStart(activityTrackedSince, actor.timeZone).toISOString()
        : null,
      catalog,
      roster,
      blockers,
      changes,
      effectiveness,
      courses,
      coursesTruncated: allCourses.length > LEAD_MAX_COURSE_ROWS,
      unavailable,
    };
  }

  /**
   * The academy's classes, their teachers, and how many students sit in them.
   *
   * Totals and rows are read together and ordered by the shared comparator, so
   * the strip at the top of the section and the list under it can never claim
   * different numbers of unstaffed classes.
   *
   * The rows are already ordered by the query — biggest first, archived last —
   * and re-sorted here anyway. The database ordering exists so that `LIMIT`
   * takes the classes worth showing rather than an arbitrary fifty; the shared
   * comparator then applies the rule SQL cannot express without restating it,
   * which is that a class unable to teach outranks a bigger one that can.
   */
  private async readRoster(academyId: string): Promise<TeachingRoster> {
    const [rows, totals] = await Promise.all([
      this.repository.classRoster(academyId, LEAD_MAX_CLASS_ROWS),
      this.repository.rosterTotals(academyId),
    ]);

    const classes: ClassRosterRow[] = rows
      .map((row) => ({
        classId: row.classId,
        name: row.name,
        status: row.status,
        teacher: {
          membershipId: row.teacherMembershipId,
          // An assignment whose account is gone keeps the flag and loses the
          // name, which is the difference between "nobody is assigned" and
          // "somebody was, and they cannot teach".
          name: row.teacherName,
          unavailable: row.teacherUnavailable,
        },
        students: row.students,
        courses: row.courses,
        courseTitles: row.courseTitles,
        liveExercises: row.liveExercises,
      }))
      .sort(compareClassRoster);

    return {
      classes: { total: totals.activeClasses, loose: totals.unstaffedClasses },
      teachers: { total: totals.teachers, loose: totals.idleTeachers },
      students: { total: totals.students, loose: totals.unplacedStudents },
      archivedClasses: totals.archivedClasses,
      rows: classes,
      rowsTruncated: (rows[0]?.total ?? 0) > LEAD_MAX_CLASS_ROWS,
    };
  }

  /**
   * The seven scans, run together and folded into groups.
   *
   * One rejection fails the whole section rather than silently dropping a kind:
   * a blocker queue missing one of its seven checks looks exactly like a
   * curriculum that passes that check, and §13 rules out a failure that can
   * masquerade as good news.
   */
  private async scanBlockers(academyId: string) {
    const scans: [BlockerKind, Promise<BlockerQueryRow[]>][] = [
      [
        "hidden_course_assigned",
        this.repository.hiddenCourseAssigned(academyId),
      ],
      ["empty_visible_course", this.repository.emptyVisibleCourse(academyId)],
      ["ungradeable_exercise", this.repository.ungradeableExercise(academyId)],
      ["unfinished_exercise", this.repository.unfinishedExercise(academyId)],
      ["class_without_teacher", this.repository.classWithoutTeacher(academyId)],
      [
        "class_teacher_unavailable",
        this.repository.classTeacherUnavailable(academyId),
      ],
      ["class_without_course", this.repository.classWithoutCourse(academyId)],
    ];

    const settled = await Promise.all(scans.map(([, run]) => run));

    return scans.map(([kind], index) => {
      const rows = settled[index];
      return {
        kind,
        total: rows[0]?.total ?? 0,
        studentsAffected: rows[0]?.distinctStudents ?? 0,
        rows: rows.map(toBlockerRow),
      };
    });
  }
}

/* ------------------------------------------------------------------ helpers */

function split(total: number, visible: number) {
  return { total, visible, hidden: Math.max(0, total - visible) };
}

function toBlockerRow(row: BlockerQueryRow): BlockerRow {
  return {
    id: row.id,
    label: row.label,
    context: row.context,
    studentsAffected: row.studentsAffected,
    target: {
      courseId: row.courseId,
      lectureId: row.lectureId,
      materialId: row.materialId,
      classId: row.classId,
    },
  };
}

type Scope = {
  studentClasses: { classId: string; userId: string }[];
  materialClasses: { classId: string; courseId: string; materialId: string }[];
};

/** The first active class teaching a material, for a drill-down that opens. */
function firstClassFor(scope: Scope, materialId: string): string | null {
  return (
    scope.materialClasses.find((entry) => entry.materialId === materialId)
      ?.classId ?? null
  );
}

/** Distinct students who can reach each course. */
function courseReachCounts(scope: Scope): Map<string, Set<string>> {
  const classesByCourse = new Map<string, Set<string>>();
  for (const entry of scope.materialClasses) {
    const set = classesByCourse.get(entry.courseId) ?? new Set<string>();
    set.add(entry.classId);
    classesByCourse.set(entry.courseId, set);
  }
  const studentsByClass = new Map<string, Set<string>>();
  for (const entry of scope.studentClasses) {
    const set = studentsByClass.get(entry.classId) ?? new Set<string>();
    set.add(entry.userId);
    studentsByClass.set(entry.classId, set);
  }
  const reach = new Map<string, Set<string>>();
  for (const [courseId, classIds] of classesByCourse) {
    const students = new Set<string>();
    for (const classId of classIds) {
      for (const userId of studentsByClass.get(classId) ?? []) {
        students.add(userId);
      }
    }
    reach.set(courseId, students);
  }
  return reach;
}

/**
 * §10.4 — where each course starts losing the students who reached it.
 *
 * The readiness arithmetic is `lectureReadiness` from `@cove/shared`, the same
 * function the teacher's curriculum panel calls, so a lecture reported as 40%
 * ready to a teacher is 40% ready here. The difference is the roster it is
 * measured over: every active class running the course, rather than one.
 */
function buildDropOffs(input: {
  materials: MaterialFactsRow[];
  scope: Scope;
  rows: {
    lectureId: string;
    userId: string;
    solved: number;
    attempted: number;
  }[];
}) {
  const studentsByClass = new Map<string, Set<string>>();
  for (const entry of input.scope.studentClasses) {
    const set = studentsByClass.get(entry.classId) ?? new Set<string>();
    set.add(entry.userId);
    studentsByClass.set(entry.classId, set);
  }
  const classesByMaterial = new Map<string, string[]>();
  for (const entry of input.scope.materialClasses) {
    const list = classesByMaterial.get(entry.materialId) ?? [];
    list.push(entry.classId);
    classesByMaterial.set(entry.materialId, list);
  }

  type LectureEntry = {
    courseId: string;
    lectureTitle: string;
    outlineNumber: string | null;
    order: number;
    exercises: number;
    eligible: Set<string>;
  };
  const byLecture = new Map<string, LectureEntry>();
  for (const material of input.materials) {
    const entry = byLecture.get(material.lectureId) ?? {
      courseId: material.courseId,
      lectureTitle: material.lectureTitle,
      outlineNumber: teacherOutlineNumber({
        modulePosition: material.modulePosition,
        lecturePosition: material.lecturePosition,
      }),
      order: material.modulePosition * 10_000 + material.lecturePosition * 100,
      exercises: 0,
      eligible: new Set<string>(),
    };
    entry.exercises += 1;
    for (const classId of classesByMaterial.get(material.materialId) ?? []) {
      for (const userId of studentsByClass.get(classId) ?? []) {
        entry.eligible.add(userId);
      }
    }
    byLecture.set(material.lectureId, entry);
  }

  const solvedByLecture = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const list = solvedByLecture.get(row.lectureId) ?? [];
    list.push(row);
    solvedByLecture.set(row.lectureId, list);
  }

  const byCourse = new Map<
    string,
    {
      lectureId: string;
      lectureTitle: string;
      outlineNumber: string | null;
      order: number;
      readiness: number | null;
    }[]
  >();

  for (const [lectureId, entry] of byLecture) {
    const students = (solvedByLecture.get(lectureId) ?? []).filter((row) =>
      entry.eligible.has(row.userId),
    );
    const { readiness } = lectureReadiness({
      perStudentSolvedPercent: students.map((row) =>
        entry.exercises > 0
          ? Math.round((row.solved / entry.exercises) * 100)
          : 0,
      ),
      eligibleStudents: entry.eligible.size,
      attemptingStudents: students.filter((row) => row.attempted > 0).length,
    });
    const list = byCourse.get(entry.courseId) ?? [];
    list.push({
      lectureId,
      lectureTitle: entry.lectureTitle,
      outlineNumber: entry.outlineNumber,
      order: entry.order,
      readiness,
    });
    byCourse.set(entry.courseId, list);
  }

  const dropOffs = new Map<string, ReturnType<typeof findDropOff>>();
  for (const [courseId, lectures] of byCourse) {
    const ordered = [...lectures].sort(
      (left, right) => left.order - right.order,
    );
    dropOffs.set(courseId, findDropOff(ordered));
  }
  return dropOffs;
}

/**
 * A section that failed, named, without taking the page with it.
 *
 * The log carries the section and the failure and nothing else. §16 — there is
 * no student identifier in this payload to leak, and there must be none in the
 * telemetry either.
 */
/** §13 — a roster that could not be read says nothing rather than saying zero. */
const EMPTY_ROSTER: TeachingRoster = {
  classes: { total: 0, loose: 0 },
  teachers: { total: 0, loose: 0 },
  students: { total: 0, loose: 0 },
  archivedClasses: 0,
  rows: [],
  rowsTruncated: false,
};

function settler(unavailable: TeamLeadOverviewSection[], logger: Logger) {
  return async function settle<T>(
    sections: TeamLeadOverviewSection[],
    run: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await run();
    } catch (error) {
      for (const section of sections) {
        if (!unavailable.includes(section)) unavailable.push(section);
      }
      logger.warn(
        `curriculum overview aggregate ${sections.join("+")} failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
      return fallback;
    }
  };
}
