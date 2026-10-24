// @vitest-environment happy-dom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { LatestSubmission } from '@cove/shared';
vi.stubGlobal('React', React);
vi.mock('@/i18n', () => ({ useLocale: () => 'en' }));
import { SubmissionSummary } from './submission-summary';
const latest: LatestSubmission = { submissionId: 'id', createdAt: '2026-10-23T01:02:03Z', scoreHundredths: 0, maximumHundredths: 2550, status: 'GRADED' };
it('shows the actual zero and frozen maximum beside the server submission time', () => {
  const html = renderToStaticMarkup(<SubmissionSummary latest={latest} />);
  expect(html).toContain('0 / 25.5'); expect(html).toContain('Last submit score');
  expect(html).toContain('dateTime="2026-10-23T01:02:03Z"'); expect(html).toContain('10:02:03');
});
it('does not show a fake zero for unsubmitted, pending, ungraded or failed evaluation', () => {
  expect(renderToStaticMarkup(<SubmissionSummary latest={null} />)).toContain('—');
  expect(renderToStaticMarkup(<SubmissionSummary latest={{ ...latest, status: 'PENDING', scoreHundredths: null }} />)).toContain('Grading…');
  expect(renderToStaticMarkup(<SubmissionSummary latest={{ ...latest, status: 'RECORDED', scoreHundredths: null }} />)).toContain('Not automatically graded');
  expect(renderToStaticMarkup(<SubmissionSummary failed />)).toContain('Unavailable');
});
