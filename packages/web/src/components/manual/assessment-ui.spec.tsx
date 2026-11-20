import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/manual-api', () => ({ manualApi: {} }));
import { AssessmentStatus, ReviewGradingPanel, WrittenAnswerCard } from './assessment-ui';
import { ChoiceOptions } from './choice-options';

describe('assessment answer and review surfaces', () => {
  it.each([true, false, null])('keeps result text alongside its status icon (%s)', completed => {
    const html = renderToStaticMarkup(<AssessmentStatus label="Submission result" completed={completed} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Submission result');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(completed === true ? 'text-success' : completed === false ? 'text-warning' : 'text-brand');
  });
  it('connects the written answer to its hint and preserves the answer limit', () => {
    const html = renderToStaticMarkup(<WrittenAnswerCard question="Explain addition" hint="Two sentences" answer="My response" onChange={() => {}} />);
    expect(html).toContain('Explain addition');
    expect(html).toContain('aria-label="your_answer"');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('maxLength="10000"');
    expect(html).toContain('My response');
  });
  it('shows the hint once, as the placeholder, and keeps it for screen readers (QA S-05)', () => {
    const html = renderToStaticMarkup(<WrittenAnswerCard hint="Write the exact output" answer="" onChange={() => {}} />);
    expect(html).toContain('placeholder="Write the exact output"');
    expect(html).toMatch(/<p id="[^"]+-hint" class="sr-only">Write the exact output<\/p>/);
    expect(html.match(/Write the exact output/g)).toHaveLength(2);
    const plain = renderToStaticMarkup(<WrittenAnswerCard answer="" onChange={() => {}} />);
    expect(plain).toContain('placeholder="ui.answer_placeholder"');
    expect(plain).not.toContain('aria-describedby=');
  });

  it('keeps publication state separate from edited feedback', () => {
    const props = { score: 90, maximum: 100, completed: true, feedback: 'Keep practicing', busy: false, saved: true, dirty: false, onScore: vi.fn(), onCompleted: vi.fn(), onFeedback: vi.fn(), onSubmit: vi.fn() };
    const html = renderToStaticMarkup(<ReviewGradingPanel {...props} />);
    expect(html).toContain('ui.review_published');
    expect(html).toContain('Keep practicing');
    expect(html).toContain('max="100"');
    expect(html).toContain('checked=');
    expect(renderToStaticMarkup(<ReviewGradingPanel {...props} dirty />)).toContain('ui.review_unsaved');
    const invalid = renderToStaticMarkup(<ReviewGradingPanel {...props} score={101} />);
    expect(invalid).toMatch(/<button[^>]*disabled=""/);
    expect(renderToStaticMarkup(<ReviewGradingPanel {...props} busy />)).toContain('ui.publishing');
  });

  it.each(['SINGLE', 'MULTIPLE'] as const)('renders accessible %s choices with a visible selected state', selectionMode => {
    const html = renderToStaticMarkup(<ChoiceOptions definition={{ version: 1, question: 'Which operator adds?', problemDescription: '', selectionMode, shuffleOptions: false, explanationEnabled: false, options: [{ id: 'a', content: '+' }, { id: 'b', content: '-' }] }} selected={['a']} onChange={() => {}} />);
    expect(html).toContain(`type="${selectionMode === 'SINGLE' ? 'radio' : 'checkbox'}"`);
    expect(html).toContain('aria-label="option 1: +"');
    expect(html).toContain('checked=');
    expect(html).toContain('bg-brand-soft/60');
    expect(html).toContain(selectionMode === 'SINGLE' ? 'select_one' : 'select_all');
  });
});
