/**
 * How long somebody has been waiting, as a unit and a number.
 *
 * An age rather than a date, because the queue's question is "how long has this
 * person been ignored" and a date has to be subtracted from today before it
 * answers. The exact timestamp stays on the cell's title attribute for anybody
 * who needs it.
 *
 * Returns the parts rather than a formatted string so the caller pluralises
 * through i18next — Korean and English disagree about that, and a string built
 * here would have to pick one.
 *
 * `days` is returned alongside so a caller can decide something *about* the
 * age without re-deriving it: three days unanswered in an academy with nobody
 * to answer is the condition this page exists to surface.
 */
export type WaitedFor = {
  unit: 'just_now' | 'minutes' | 'hours' | 'days';
  value: number;
  days: number;
};

export function waitedFor(iso: string, now: Date = new Date()): WaitedFor {
  const elapsed = Math.max(0, now.getTime() - new Date(iso).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return { unit: 'days', value: days, days };
  if (hours >= 1) return { unit: 'hours', value: hours, days };
  // Under a minute reads as a number that will be wrong by the time it is read.
  if (minutes >= 1) return { unit: 'minutes', value: minutes, days };
  return { unit: 'just_now', value: 0, days };
}
