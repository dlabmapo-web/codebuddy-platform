import { oc } from "@orpc/contract";

import {
  classPointsBoardInputSchema,
  classPointsBoardSchema,
  pointsLedgerInputSchema,
  pointsLedgerPageSchema,
  pointsPageInputSchema,
  pointsPageSchema,
} from "../../points/points.js";

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
};
