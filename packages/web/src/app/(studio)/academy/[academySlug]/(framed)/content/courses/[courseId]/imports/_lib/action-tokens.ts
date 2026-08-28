import type {
  ContentImportAction,
  ContentImportSeverity,
} from '@cove/shared';

/**
 * One hue per outcome, and nowhere else to look it up.
 *
 * This page is a diff. Colour is not decoration on it — it *is* the reading:
 * the whole promise of the Review stage is that a team lead can tell what a
 * two-hundred-problem workbook would do without opening every row, and the only
 * way that works is if one hue means one thing on the summary bar, the count
 * chip, the tree rail, the row badge, and the filter pill alike.
 *
 * Five outcomes, five hues, all of them already in the theme's token layer:
 *
 * - **Create** is `success`. New content, additive, the `+` of a diff.
 * - **Update** is `brand`. Cove's own blue, for content that is already yours
 *   and is being changed rather than added.
 * - **Unchanged** is `retired` slate. Present and inert. Deliberately the
 *   quietest thing on the page, because on a healthy re-upload it is most of
 *   the page, and a wall of coloured rows would bury the four that matter.
 * - **Warning** is `warning` amber. Commits, but only once somebody says so.
 * - **Conflict** is `danger` red. Blocks.
 *
 * Nothing new is invented. Every value below resolves to a token the theme
 * already contrast-checked in both light and dark, and each of those tokens
 * already means roughly this elsewhere in the product — which is the point. A
 * sixth hue mixed for this page would be a sixth thing to learn.
 */

export type PlanTone = 'create' | 'update' | 'unchanged' | 'warning' | 'conflict';

export type ToneStyle = {
  /** The summary bar's segment. */
  bar: string;
  /** The nesting rail down the left of a tree branch. */
  rail: string;
  /** A badge or chip: tinted ground, hue-coloured label. */
  chip: string;
  /** Text alone, for a count beside its label. */
  text: string;
  /** A selected filter pill. */
  pill: string;
};

/**
 * Written out rather than interpolated.
 *
 * Tailwind scans source files for complete class names, so a template literal
 * like `bg-${tone}` produces markup whose CSS was never generated. Every class
 * a tone can wear is spelled here in full, which is also the only way to read
 * this file and know what the page can actually look like.
 */
export const toneStyles: Record<PlanTone, ToneStyle> = {
  create: {
    bar: 'bg-success',
    rail: 'border-success/70',
    chip: 'bg-success/10 text-success ring-1 ring-success/20',
    text: 'text-success',
    pill: 'border-success bg-success/10 text-success',
  },
  update: {
    bar: 'bg-brand',
    rail: 'border-brand/70',
    chip: 'bg-brand/10 text-brand ring-1 ring-brand/20',
    text: 'text-brand',
    pill: 'border-brand bg-brand/10 text-brand',
  },
  unchanged: {
    bar: 'bg-retired/35',
    rail: 'border-border',
    chip: 'bg-retired-soft text-retired ring-1 ring-retired/15',
    text: 'text-retired',
    pill: 'border-retired bg-retired-soft text-retired',
  },
  warning: {
    bar: 'bg-warning',
    rail: 'border-warning/70',
    chip: 'bg-warning/10 text-warning ring-1 ring-warning/20',
    text: 'text-warning',
    pill: 'border-warning bg-warning/10 text-warning',
  },
  conflict: {
    bar: 'bg-danger',
    rail: 'border-danger/70',
    chip: 'bg-danger/10 text-danger ring-1 ring-danger/20',
    text: 'text-danger',
    pill: 'border-danger bg-danger/10 text-danger',
  },
};

export function toneForAction(action: ContentImportAction): PlanTone {
  if (action === 'CREATE') return 'create';
  if (action === 'UPDATE') return 'update';
  return 'unchanged';
}

/**
 * An issue's tone.
 *
 * Errors and conflicts share red on purpose. §6 distinguishes them because the
 * *fix* differs — one is a typo in a cell, the other is a disagreement with the
 * course — but both stop the import completely, and giving a blocker its own
 * colour would suggest a middle state that does not exist.
 */
export function toneForSeverity(severity: ContentImportSeverity): PlanTone {
  return severity === 'WARNING' ? 'warning' : 'conflict';
}

/**
 * The tone a row wears once its own issues are taken into account.
 *
 * A blocker outranks the action, because a team lead scanning the rails is
 * looking for what stops them first and what changes second. An unchanged row
 * carrying a conflict is still a problem, and painting it slate would hide it
 * in the quietest part of the page.
 */
export function rowTone(input: {
  action: ContentImportAction;
  severities: readonly ContentImportSeverity[];
}): PlanTone {
  if (input.severities.some((severity) => severity !== 'WARNING')) {
    return 'conflict';
  }
  if (input.severities.length > 0) return 'warning';
  return toneForAction(input.action);
}
