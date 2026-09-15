/**
 * Line endings, as a shared code document holds them.
 *
 * Monaco counts offsets in its model's line ending; Yjs counts indices in the
 * string's. A document containing CRLF therefore puts two peers one character
 * apart for every line above the edit, and there is no later point at which
 * they converge again — Monaco normalizes text it is asked to insert to its own
 * model EOL, so the difference is absorbed silently rather than reported.
 *
 * The rule is stated here, once, because three layers have to agree on it: the
 * student's editor, the teacher's editor, and the server's authoritative
 * document. LF is already this platform's line ending everywhere it is decided
 * deliberately — grading normalizes to it, sample runs normalize input and
 * output, and the workbook importer collapses it on the way in. This makes that
 * uniform rather than introducing it.
 */

/** The canonical form: LF, and never a bare CR. */
export function toSharedDocumentText(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}

/** Whether a string still carries a line ending a shared document may not hold. */
export function hasForeignLineEndings(value: string): boolean {
  return value.includes("\r");
}

/**
 * One carriage return, and what has to happen to it.
 *
 * `drop` is the CR of a CRLF pair: deleting it leaves the LF that already ends
 * the line. `replace` is a lone CR, which Monaco renders as a line break — so
 * deleting it would remove a line the student can see, and it becomes an LF
 * instead.
 */
export type CarriageReturnRepair = {
  at: number;
  kind: "drop" | "replace";
};

/**
 * The edits that turn a string into its canonical form, last one first.
 *
 * Ordered from the end of the string backwards so that applying them in
 * sequence never invalidates an index that has not been used yet. Returned as
 * data rather than applied here because the only caller that matters applies
 * them to a CRDT, where editing the carriage returns out preserves the identity
 * of every character around them — unlike replacing the whole text, which would
 * give every character a new identity and duplicate the document for any peer
 * still holding the state before it.
 */
export function carriageReturnRepairs(value: string): CarriageReturnRepair[] {
  const repairs: CarriageReturnRepair[] = [];
  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (value[index] !== "\r") continue;
    repairs.push({
      at: index,
      kind: value[index + 1] === "\n" ? "drop" : "replace",
    });
  }
  return repairs;
}
