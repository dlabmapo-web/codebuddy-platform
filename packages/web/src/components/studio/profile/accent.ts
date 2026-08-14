import type { AcademyRole } from '@cove/shared';

/**
 * My Page is coloured by who you are in the academy you are looking at.
 *
 * The page has two zones and they are deliberately different temperatures.
 * The academy zone takes the accent of the role you hold there, so a student's
 * page is blue, a teacher's is teal, a team lead's is amber, and a manager's is
 * violet — and a person who is a student in one academy and a teacher in
 * another *sees* that when they switch. The account zone below it stays
 * neutral, because global identity does not belong to any academy and must not
 * look as though it does. That contrast is the design doc's central boundary,
 * rendered.
 *
 * Values are `var()` references rather than Tailwind class names because the
 * accent is chosen at runtime, and Tailwind cannot generate a class from a
 * variable. They are set once as a custom property on the zone wrapper and
 * read by every child, so light and dark still switch on their own.
 */
export const roleAccent: Record<AcademyRole, string> = {
  STUDENT: 'var(--brand)',
  TEACHER: 'var(--teal)',
  TEAM_LEAD: 'var(--draft)',
  MANAGER: 'var(--peer)',
};

/** The tint behind the accent: the hero wash, chips, and soft fills. */
export const roleAccentSoft: Record<AcademyRole, string> = {
  STUDENT: 'var(--brand-soft)',
  TEACHER: 'var(--teal-soft)',
  TEAM_LEAD: 'var(--draft-soft)',
  MANAGER: 'var(--peer-soft)',
};

/**
 * The label colour on a filled swatch of the accent. Separate values because
 * dark mode lightens every accent rather than darkening it, so a white label
 * that reads at 8:1 in light drops to 3:1 in dark.
 */
export const roleAccentInk: Record<AcademyRole, string> = {
  STUDENT: 'var(--on-brand)',
  TEACHER: 'var(--on-teal)',
  TEAM_LEAD: 'var(--on-warning)',
  MANAGER: 'var(--on-peer)',
};

/** The three custom properties every accented subtree carries. */
export function accentStyle(role: AcademyRole): React.CSSProperties {
  return {
    '--accent-hue': roleAccent[role],
    '--accent-tint': roleAccentSoft[role],
    '--accent-ink': roleAccentInk[role],
  } as React.CSSProperties;
}

/**
 * The chip palette for controlled vocabularies — coding interests, teaching
 * specialties, languages.
 *
 * A fixed cycle rather than a hash: the same interest keeps the same colour on
 * every profile and in every locale, so "the violet one" is a thing a person
 * can learn. The colour carries no meaning of its own, which is why the label
 * is always spelled out beside it.
 */
const chipTones = [
  'var(--brand)',
  'var(--peer)',
  'var(--teal)',
  'var(--primary)',
  'var(--draft)',
  'var(--success)',
] as const;

export function chipTone(index: number): React.CSSProperties {
  return { '--chip-hue': chipTones[index % chipTones.length] } as
    React.CSSProperties;
}
