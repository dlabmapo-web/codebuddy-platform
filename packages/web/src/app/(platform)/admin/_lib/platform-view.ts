import type {
  AcademyManagerState,
  AcademyStatus,
  PlatformAcademySummary,
} from '@cove/shared';

/**
 * How the console reads an academy's condition, in one place.
 *
 * Status and manager state are two independent facts — an academy can be
 * running with nobody in charge, or suspended with three managers — and every
 * surface here has to answer the same question from both: is this fine, is it
 * stalled, or is it broken? Deriving that once is what stops the card and the
 * table row disagreeing about the same academy.
 */
export type AcademyCondition =
  | 'running'
  | 'awaiting_first_manager'
  | 'no_active_manager'
  | 'suspended'
  | 'archived';

export function academyCondition(academy: {
  status: AcademyStatus;
  managerState: AcademyManagerState;
}): AcademyCondition {
  if (academy.status === 'ARCHIVED') return 'archived';
  // A leaderless academy outranks a suspended one: suspension was a decision
  // somebody made, and this was not.
  if (academy.managerState === 'no_active_manager') return 'no_active_manager';
  if (academy.managerState === 'awaiting_first_manager') {
    return 'awaiting_first_manager';
  }
  if (academy.status === 'SUSPENDED') return 'suspended';
  return 'running';
}

/**
 * Colour by condition, as complete class strings.
 *
 * Written out rather than composed, for the reason the academy panels give:
 * Tailwind reads source text, so an interpolated `text-${tone}` is a class that
 * never ships.
 */
export const conditionStyles: Record<
  AcademyCondition,
  { rail: string; chip: string; dot: string; text: string }
> = {
  running: {
    rail: 'bg-success',
    chip: 'bg-success/10 text-success',
    dot: 'bg-success',
    text: 'text-success',
  },
  awaiting_first_manager: {
    rail: 'bg-warning',
    chip: 'bg-warning/10 text-warning',
    dot: 'bg-warning',
    text: 'text-warning',
  },
  no_active_manager: {
    rail: 'bg-danger',
    chip: 'bg-danger/10 text-danger',
    dot: 'bg-danger',
    text: 'text-danger',
  },
  suspended: {
    rail: 'bg-sub',
    chip: 'bg-sub/10 text-sub',
    dot: 'bg-sub',
    text: 'text-sub',
  },
  archived: {
    rail: 'bg-border',
    chip: 'bg-muted text-sub',
    dot: 'bg-border',
    text: 'text-sub',
  },
};

/** Conditions that put an academy in the roll call rather than the table. */
const rollCallConditions = new Set<AcademyCondition>([
  'no_active_manager',
  'awaiting_first_manager',
  'suspended',
]);

export function inRollCall(academy: PlatformAcademySummary): boolean {
  return rollCallConditions.has(academyCondition(academy));
}

/**
 * The stakes on a roll-call card: how many people this actually affects.
 *
 * The reason a leaderless academy is urgent rather than administrative. Ordered
 * by who is most stranded — students cannot be enrolled, teachers cannot be
 * assigned — and capped at three parts so the line stays readable.
 */
export function stakesParts(counts: PlatformAcademySummary['memberCounts']): {
  key: 'students' | 'teachers' | 'team_leads' | 'managers';
  count: number;
}[] {
  return (
    [
      { key: 'students', count: counts.students },
      { key: 'teachers', count: counts.teachers },
      { key: 'team_leads', count: counts.teamLeads },
      { key: 'managers', count: counts.managers },
    ] as const
  )
    .filter((part) => part.count > 0)
    .slice(0, 3)
    .map((part) => ({ ...part }));
}
