import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  listOperationRunsInputSchema,
  listStaleProblemsInputSchema,
  operationRunListSchema,
  operationRunSchema,
  planRegradeInputSchema,
  readOperationRunInputSchema,
  regradePlanSchema,
  staleProblemBoardSchema,
  startRegradeInputSchema,
} from "../../platform/operations.js";

/**
 * Maintenance work an operator dispatches onto the judge's queue.
 *
 * The first console contract that *writes* through the platform axis rather
 * than sending the operator into an academy to use its own page. That is
 * deliberate and follows the same test the console applies everywhere: whose
 * job is this. Editing a course or seating a member is the academy staff's, and
 * an operator walks in to do it. Re-grading a cohort after a corrected test
 * case is nobody's job inside the academy — there is no page for it, and there
 * should not be — so it is the operator's, and it lives here.
 *
 * ## Why planning and starting are two calls
 *
 * `planRegrade` counts and returns; `startRegrade` dispatches. The operator
 * sees the real numbers, from the same predicate the operation will use, before
 * anything irreversible happens. One call that dispatched and reported would
 * make the count a receipt rather than a decision.
 *
 * The run created by `planRegrade` is real and takes the in-flight slot for its
 * target immediately, so two operators cannot both be shown a plan for the same
 * problem and both confirm it.
 */
export const platformOperationsContract = {
  /**
   * Problems whose grading moved on without their submissions.
   *
   * The page's default view, and the reason an operator can find a broken
   * problem before a teacher reports one.
   */
  staleProblems: oc
    .input(listStaleProblemsInputSchema)
    .output(staleProblemBoardSchema),

  /** Counts what a re-grade would touch, and claims the target. */
  planRegrade: oc.input(planRegradeInputSchema).output(regradePlanSchema),

  /** Dispatches the plan. Irreversible, which is why §5.11 asks twice. */
  startRegrade: oc.input(startRegradeInputSchema).output(operationRunSchema),

  /**
   * Gives back a plan the reader decided against.
   *
   * A plan claims its problem the moment it is counted, so that two people
   * cannot both confirm one. Without a way to hand it back, changing your mind
   * would leave the problem showing as running for ten minutes until the
   * abandonment sweep noticed.
   */
  cancelPlan: oc
    .input(startRegradeInputSchema)
    .output(z.object({ cancelled: z.boolean() }).strict()),

  /** One run, for the page to poll while it is running. */
  run: oc.input(readOperationRunInputSchema).output(operationRunSchema),

  /** Recent runs, newest first. The answer to "did that work" an hour later. */
  runs: oc.input(listOperationRunsInputSchema).output(operationRunListSchema),
};
