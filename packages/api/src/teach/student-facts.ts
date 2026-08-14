import {
  averageBestScore,
  localDaysSince,
  lowParticipationFloorSeconds,
  orderAttentionReasons,
  participationAttentionReasons,
  type OverviewAttentionReason,
  type OverviewPeriod,
} from "@cove/shared";

import { attentionByStudent } from "./teacher-attention.js";
import type {
  OverviewStudent,
  TeacherOverviewScope,
} from "./teacher-overview-access.service.js";
import type {
  StudentActivityTotals,
  StudentWorkTotals,
} from "./teacher-overview.repository.js";
import type { AttentionCandidate } from "./teacher-progress.repository.js";

/**
 * One student, as every measurement the two teacher analytics surfaces make
 * about them.
 *
 * It exists so the overview and Student analytics cannot disagree. The queue on
 * the overview names five students and the table names all of them, and if the
 * two derived "active learning time" or "average best score" from separate code
 * a teacher would eventually open both and find the same child described twice,
 * differently. That is the failure this module is here to make impossible.
 *
 * Every field is a measurement or an identity. Nothing here classifies a
 * student, and there is nowhere in the type to put a level, a band, or a score
 * that is not one of the numbers §7.4 defines.
 */
export type StudentFact = {
  student: OverviewStudent;
  /** Every selected class this student sits in, for the drill-down prompt. */
  classes: { value: string; label: string }[];
  /** The class a drill-down should open, or null when none can hold it. */
  primaryClassId: string | null;
  activeSeconds: number;
  activeDays: number;
  lastActiveAt: Date | null;
  submissions: number;
  attemptedProblems: number;
  solvedProblems: number;
  /** Null, never zero, when nothing in scope was attempted. */
  averageScore: number | null;
  lastSubmissionAt: Date | null;
  /** The later of counted activity and submitted work. */
  lastActivityAt: Date | null;
  /** Factual reasons in reading order; empty when nothing is flagged. */
  reasons: OverviewAttentionReason[];
  /** Where they were last working, in curriculum words. */
  curriculumLabel: string | null;
  materialId: string | null;
  courseId: string | null;
};

/**
 * Every scoped student, measured once.
 *
 * Students with no work at all are present rather than absent. A roster row
 * that never appears cannot be reported as inactive, and "who has not started"
 * is the question §6.3 exists to answer.
 */
export function buildStudentFacts(input: {
  scope: TeacherOverviewScope;
  activity: StudentActivityTotals[];
  activityDays: { membershipId: string; activeDays: number }[];
  work: StudentWorkTotals[];
  candidates: AttentionCandidate[];
  period: OverviewPeriod;
  now: Date;
}): StudentFact[] {
  const { scope, period, now } = input;

  const authorizedPairs = authorizedPairKeys(scope);
  const scopedCandidates = input.candidates.filter((candidate) =>
    authorizedPairs.has(`${candidate.userId}:${candidate.materialId}`),
  );
  const progressReasons = attentionByStudent(scopedCandidates, now);
  const evidence = latestEvidenceByUser(scopedCandidates, scope);

  const activityByStudent = sumActivity(input.activity, scope.courseIds);
  const daysByStudent = new Map(
    input.activityDays.map((row) => [row.membershipId, row.activeDays]),
  );
  const workByUser = new Map(input.work.map((row) => [row.userId, row]));
  const classNameById = new Map(
    scope.classes.map((entry) => [entry.classId, entry.className]),
  );
  const floorSeconds = lowParticipationFloorSeconds(period.days);

  return scope.students.map((student) => {
    const totals = workByUser.get(student.userId);
    const activity = activityByStudent.get(student.membershipId);
    const lastActiveAt = activity?.lastActiveAt ?? null;
    const lastSubmissionAt = totals?.lastSubmissionAt ?? null;
    const lastActivityAt = later(lastActiveAt, lastSubmissionAt);
    const activeSeconds = activity?.seconds ?? 0;
    const submissions = totals?.submissions ?? 0;

    const classes = student.classIds
      .filter((classId) => classNameById.has(classId))
      .map((classId) => ({ value: classId, label: classNameById.get(classId)! }));

    const perExercise = progressReasons.get(student.userId);
    const reasons = orderAttentionReasons([
      ...(perExercise ? [...perExercise.values()].flat() : []),
      ...participationAttentionReasons({
        activeSeconds,
        submissions,
        daysSinceActivity: localDaysSince({
          from: lastActivityAt,
          now,
          timeZone: scope.timeZone,
        }),
        periodDays: period.days,
        floorSeconds,
      }),
    ]);

    const where = evidence.get(student.userId) ?? null;

    return {
      student,
      classes,
      // The class that owns the evidence wins, so `View progress` opens where
      // the reason actually is. Falling back to any class the student sits in
      // is better than rendering no action at all on a flagged row.
      primaryClassId: where?.classId ?? classes[0]?.value ?? null,
      activeSeconds,
      activeDays: daysByStudent.get(student.membershipId) ?? 0,
      lastActiveAt,
      submissions,
      attemptedProblems: totals?.attemptedProblems ?? 0,
      solvedProblems: totals?.solvedProblems ?? 0,
      averageScore: averageBestScore({
        scoreSum: totals?.scoreSum ?? 0,
        attemptedProblems: totals?.attemptedProblems ?? 0,
      }),
      lastSubmissionAt,
      lastActivityAt,
      reasons,
      curriculumLabel: where?.label ?? null,
      materialId: where?.materialId ?? null,
      courseId: where?.courseId ?? null,
    };
  });
}

