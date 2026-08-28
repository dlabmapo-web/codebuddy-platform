import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values?.title ? `${key}:${values.title}` : key,
  }),
}));

vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { MoveModal } = await import('./move-modal');

const siblings = [
  { id: 'a', title: '[CH01]', isVisible: true },
  { id: 'b', title: '[CH02]', isVisible: false },
  { id: 'c', title: '[CH08]', isVisible: true },
];

function render(currentIndex: number) {
  return renderToStaticMarkup(
    <MoveModal
      currentIndex={currentIndex}
      kind="lecture"
      onCancel={() => undefined}
      onMove={() => undefined}
      open
      siblings={siblings}
    />,
  );
}

describe('MoveModal', () => {
  it('offers one destination per sibling, in the order shown', () => {
    const html = render(2);

    expect((html.match(/<button/g) ?? []).length).toBe(siblings.length + 1);
    // First has no predecessor to name; the rest name the one they land after.
    expect(html).toContain('move.first');
    expect(html).toContain('move.after:[CH01]');
    expect(html).toContain('move.after:[CH02]');
  });

  /*
   * The place the item already occupies stays listed, so the destinations line
   * up with the outline being read, but it cannot be chosen.
   */
  it('shows the current position and disables it', () => {
    expect(render(2)).toContain('aria-current="true"');
    expect(render(2)).toContain('disabled');
    expect(render(2)).toContain('move.current');
  });

  it('marks a hidden sibling, because it still holds its place', () => {
    expect(render(0)).toContain('move.hidden');
  });
});
