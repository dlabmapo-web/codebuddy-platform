import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ContentBasePathProvider } from '@/components/studio/content-base-path-provider';

vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/config', () => ({ publicConfig: { guiEnabled: true, shortAnswerEnabled: true, multipleChoiceEnabled: true } }));
vi.mock('@/lib/manual-api', () => ({ manualApi: {} }));
vi.mock('@/components/editor/RichEditor', () => ({ RichEditor: () => <div /> }));
vi.mock('./choice-fields', () => ({ ChoiceFields: () => <div /> }));
vi.mock('./short-answer-fields', () => ({ ShortAnswerFields: () => <div /> }));
vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const { ManualAuthorDialog } = await import('./manual-author-dialog');

describe('manual authoring on platform admin routes', () => {
  for (const type of ['TURTLE_EXERCISE', 'WRITTEN_RESPONSE', 'MULTIPLE_CHOICE'] as const) {
    it(`opens ${type} without an academy learning route provider`, () => {
      const markup = renderToStaticMarkup(
        <ContentBasePathProvider academySlug="qa-academy" surface="console">
          <ManualAuthorDialog
            target={{ academyId: 'academy', courseId: 'course', lectureId: 'lecture' }}
            material={{ id: 'material', title: 'QA activity', type }}
            type={type}
            onClose={() => undefined}
            onSaved={async () => undefined}
          />
        </ContentBasePathProvider>,
      );
      expect(markup).toContain('QA activity');
      expect(markup).toContain('/academy/qa-academy/learn/');
      expect(markup).toContain('preview=true');
      expect(markup).toContain('enable_submit');
      expect(markup).toContain('exclude_from_score');
      expect(markup).not.toContain('Enable Submit');
      expect(markup).not.toContain('Exclude from score');
    });
  }
});
