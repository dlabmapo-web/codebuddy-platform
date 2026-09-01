import type { Prisma } from "../generated/prisma/client.js";

/**
 * Everything one academy owns, deleted in dependency order.
 *
 * The schema deliberately does not cascade here. `Course.academy`,
 * `Class.academy` and `TeacherMonitoringVisit.academy` are all `Restrict`, and
 * the note on the monitoring model says why: "their lifecycle is archive, not
 * delete". Deleting an academy is therefore not one statement — it is this
 * list, and the list is the honest cost of the operation.
 *
 * Written out rather than left to the database precisely because it is
 * destructive. A cascade added to the schema would make every academy deletion
 * implicit and silent, including ones nobody meant; an explicit ordered purge
 * can only ever run where somebody called it.
 *
 * Ordered deepest-first. Several of these would cascade from their parent
 * anyway, and they are still named: a relation whose `onDelete` changes later
 * must not silently change what a purge leaves behind.
 *
 * `AuditLog.academyId` is `SetNull`, so the trail of what was done to this
 * academy — including the deletion itself — survives the academy. That is the
 * one thing here that is deliberately not destroyed.
 */
export async function purgeAcademy(
  tx: Prisma.TransactionClient,
  academyId: string,
): Promise<void> {
  const viaCourse = { course: { academyId } } as const;
  const viaMaterial = {
    material: { lecture: { courseModule: { course: { academyId } } } },
  } as const;
  const viaClass = { class: { academyId } } as const;

  /* ---------------------------------------------------- student work */
  await tx.submissionCase.deleteMany({ where: { submission: viaCourse } });
  await tx.submissionGradingCase.deleteMany({
    where: { submission: viaCourse },
  });
  await tx.submission.deleteMany({ where: viaCourse });
  await tx.exerciseSolveSession.deleteMany({ where: viaMaterial });
  await tx.studentExerciseProgress.deleteMany({ where: viaMaterial });
  // Hangs off the draft, not the material — cascades from the line below, and
  // is named anyway so a change to that relation cannot quietly orphan it.
  await tx.exerciseCollaborationDocument.deleteMany({
    where: { draft: viaCourse },
  });
  await tx.exerciseDraft.deleteMany({ where: viaCourse });

  /* ------------------------------------------------ teaching records */
  await tx.teacherFeedback.deleteMany({ where: { academyId } });
  await tx.teacherMonitoringVisit.deleteMany({ where: { academyId } });
  await tx.studentClassCourseLearningDay.deleteMany({ where: { academyId } });
  await tx.studentCourseLearningDay.deleteMany({ where: { academyId } });

  /* ----------------------------------------------------- the economy */
  await tx.pointAward.deleteMany({ where: { academyId } });
  await tx.studentPointBalance.deleteMany({
    where: { membership: { academyId } },
  });
  await tx.academyPointPolicy.deleteMany({ where: { academyId } });

  /* ------------------------------------------------------- delivery */
  await tx.classScheduleSlot.deleteMany({ where: viaClass });
  await tx.classEnrollment.deleteMany({ where: viaClass });
  await tx.classCourse.deleteMany({ where: viaClass });
  await tx.class.deleteMany({ where: { academyId } });

  /* ----------------------------------------------------- curriculum */
  await tx.exerciseHint.deleteMany({
    where: { exercise: { material: viaMaterial.material } },
  });
  await tx.exerciseTestCase.deleteMany({
    where: { exercise: { material: viaMaterial.material } },
  });
  await tx.programmingExercise.deleteMany({ where: viaMaterial });
  await tx.material.deleteMany({
    where: { lecture: { courseModule: { course: { academyId } } } },
  });
  await tx.lecture.deleteMany({
    where: { courseModule: { course: { academyId } } },
  });
  await tx.courseModule.deleteMany({ where: { course: { academyId } } });
  await tx.contentImportSession.deleteMany({ where: { academyId } });
  await tx.course.deleteMany({ where: { academyId } });

  /* --------------------------------------------------------- people */
  await tx.peopleBulkOperation.deleteMany({ where: { academyId } });
  await tx.peopleImportSession.deleteMany({ where: { academyId } });
  await tx.academyJoinRequest.deleteMany({ where: { academyId } });
  await tx.academyInvitation.deleteMany({ where: { academyId } });
  await tx.academyMembership.deleteMany({ where: { academyId } });
  await tx.oAuthOnboardingIntent.deleteMany({ where: { academyId } });

  /* ------------------------------------------------------- identity */
  await tx.academyMedia.deleteMany({ where: { academyId } });
  await tx.academyFeatureFlag.deleteMany({ where: { academyId } });
  await tx.academySlugHistory.deleteMany({ where: { academyId } });
  await tx.platformSupportGrant.deleteMany({ where: { academyId } });

  await tx.academy.delete({ where: { id: academyId } });
}
