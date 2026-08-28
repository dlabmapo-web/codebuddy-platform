/**
 * The meeting time a class writes at the head of its description.
 *
 * A class has no schedule column. Academies record it by convention, as a
 * prefix — `토 10:00 — 기초 과정을 마친 학생을 위한 심화 반입니다.` — and until
 * this it was rendered as the first few words of a grey paragraph, which is
 * where the single most identifying fact about a class went to hide. A student
 * knows their classes as "the Saturday one" and "the Monday-Wednesday-Friday
 * one" long before they know what the descriptions say.
 *
 * So it is lifted out and shown as what it is. Reading it back out of prose is
 * a compromise, and a deliberate one: the alternative is a schema field, a
 * migration, and an editor for it, and none of that helps the student looking
 * at the page today. The parse is written to fail closed — anything it is not
 * confident about stays in the description, exactly where it is now.
 *
 * Confidence means all three: a separator, a short left side, and a clock time
 * in it. A description that merely contains a dash keeps its text.
 */
const SEPARATORS = [' — ', ' – ', ' - '];

/** Long enough for `월·수·금 17:00`, short enough to reject a sentence. */
const MAX_SCHEDULE_LENGTH = 32;

const CLOCK = /\d{1,2}:\d{2}/;

export type ClassSchedule = {
  /** The meeting time, or null when the description does not open with one. */
  schedule: string | null;
  /** What is left to read as prose — the whole description when nothing split. */
  description: string;
};

export function splitSchedule(description: string): ClassSchedule {
  const text = description.trim();

  for (const separator of SEPARATORS) {
    const at = text.indexOf(separator);
    if (at <= 0) continue;

    const head = text.slice(0, at).trim();
    const tail = text.slice(at + separator.length).trim();
    // A tail is required: `토 10:00 —` with nothing after it is a description
    // that happens to end in a dash, and swallowing it would blank the card.
    if (!tail) continue;
    if (head.length > MAX_SCHEDULE_LENGTH) continue;
    if (!CLOCK.test(head)) continue;

    return { schedule: head, description: tail };
  }

  return { schedule: null, description: text };
}
