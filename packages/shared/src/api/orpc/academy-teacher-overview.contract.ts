import { oc } from "@orpc/contract";

import {
  academyTeacherOverviewSchema,
  getAcademyTeacherOverviewInputSchema,
} from "../../content/teacher-overview.js";
import {
  listAcademyStudentsInputSchema,
  teacherStudentListSchema,
} from "../../content/teacher-students.js";

/**
 * The teacher's two analytics reads, and nothing else.
 *
 * §10.1 splits them deliberately. The overview is one bounded claim about one
 * period — the ledger explains the queue, the queue explains the previews — and
 * separately timed regions would let those sections describe different moments
 * while sitting beside each other. The student list is the opposite shape: it
 * pages, sorts, and re-filters constantly, and folding it into the overview
 * would refetch six sections to turn one page.
 *
 * Neither namespace can name a mutation, so nothing here can grade, edit, or
 * annotate. Every overview array is capped by its schema and the list is capped
 * by its page size, so no filter combination turns either into an export of a
 * roster.
 */
export const academyTeacherOverviewContract = {
  get: oc
    .input(getAcademyTeacherOverviewInputSchema)
    .output(academyTeacherOverviewSchema),
};

export const academyTeacherStudentsContract = {
  list: oc
    .input(listAcademyStudentsInputSchema)
    .output(teacherStudentListSchema),
};
