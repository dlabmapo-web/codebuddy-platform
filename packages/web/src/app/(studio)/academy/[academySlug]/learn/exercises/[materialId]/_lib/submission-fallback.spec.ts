import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSubmissionFallback } from './submission-fallback';

afterEach(() => vi.useRealTimers());

describe('createSubmissionFallback', () => {
  it('repeats only read recovery after quiet streams, within a finite bound', () => {
    vi.useFakeTimers();
    const fetchOnce = vi.fn();
    const fallback = createSubmissionFallback(fetchOnce, 15_000);

    fallback.touch();
    vi.advanceTimersByTime(15_000);
    fallback.touch();
    vi.advanceTimersByTime(30_000);

    expect(fetchOnce.mock.calls.length).toBeGreaterThan(1);
    vi.runAllTimers();
    expect(fetchOnce).toHaveBeenCalledTimes(120);
  });

  it('measures inactivity from the latest progress event', () => {
    vi.useFakeTimers();
    const fetchOnce = vi.fn();
    const fallback = createSubmissionFallback(fetchOnce, 15_000);

    fallback.touch();
    vi.advanceTimersByTime(14_000);
    fallback.touch();
    vi.advanceTimersByTime(14_000);
    expect(fetchOnce).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(fetchOnce).toHaveBeenCalledOnce();
  });

  it('can be cancelled after a result arrives', () => {
    vi.useFakeTimers();
    const fetchOnce = vi.fn();
    const fallback = createSubmissionFallback(fetchOnce, 15_000);
    fallback.touch();
    fallback.cancel();
    vi.runAllTimers();
    expect(fetchOnce).not.toHaveBeenCalled();
  });
});
