import { routes } from '@/lib/routes';

const INTENT_KEY = 'cove:exercise-navigation-intent';
const INTENT_MAX_AGE_MS = 30_000;

export const EXERCISE_HISTORY_STATE_KEY = '__coveExerciseWorkspace';

type StorageLike = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

type ExerciseNavigationIntent = {
  destination: string;
  source: string;
  createdAt: number;
};

export type ExerciseHistoryEntry = {
  sessionId: string;
  index: number;
  classId: string;
  trustedOrigin: boolean;
};

function relativeUrl(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

/** Record one same-tab navigation immediately before Next changes the route. */
export function rememberExerciseNavigation(
  storage: StorageLike,
  input: {
    destination: string;
    source: string;
    origin: string;
    now?: number;
  },
): void {
  const destination = relativeUrl(input.destination, input.origin);
  const source = relativeUrl(input.source, input.origin);
  if (!destination || !source) return;

  const intent: ExerciseNavigationIntent = {
    destination,
    source,
    createdAt: input.now ?? Date.now(),
  };
  try {
    storage.setItem(INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Storage can be unavailable in hardened/private browsing. The link must
    // still navigate; the workspace will simply use its validated fallback.
  }
}

/**
 * Claim a navigation intent once. A copied URL, refresh, or second tab cannot
 * reuse it to make an unsafe assumption about the preceding history entry.
 */
export function claimExerciseNavigation(
  storage: StorageLike,
  input: {
    current: string;
    origin: string;
    now?: number;
  },
): ExerciseNavigationIntent | null {
  let stored: string | null;
  try {
    stored = storage.getItem(INTENT_KEY);
    storage.removeItem(INTENT_KEY);
  } catch {
    return null;
  }
  if (!stored) return null;

  try {
    const intent = JSON.parse(stored) as Partial<ExerciseNavigationIntent>;
    const now = input.now ?? Date.now();
    const current = relativeUrl(input.current, input.origin);
    const destination =
      typeof intent.destination === 'string'
        ? relativeUrl(intent.destination, input.origin)
        : null;
    const source =
      typeof intent.source === 'string'
        ? relativeUrl(intent.source, input.origin)
        : null;
    if (
      !current ||
      !destination ||
      !source ||
      typeof intent.createdAt !== 'number' ||
      now < intent.createdAt ||
      now - intent.createdAt > INTENT_MAX_AGE_MS ||
      destination !== current
    ) {
      return null;
    }
    return { destination, source, createdAt: intent.createdAt };
  } catch {
    return null;
  }
}

export function readExerciseHistoryEntry(
  state: unknown,
): ExerciseHistoryEntry | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[EXERCISE_HISTORY_STATE_KEY];
  if (!value || typeof value !== 'object') return null;
  const entry = value as Partial<ExerciseHistoryEntry>;
  if (
    typeof entry.sessionId !== 'string' ||
    entry.sessionId.length === 0 ||
    !Number.isInteger(entry.index) ||
    (entry.index ?? -1) < 0 ||
    typeof entry.classId !== 'string' ||
    entry.classId.length === 0 ||
    typeof entry.trustedOrigin !== 'boolean'
  ) {
    return null;
  }
  return entry as ExerciseHistoryEntry;
}

/** Preserve Next's private state while adding Cove's namespaced metadata. */
export function withExerciseHistoryEntry(
  state: unknown,
  entry: ExerciseHistoryEntry,
): Record<string, unknown> {
  const base = state && typeof state === 'object' ? state : {};
  return { ...base, [EXERCISE_HISTORY_STATE_KEY]: entry };
}

/** Return a material id only for this academy's exact canonical route. */
export function materialIdFromExercisePath(
  pathname: string,
  academySlug: string,
): string | null {
  const prefix = routes.academyLearnExercise(academySlug, '');
  if (!pathname.startsWith(prefix)) return null;
  const encoded = pathname.slice(prefix.length);
  if (!encoded || encoded.includes('/')) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function exerciseExitDelta(entry: ExerciseHistoryEntry): number | null {
  return entry.trustedOrigin ? -(entry.index + 1) : null;
}
