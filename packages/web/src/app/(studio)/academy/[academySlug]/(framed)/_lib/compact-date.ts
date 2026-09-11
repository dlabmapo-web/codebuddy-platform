/**
 * A date short enough to fit a fixed column.
 *
 * `2026-07-23` rather than `Jul 23, 2026`: it is a third narrower, it sorts
 * visually, and in tabular figures a column of them lines up so a manager can
 * scan for the recent ones. The long form is what pushed the people tables
 * into a horizontal scrollbar.
 */
export function compactDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(iso))
    .replace(/\s/g, '');
}
