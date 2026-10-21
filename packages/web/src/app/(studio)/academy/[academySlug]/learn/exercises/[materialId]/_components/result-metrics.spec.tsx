import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SubmissionResult } from '@cove/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string, values?: { score?: number }) => key === 'submit.score' ? `${values?.score} / 100` : key }) }));
import { ResultMetrics } from './result-metrics';

describe('grading score display', () => {
  it('does not show a queued snapshot’s provisional zero as a final score', () => {
    const result = { status: 'QUEUED', totalCount: 2, passedCount: 0, score: 0, runtimeMs: null, earnedWeight: null, possibleWeight: null } as SubmissionResult;
    const pending = renderToStaticMarkup(<ResultMetrics cells={[]} presentation="grading" result={result} />);
    expect(pending).toContain('— / 100');
    expect(pending).not.toContain('>0 / 100<');
    const failed = renderToStaticMarkup(<ResultMetrics cells={[]} presentation="wrong_output" result={{ ...result, status: 'FAILED' }} />);
    expect(failed).toContain('>0 / 100<');
  });
});
