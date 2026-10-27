import { expect, it, vi } from 'vitest';
const { courses, classes, summary } = vi.hoisted(() => ({
  courses: vi.fn(), classes: vi.fn(), summary: vi.fn(() => new Promise(() => {})),
}));
vi.mock('@/i18n/server/get-server-translation', () => ({ getServerTranslation: async () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/orpc-server', () => ({ getAccount: async () => ({ user: { platformRole: 'ADMIN' } }), createServerORPCClient: () => ({ platformContent: { courses, classes, summary } }) }));
vi.mock('../../_components/platform-shell', () => ({ PlatformShell: () => null }));
vi.mock('../_components/content-table', () => ({ ContentTable: () => null }));
import { renderContentPage } from './render-content-page';

it.each(['courses', 'classes'] as const)('renders %s rows without requesting or waiting for the supplementary summary', async (lens) => {
  courses.mockResolvedValue({ items: [] }); classes.mockResolvedValue({ items: [] });
  const page = await renderContentPage({ lens, searchParams: Promise.resolve({}) });
  const table = page.props.children.props.children;
  expect(table.props.initialData).toEqual({ items: [] });
  expect(table.props.initialSummary).toBeNull();
  expect(summary).not.toHaveBeenCalled();
});
