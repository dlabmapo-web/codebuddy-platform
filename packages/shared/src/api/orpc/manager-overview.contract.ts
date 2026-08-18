import { oc } from "@orpc/contract";

import {
  academyProfileSchema,
  getManagerOverviewInputSchema,
  managerOverviewSchema,
  updateAcademyProfileInputSchema,
} from "../../content/manager-overview.js";
import {
  listPeopleInputSchema,
  peoplePageSchema,
} from "../../memberships/people-directory.js";

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

export const academyPeopleContract = {
  list: oc.input(listPeopleInputSchema).output(peoplePageSchema),
};
