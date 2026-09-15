/**
 * Decides, per student, whether the account still has to be made.
 *
 * Separate from the CLI and free of IO so the rules below can be read and
 * tested without a database. The staff bootstrap next door is all-or-nothing
 * because its two accounts are one act; five students are five independent
 * ones, so this plans each separately and a rerun creates only what is
 * missing.
 */
export interface DesiredStudent {
  username: string;
  displayName: string;
}

/** What the database already holds under a desired username, if anything. */
export interface ExistingStudent {
  coveUserId: string | null;
  coveAuthUserId: string | null;
  coveUsername: string | null;
  coveStatus: string | null;
  coveEmailIsPlaceholder: boolean | null;
  authUserId: string | null;
  joinRequestAcademyId: string | null;
}

export type StudentPlanEntry =
  | { username: string; action: "create" }
  | { username: string; action: "skip"; reason: string }
  | { username: string; action: "conflict"; reasons: string[] };

export interface StudentPlan {
  entries: StudentPlanEntry[];
  toCreate: DesiredStudent[];
  hasConflict: boolean;
}

/**
 * A name already held by somebody is never taken over.
 *
 * The dangerous case is not a rerun, it is `student3` belonging to a real
 * child who chose it first. Rewriting that row would handed their work to
 * somebody else, so anything that is not recognisably this script's own
 * previous output is refused and reported rather than adjusted.
 */
export function planStudents(
  desired: readonly DesiredStudent[],
  existingByUsername: ReadonlyMap<string, ExistingStudent>,
  academyId: string,
): StudentPlan {
  const entries: StudentPlanEntry[] = [];

  for (const student of desired) {
    const current = existingByUsername.get(student.username);
    if (!current) {
      entries.push({ username: student.username, action: "create" });
      continue;
    }

    const reasons: string[] = [];
    if (!current.coveUserId) {
      // An Auth identity with no Cove row: the orphan state signUpStudent
      // exists to prevent. Reported rather than repaired, because the repair
      // depends on why it happened.
      reasons.push("a Supabase identity exists with no Cove user row");
    }
    if (current.coveEmailIsPlaceholder === false) {
      reasons.push("the account holds a real email address, so it is not a student account");
    }
    if (current.coveAuthUserId && current.authUserId && current.coveAuthUserId !== current.authUserId) {
      reasons.push("the Cove row and the Supabase identity disagree");
    }
    if (current.joinRequestAcademyId && current.joinRequestAcademyId !== academyId) {
      reasons.push("the account belongs to a different academy");
    }

    if (reasons.length) {
      entries.push({ username: student.username, action: "conflict", reasons });
      continue;
    }

    entries.push({
      username: student.username,
      action: "skip",
      reason: current.joinRequestAcademyId === academyId
        ? "already created and awaiting approval, or already approved"
        : "the account already exists",
    });
  }

  return {
    entries,
    toCreate: desired.filter((student) =>
      entries.some((entry) => entry.username === student.username && entry.action === "create"),
    ),
    hasConflict: entries.some((entry) => entry.action === "conflict"),
  };
}
