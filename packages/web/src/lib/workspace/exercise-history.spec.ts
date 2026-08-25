import { describe, expect, it } from 'vitest';

import {
  claimExerciseNavigation,
  exerciseExitDelta,
  materialIdFromExercisePath,
  readExerciseHistoryEntry,
  rememberExerciseNavigation,
  withExerciseHistoryEntry,
  type ExerciseHistoryEntry,
} from './exercise-history';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const origin = 'https://cs.coveedu.com';
const course = '/academy/cove-seoul/learn/courses/course-1?classId=class-1';
const exercise = '/academy/cove-seoul/learn/exercises/material-1?classId=class-1';

describe('exercise navigation intent', () => {
  it('claims an exact recent same-origin navigation once', () => {
    const storage = new MemoryStorage();
    rememberExerciseNavigation(storage, {
      destination: exercise,
      source: course,
      origin,
      now: 1_000,
    });

    expect(
      claimExerciseNavigation(storage, {
        current: exercise,
        origin,
        now: 2_000,
      }),
    ).toEqual({ destination: exercise, source: course, createdAt: 1_000 });
    expect(
      claimExerciseNavigation(storage, {
        current: exercise,
        origin,
        now: 2_000,
      }),
    ).toBeNull();
  });

  it('rejects stale, mismatched, malformed, and cross-origin intents', () => {
    const stale = new MemoryStorage();
    rememberExerciseNavigation(stale, {
      destination: exercise,
      source: course,
      origin,
      now: 1_000,
    });
    expect(
      claimExerciseNavigation(stale, {
        current: exercise,
        origin,
        now: 31_001,
      }),
    ).toBeNull();

    const mismatched = new MemoryStorage();
    rememberExerciseNavigation(mismatched, {
      destination: exercise,
      source: course,
      origin,
      now: 1_000,
    });
    expect(
      claimExerciseNavigation(mismatched, {
        current: '/academy/cove-seoul/learn/exercises/material-2',
        origin,
        now: 2_000,
      }),
    ).toBeNull();

    const crossOrigin = new MemoryStorage();
    rememberExerciseNavigation(crossOrigin, {
      destination: 'https://example.com/problem',
      source: course,
      origin,
    });
    expect(
      claimExerciseNavigation(crossOrigin, {
        current: exercise,
        origin,
      }),
    ).toBeNull();

    const malformed = new MemoryStorage();
    malformed.setItem('cove:exercise-navigation-intent', '{bad json');
    expect(
      claimExerciseNavigation(malformed, {
        current: exercise,
        origin,
      }),
    ).toBeNull();
  });

  it('degrades safely when session storage is unavailable', () => {
    const unavailable = {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() =>
      rememberExerciseNavigation(unavailable, {
        destination: exercise,
        source: course,
        origin,
      }),
    ).not.toThrow();
    expect(
      claimExerciseNavigation(unavailable, { current: exercise, origin }),
    ).toBeNull();
  });
});

describe('exercise workspace history', () => {
  const entry: ExerciseHistoryEntry = {
    sessionId: 'session-1',
    index: 2,
    classId: 'class-1',
    trustedOrigin: true,
  };

  it('preserves Next state and reads valid Cove state', () => {
    const state = withExerciseHistoryEntry({ __NA: true }, entry);
    expect(state.__NA).toBe(true);
    expect(readExerciseHistoryEntry(state)).toEqual(entry);
    expect(readExerciseHistoryEntry({ ...state, __coveExerciseWorkspace: { index: -1 } })).toBeNull();
  });

  it('recognizes only the exact academy exercise path', () => {
    expect(
      materialIdFromExercisePath(
        '/academy/cove-seoul/learn/exercises/material%2F1',
        'cove-seoul',
      ),
    ).toBe('material/1');
    expect(
      materialIdFromExercisePath(
        '/academy/cove-seoul/learn/courses/course-1',
        'cove-seoul',
      ),
    ).toBeNull();
    expect(
      materialIdFromExercisePath(
        '/academy/another/learn/exercises/material-1',
        'cove-seoul',
      ),
    ).toBeNull();
  });

  it('exits the entire trusted exercise sequence only', () => {
    expect(exerciseExitDelta(entry)).toBe(-3);
    expect(exerciseExitDelta({ ...entry, trustedOrigin: false })).toBeNull();
  });
});
