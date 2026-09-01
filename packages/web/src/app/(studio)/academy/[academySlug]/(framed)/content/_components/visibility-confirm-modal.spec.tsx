import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { VisibilityConfirmModal } = await import('./visibility-confirm-modal');

describe('VisibilityConfirmModal', () => {
  it('keeps a failed hide visible and retryable', () => {
    const html = renderToStaticMarkup(
      <VisibilityConfirmModal
        error="Visibility failed"
        itemTitle="Python Basics"
        kindLabel="course"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
      />,
    );

    expect(html).toContain('Visibility failed');
    expect(html).toContain('role="alert"');
    expect(html).toContain('visibility_confirm.confirm');
    expect(html).not.toContain('disabled=""');
  });

  it('disables confirmation and announces progress while hiding', () => {
    const html = renderToStaticMarkup(
      <VisibilityConfirmModal
        itemTitle="Python Basics"
        kindLabel="course"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        open
        pending
      />,
    );

    expect(html).toContain('visibility_confirm.submitting');
    expect(html).toContain('disabled=""');
  });
});
