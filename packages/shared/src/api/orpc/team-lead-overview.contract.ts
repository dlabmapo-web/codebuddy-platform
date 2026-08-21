import { oc } from "@orpc/contract";

import {
  getTeamLeadOverviewInputSchema,
  teamLeadOverviewSchema,
} from "../../content/team-lead-overview.js";

/**
 * The Team Lead's curriculum overview.
 *
 * One procedure, and deliberately only one. Everything a Team Lead can do from
 * this page — editing a course, showing a hidden lecture, assigning a teacher,
 * arranging a class — already has an endpoint with its own authorization, and
 * giving the overview a write of its own would be a second way to do the same
 * thing through a guard nobody would think to check.
 *
 * The read is one bounded snapshot rather than a composition of the course,
 * class, and analytics interfaces at call time. §8 — five independently clocked
 * reads would let the catalog, the blockers, and the effectiveness panel
 * describe three different moments while sitting on one screen.
 */
export const academyCurriculumOverviewContract = {
  get: oc.input(getTeamLeadOverviewInputSchema).output(teamLeadOverviewSchema),
};
