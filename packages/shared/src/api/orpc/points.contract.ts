import { oc } from "@orpc/contract";

import {
  classPointsBoardInputSchema,
  classPointsBoardSchema,
  overviewPointsBoardInputSchema,
  overviewPointsBoardSchema,
  pointsLedgerInputSchema,
  pointsLedgerPageSchema,
  pointsPageInputSchema,
  pointsPageSchema,
} from "../../points/points.js";
import {
  pointPolicyInputSchema,
  pointPolicyStateSchema,
  pointPolicyUpdateSchema,
} from "../../points/policy.js";

/**
 * Points and the class ranking.
 *
 * Read-only by construction, and that is the feature. Every point is awarded
 * by the server inside the transaction that recorded the fact it describes —
 * a passing verdict, counted seconds, a completed lecture. **No person can
 * grant one**, so this namespace has no award mutation and cannot grow one by
 * accident.
 *
 * The reasoning is §5.2 of the student points design: a granted point is a
 * claim about a child's effort that the child cannot audit, it makes the board
 * a record of a teacher's opinion, and a budget bounds the size of that
 * distortion rather than its existence. Effort is still recognised, through
 * `TeacherFeedback`, which is written to the child rather than to the
 * scoreboard.
 *
 * Correcting a platform mistake — a misconfigured difficulty, a double-paid
 * tier — is a manager-only void, which excludes a row from every sum without
 * ever subtracting from a student. It is deliberately not exposed here yet;
 * §7.6 and §20.
 *
 * ## `policy` is not an exception to any of that
 *
 * Nobody may grant a point to a person. What an *action* pays is a setting,
 * and a setting is not a grant: it applies to every student equally, it is
 * decided before anyone has done anything, and it cannot name a child. It also
 * cannot reach backwards — `PointAward.amount` is frozen at earn time — so a
 * manager can change what the next solve pays and nothing else.
 *
 * That is the whole of the widening, and it is the reason the mutation reads
 * an academy id and never a membership id.
 */
export const pointsContract = {
  /**
   * The whole page in one round trip: the plate, the board, the rules, and the
   * first ledger page.
   */
  getPage: oc.input(pointsPageInputSchema).output(pointsPageSchema),
  /** The ledger after its first page. Cursor state, never in the URL. */
  listLedger: oc.input(pointsLedgerInputSchema).output(pointsLedgerPageSchema),
  /**
   * One class's board, for the staff who teach or run it. §5.1 — the same
   * board, from the same query, so a teacher and a student comparing screens
   * never see two different third places.
   */
  getClassBoard: oc
    .input(classPointsBoardInputSchema)
    .output(classPointsBoardSchema),
  /** Today's bounded top-five preview, shared by every role overview. */
  getOverviewBoard: oc
    .input(overviewPointsBoardInputSchema)
    .output(overviewPointsBoardSchema),
  /**
   * This academy's economy, and the one role that may change it.
   *
   * Manager-only on both sides. Every member can already read what an action
   * pays, through `rules` on `getPage`; what `get` adds is the two attendance
   * thresholds, which are operational settings rather than a promise made to a
   * student, and the editor is their only reader.
   */
  policy: {
    get: oc.input(pointPolicyInputSchema).output(pointPolicyStateSchema),
    /** A whole policy, never a patch. The refinements are between fields. */
    update: oc.input(pointPolicyUpdateSchema).output(pointPolicyStateSchema),
    /**
     * Back to the platform defaults, by deleting the row rather than writing
     * them into it. The absence of a row keeps meaning *this academy never
     * chose*, so an academy that resets follows any later change to the
     * defaults instead of being frozen at today's values.
     */
    reset: oc.input(pointPolicyInputSchema).output(pointPolicyStateSchema),
  },
};
