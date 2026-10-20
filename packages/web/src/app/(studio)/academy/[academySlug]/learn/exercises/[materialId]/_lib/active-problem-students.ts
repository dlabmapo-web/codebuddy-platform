import type { PresenceEntry, TeacherRosterStudent } from '@cove/shared';

/** Durable, authorized enrollment decides identity; synchronized presence decides activity. */
export function activeProblemStudents(
  students: readonly TeacherRosterStudent[],
  presence: readonly PresenceEntry[],
  courseId: string,
  materialId: string,
): TeacherRosterStudent[] {
  const solving = new Set(presence.filter((entry) =>
    entry.state === 'SOLVING' && entry.materialId === materialId && entry.courseId === courseId,
  ).map((entry) => entry.studentMembershipId));
  return students.filter((student) => solving.has(student.membershipId));
}