/**
 * The class-material pairs this teacher may read, as a lookup.
 *
 * §11 — the same pair-preservation the SQL enforces, restated for the rows the
 * progress repository returns. A candidate naming a material from a class this
 * student is not in is dropped rather than attributed to them.
 */
function authorizedPairKeys(scope: TeacherOverviewScope): Set<string> {
  const pairs = new Set<string>();
  for (const entry of scope.classes) {
    for (const student of entry.students) {
      for (const materialId of entry.materialIds) {
        pairs.add(`${student.userId}:${materialId}`);
      }
    }
  }
  return pairs;
}

/**
 * Where each flagged student was last working, in curriculum words.
 *
 * The most recent attempt rather than the worst one: §6.3 asks for the relevant
 * course or problem label, and a teacher opening the row wants the problem the
 * student is on now, not the one they gave up on first.
 */
function latestEvidenceByUser(
  candidates: AttentionCandidate[],
  scope: TeacherOverviewScope,
): Map<
  string,
  { classId: string; label: string; materialId: string; courseId: string }
> {
  const exerciseById = new Map(
    scope.exercises.map((exercise) => [exercise.materialId, exercise]),
  );
  const newest = new Map<string, { at: number; candidate: AttentionCandidate }>();
  for (const candidate of candidates) {
    const at = candidate.lastAttemptAt
      ? new Date(candidate.lastAttemptAt).getTime()
      : 0;
    const current = newest.get(candidate.userId);
    if (!current || at > current.at) newest.set(candidate.userId, { at, candidate });
  }

  const result = new Map<
    string,
    { classId: string; label: string; materialId: string; courseId: string }
  >();
  for (const [userId, { candidate }] of newest) {
    const exercise = exerciseById.get(candidate.materialId);
    if (!exercise) continue;
    const owner = scope.classes.find(
      (entry) =>
        entry.userIds.includes(userId) &&
        entry.materialIds.includes(candidate.materialId),
    );
    if (!owner) continue;
    result.set(userId, {
      classId: owner.classId,
      label: `${exercise.lectureTitle} · ${exercise.title}`,
      materialId: exercise.materialId,
      courseId: exercise.courseId,
    });
  }
  return result;
}

/**
 * Seconds and last-seen per student, over a chosen set of courses.
 *
 * §6.4 — a student in two selected classes that share a course contributes that
 * course's time once. Summing per class would bill the same afternoon twice.
 */
export function sumActivity(
  rows: StudentActivityTotals[],
  courseIds: string[],
): Map<string, { seconds: number; lastActiveAt: Date }> {
  const allowed = new Set(courseIds);
  const totals = new Map<string, { seconds: number; lastActiveAt: Date }>();
  for (const row of rows) {
    if (!allowed.has(row.courseId)) continue;
    const existing = totals.get(row.membershipId);
    if (!existing) {
      totals.set(row.membershipId, {
        seconds: row.activeSeconds,
        lastActiveAt: row.lastActiveAt,
      });
      continue;
    }
    existing.seconds += row.activeSeconds;
    if (row.lastActiveAt > existing.lastActiveAt) {
      existing.lastActiveAt = row.lastActiveAt;
    }
  }
  return totals;
}

function later(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}
