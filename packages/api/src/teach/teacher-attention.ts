import {
  attentionReasonsFor,
  type TeacherAttentionReason,
  type TeacherProgressStatus,
} from "@cove/shared";

import type {
  AttentionCandidate,
  ExerciseProgressRecord,
} from "./teacher-progress.repository.js";

/**
 * Turning attention candidates into reasons, in one place.
 *
 * Solution status and the academy overview both answer "who needs a look at
 * this class", and a teacher who saw a student flagged on one page and not the
 * other would rightly stop trusting both. The shared rule in `@cove/shared`
 * decides what the numbers mean; this decides how a database row is handed to
 * it, which is the half that would otherwise be copied.
 *
 * See §6.1 of the teacher academy overview design and §7.4 of the solution
 * status design.
 */

export function pairKey(userId: string, materialId: string): string {
  return `${userId}:${materialId}`;
}

/**
 * A progress row as the page states it.
 *
 * A projection written against an older grading revision reads as not started,
 * matching what the learning workspace already shows the student. A teacher
 * and a student looking at the same problem must not disagree about whether it
 * is done.
 */
export function statusOf(
  record:
    | Pick<ExerciseProgressRecord, "status" | "revisionMatches">
    | undefined,
): TeacherProgressStatus {
  if (!record || !record.revisionMatches) return "not_started";
  if (record.status === "SOLVED") return "solved";
  if (record.status === "IN_PROGRESS") return "in_progress";
  return "not_started";
}

/** Reasons per student/exercise pair, keyed by `pairKey`. */
export function attentionByPair(
  candidates: AttentionCandidate[],
  now: Date,
): Map<string, TeacherAttentionReason[]> {
  const reasons = new Map<string, TeacherAttentionReason[]>();
  for (const candidate of candidates) {
    const list = attentionReasonsFor({
      status: statusOf({
        status: candidate.progressStatus ?? "NOT_STARTED",
        revisionMatches: candidate.revisionMatches,
      }),
      // The rule reads a newest-first list of verdicts; the streak the query
      // measured is exactly that list's leading failures.
      latestAccepted: candidate.latestAccepted
        ? [true]
        : Array.from(
            { length: Math.max(1, candidate.consecutiveFailures) },
            () => false,
          ),
      lastAttemptAt: candidate.lastAttemptAt,
      latestFailedSolveSec: candidate.latestAccepted
        ? null
        : candidate.latestSolveSec,
      now,
    });
    if (list.length > 0) {
      reasons.set(pairKey(candidate.userId, candidate.materialId), list);
    }
  }
  return reasons;
}

/** The same reasons, regrouped per student and keyed by exercise. */
export function attentionByStudent(
  candidates: AttentionCandidate[],
  now: Date,
): Map<string, Map<string, TeacherAttentionReason[]>> {
  const pairs = attentionByPair(candidates, now);
  const byStudent = new Map<string, Map<string, TeacherAttentionReason[]>>();
  for (const candidate of candidates) {
    const list = pairs.get(pairKey(candidate.userId, candidate.materialId));
    if (!list?.length) continue;
    const existing = byStudent.get(candidate.userId) ?? new Map();
    existing.set(candidate.materialId, list);
    byStudent.set(candidate.userId, existing);
  }
  return byStudent;
}
