import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getBySlug: vi.fn(),
  list: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not found');
  }),
  redirect: vi.fn(),
  RedirectType: { replace: 'replace' },
}));
vi.mock('@/lib/orpc-server', () => ({
  createPlatformServerORPCClient: () => ({
    platformAcademies: {
      getBySlug: mocks.getBySlug,
      list: mocks.list,
    },
  }),
  createServerORPCClient: vi.fn(),
  getAccount: vi.fn(),
}));

import { resolvePlatformAcademyRoute } from './academy-route';

describe('platform academy route', () => {
  beforeEach(() => {
    mocks.cookies.mockReset();
    mocks.getBySlug.mockReset();
    mocks.list.mockReset();
  });

  it('is independent of the global view-role cookie', async () => {
    mocks.cookies.mockRejectedValue(
      new Error('the console guard must not read cookies'),
    );
    mocks.getBySlug.mockResolvedValue({
      id: 'academy-1',
      name: 'Mapo DLab',
      slug: 'mapo-dlab',
    });

    await expect(resolvePlatformAcademyRoute('mapo-dlab')).resolves.toEqual({
      academyId: 'academy-1',
      academySlug: 'mapo-dlab',
      role: 'MANAGER',
      // An operator stands in one role and holds nothing beside it, so the
      // set the `can*` gates read is that role alone.
      roles: ['MANAGER'],
    });
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it('uses the exact-slug endpoint instead of a capped fuzzy page', async () => {
    mocks.getBySlug.mockResolvedValue({
      id: 'academy-101',
      name: 'Mapo DLab 101',
      slug: 'mapo-dlab-101',
    });

    await expect(
      resolvePlatformAcademyRoute('mapo-dlab-101'),
    ).resolves.toMatchObject({ academyId: 'academy-101' });
    expect(mocks.getBySlug).toHaveBeenCalledWith({
      academySlug: 'mapo-dlab-101',
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
