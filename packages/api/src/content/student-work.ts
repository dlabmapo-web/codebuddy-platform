import { Prisma } from "../generated/prisma/client.js";

/**
 * Student work that goes with the content it was done in.
 *
 * Managers and Team Leads may delete a problem, lecture, module or course
 * whether or not students have submitted (QA-004, 2026-11-20). The schema
 * refuses that by itself in four places — `ProgrammingSubmissionReview` and
 * `ManualReview` hold their submissions, `ManualSubmission` holds its material,
 * and `Submission` holds its course — so the student work is removed first, in
 * the same transaction as the content. Everything else that points at a
 * material already cascades or is set to null.
 *
 * Each step is one statement over the whole scope, never one per row.
 */
export type StudentWorkScope =
  | { materialId: string }
  | { lectureId: string }
  | { moduleId: string }
  | { courseId: string };

export type StudentWorkCounts = {
  submissions: number;
  manualSubmissions: number;
  students: number;
};

function materialWhere(scope: StudentWorkScope): Prisma.MaterialWhereInput {
  if ("materialId" in scope) return { id: scope.materialId };
  if ("lectureId" in scope) return { lectureId: scope.lectureId };
  if ("moduleId" in scope) return { lecture: { courseModuleId: scope.moduleId } };
  return { lecture: { courseModule: { courseId: scope.courseId } } };
}

function submissionWhere(scope: StudentWorkScope): Prisma.SubmissionWhereInput {
  // A course's submissions include any whose problem was already deleted
  // before this rule existed (`materialId` set to null): they still hold the
  // course and would block it.
  return "courseId" in scope
    ? { courseId: scope.courseId }
    : { material: materialWhere(scope) };
}

/** Deletes the scope's submissions and manual submissions with their reviews. */
export async function deleteStudentWork(
  tx: Prisma.TransactionClient,
  scope: StudentWorkScope,
): Promise<Omit<StudentWorkCounts, "students">> {
  const submission = submissionWhere(scope);
  const manual: Prisma.ManualSubmissionWhereInput = {
    material: materialWhere(scope),
  };
  await tx.programmingSubmissionReview.deleteMany({ where: { submission } });
  const submissions = await tx.submission.deleteMany({ where: submission });
  await tx.manualReview.deleteMany({ where: { submission: manual } });
  const manualSubmissions = await tx.manualSubmission.deleteMany({
    where: manual,
  });
  return {
    submissions: submissions.count,
    manualSubmissions: manualSubmissions.count,
  };
}

/**
 * What a delete would take with it, for the confirm dialog. One statement:
 * both kinds of submission and the number of distinct students. Materials are
 * always resolved inside `courseId`, so an id from another course or academy
 * counts nothing.
 */
export async function countStudentWork(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  scope: StudentWorkScope,
  courseId: string,
): Promise<StudentWorkCounts> {
  const narrow =
    "materialId" in scope
      ? Prisma.sql`AND m.id = ${scope.materialId}::uuid`
      : "lectureId" in scope
        ? Prisma.sql`AND l.id = ${scope.lectureId}::uuid`
        : "moduleId" in scope
          ? Prisma.sql`AND cm.id = ${scope.moduleId}::uuid`
          : Prisma.empty;
  const automatic =
    "courseId" in scope
      ? Prisma.sql`SELECT user_id FROM submissions WHERE course_id = ${courseId}::uuid`
      : Prisma.sql`SELECT user_id FROM submissions WHERE material_id IN (SELECT id FROM scope)`;
  const rows = await db.$queryRaw<
    Array<{ submissions: number; manual_submissions: number; students: number }>
  >`
    WITH scope AS (
      SELECT m.id FROM materials m
      JOIN lectures l ON l.id = m.lecture_id
      JOIN course_modules cm ON cm.id = l.course_module_id
      WHERE cm.course_id = ${courseId}::uuid ${narrow}
    ),
    automatic AS (${automatic}),
    manual AS (SELECT user_id FROM manual_submissions WHERE material_id IN (SELECT id FROM scope))
    SELECT (SELECT count(*) FROM automatic)::int AS submissions,
           (SELECT count(*) FROM manual)::int AS manual_submissions,
           (SELECT count(DISTINCT user_id) FROM (SELECT user_id FROM automatic UNION ALL SELECT user_id FROM manual) u)::int AS students`;
  const row = rows[0];
  return {
    submissions: row?.submissions ?? 0,
    manualSubmissions: row?.manual_submissions ?? 0,
    students: row?.students ?? 0,
  };
}
