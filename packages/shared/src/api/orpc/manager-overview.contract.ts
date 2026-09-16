import { oc } from "@orpc/contract";

import {
  academyProfileSchema,
  getManagerOverviewInputSchema,
  managerOverviewSchema,
  updateAcademyProfileInputSchema,
} from "../../content/manager-overview.js";
import {
  memberDetailInputSchema,
  staffDetailSchema,
  studentDetailSchema,
} from "../../memberships/member-detail.js";
import {
  listPeopleInputSchema,
  peoplePageSchema,
} from "../../memberships/people-directory.js";
import {
  listStaffRosterInputSchema,
  staffRosterPageSchema,
} from "../../memberships/staff-roster.js";
import {
  listStudentRosterInputSchema,
  studentRosterPageSchema,
} from "../../memberships/student-roster.js";

/**
 * The manager's control tower, and the directory beneath it.
 *
 * Three procedures, split the way §7 splits the modules behind them.
 *
 * The overview is one bounded read of one instant. It is not composed from the
 * member, class, and analytics interfaces at call time — §7.1 — because six
 * independently clocked reads would let the ledger, the action queue, and the
 * growth chart describe three different moments while sitting on one screen.
 *
 * The directory is the opposite shape. It pages, sorts, and re-filters
 * constantly, and folding it into the overview would recompute every academy
 * aggregate to turn one page of a table.
 *
 * The profile mutation is the only write here. Everything else a manager can
 * do from this page — approving an application, revoking an invitation,
 * assigning a teacher — already has an endpoint, and giving the overview its
 * own would be a second way to do the same thing with its own authorization.
 */
export const academyOperationsOverviewContract = {
  get: oc.input(getManagerOverviewInputSchema).output(managerOverviewSchema),
};

export const academyOperationsProfileContract = {
  update: oc
    .input(updateAcademyProfileInputSchema)
    .output(academyProfileSchema),
};

/**
 * The directory, and the two rosters cut from the same membership table.
 *
 * `students` and `staff` are their own procedures rather than filters on
 * `list` because their rows differ — a student carries a guardian and classes,
 * a staff member a title and the classes they teach — and one row shape for
 * all three would be half empty on every page.
 */
export const academyPeopleContract = {
  list: oc.input(listPeopleInputSchema).output(peoplePageSchema),
  students: oc
    .input(listStudentRosterInputSchema)
    .output(studentRosterPageSchema),
  staff: oc.input(listStaffRosterInputSchema).output(staffRosterPageSchema),
  /**
   * One member, for whoever may look them up.
   *
   * Beside the rosters rather than under a module of their own: the reader,
   * the refusal, and the withholding rule are the same ones the lists use, and
   * a separate contract would be a second place to keep them in step.
   */
  student: oc.input(memberDetailInputSchema).output(studentDetailSchema),
  staffMember: oc.input(memberDetailInputSchema).output(staffDetailSchema),
};
