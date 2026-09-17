import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}(${Object.entries(values).map(([k, v]) => `${k}=${String(v)}`).join(',')})` : key,
  }),
}));
vi.mock('@/i18n/client/use-error-text', () => ({
  useErrorText: () => () => 'error',
}));
vi.mock('@/components/studio/primitives', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalContent: ({
    children,
    description,
    title,
  }: {
    children: React.ReactNode;
    description?: string;
    title: string;
  }) => (
    <div data-description={description} data-title={title}>
      {children}
    </div>
  ),
}));

const { MoveAnywhereModal } = await import('./move-anywhere-modal');
import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseTree } from '../_lib/course-tree';

function builderFor(lectureCount = 3): CourseBuilderState {
  const material = (id: string) => ({ id, title: id, position: 0, isVisible: true });
  const lectures = Array.from({ length: lectureCount }, (_, index) => ({
    id: `L${index + 1}`,
    title: `L${index + 1}`,
    position: index + 1,
    isVisible: index !== 2,
    materials: index === 0 ? [material('P1'), material('P2'), material('P3')] : [],
  }));
  const tree = {
    course: { id: 'course', title: 'Course', isVisible: true },
    modules: [
      { id: 'M1', title: 'Basics', position: 1, isVisible: true, lectures: lectures.slice(0, 2) },
      { id: 'M2', title: 'Strings', position: 2, isVisible: true, lectures: lectures.slice(2) },
    ],
  } as unknown as CourseTree;
  return { tree, move: vi.fn() } as unknown as CourseBuilderState;
}

const render = (builder = builderFor(), itemId = 'P3', kind: 'exercise' | 'lecture' = 'exercise') =>
  renderToStaticMarkup(
    <MoveAnywhereModal
      builder={builder}
      itemId={itemId}
      kind={kind}
      onClose={() => undefined}
      visibilityIsReal
    />,
  );

describe('MoveAnywhereModal', () => {
  it('opens on the current place, commits to nothing, and says so', () => {
    const html = render();

    expect(html).toContain('data-description="P3"');
    // The current lecture's radio is checked, the current position too.
    expect(html).toContain('name="move-destination" checked="" value="L1"');
    expect(html).toContain('name="move-position" checked="" value="2"');
    expect(html).toContain('move.unchanged');
    expect(html).toMatch(/disabled=""[^>]*type="submit"/);
  });

  it('expands only the chapter holding the current lecture', () => {
    const html = render();

    expect(html).toContain('value="L1"');
    expect(html).toContain('value="L2"');
    expect(html).not.toContain('value="L3"');
  });

  it('names positions against the destination without the item', () => {
    const html = render();

    expect(html).toContain('move.first');
    expect(html).toContain('move.after(title=P1)');
    expect(html).toContain('move.last');
    // P2 is the last sibling once P3 is lifted out, so it is "last", not "after P2".
    expect(html).not.toContain('move.after(title=P2)');
    expect(html).not.toContain('move.after(title=P3)');
  });

  it('lists chapters, not lectures, when moving a lecture', () => {
    const html = render(builderFor(), 'L2', 'lecture');

    expect(html).toContain('move.step_module');
    expect(html).toContain('value="M1"');
    expect(html).toContain('value="M2"');
    expect(html).not.toContain('value="L1"');
  });

  it('offers search only for a course with more destinations than the threshold', () => {
    expect(render()).not.toContain('type="search"');
    expect(render(builderFor(10))).toContain('type="search"');
  });

  it('renders nothing for an item the tree no longer holds', () => {
    expect(render(builderFor(), 'gone')).toBe('');
  });
});
