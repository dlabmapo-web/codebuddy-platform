import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { LearnExercise } from '@cove/shared';

vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./statement-canvas', () => ({ StatementCanvas: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/studio/rich-text-frame', () => ({ RichTextFrame: () => null }));
vi.mock('./example-card', () => ({ ExampleCard: () => null }));
vi.mock('./hints-dialog', () => ({ HintsDialog: () => null }));
import { ProblemStatement } from './problem-statement';

describe('problem constraints', () => {
  it('preserves negative numbers while removing optional list markers', () => {
    const exercise = {
      materialId: 'material', description: '', inputFormat: '', outputFormat: '',
      constraints: '-1000000 <= a, b <= 1000000\n  - -20 <= n\n• n is an integer\n·No extra output',
      sampleTestCases: [], hiddenTestCaseCount: 0, hints: [],
    } as unknown as LearnExercise;
    const html = renderToStaticMarkup(<ProblemStatement exercise={exercise} revealedHints={0} />);
    expect(html).toContain('-1000000 &lt;= a, b &lt;= 1000000');
    expect(html).toContain('-20 &lt;= n');
    expect(html).toContain('>n is an integer</span>');
    expect(html).toContain('>No extra output</span>');
    expect(html).not.toContain('•');
  });
});
