import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/academy-route', () => ({ requireAcademyOrLobbyRoute: mocks.guard }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
// A root entry must not access dashboard data or perform an extra account read.
vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => { throw new Error('Unexpected dashboard request'); },
  getAccount: () => { throw new Error('Unexpected extra account read'); },
}));

import AcademyPage from './page';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`redirect:${path}`); });
});

describe('academy root without Overview', () => {
  it.each([
    ['MANAGER', '/classes'],
    ['TEAM_LEAD', '/classes'],
    ['TEACHER', '/teach/classes'],
    ['STUDENT', '/learn/courses'],
  ] as const)('redirects %s before loading dashboard data', async (role, suffix) => {
    mocks.guard.mockResolvedValue({ academySlug: 'cove-seoul', role, via: 'membership' });
    await expect(AcademyPage({ params: Promise.resolve({ academySlug: 'cove-seoul' }) }))
      .rejects.toThrow(`redirect:/academy/cove-seoul${suffix}`);
    expect(mocks.guard).toHaveBeenCalledWith('cove-seoul');
  });

  it.each(['grant', 'platform'])('uses the authorized assumed role for %s access', async (via) => {
    mocks.guard.mockResolvedValue({ academySlug: 'cove-seoul', role: 'TEACHER', via });
    await expect(AcademyPage({ params: Promise.resolve({ academySlug: 'cove-seoul' }) }))
      .rejects.toThrow('redirect:/academy/cove-seoul/teach/classes');
  });

  it('leaves pending applicants to the lobby layout', async () => {
    mocks.guard.mockResolvedValue({ academySlug: 'cove-seoul', role: 'STUDENT', via: 'application' });
    expect(await AcademyPage({ params: Promise.resolve({ academySlug: 'cove-seoul' }) })).toBeNull();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('preserves guard failures instead of turning them into a work-page redirect', async () => {
    mocks.guard.mockRejectedValue(new Error('access denied'));
    await expect(AcademyPage({ params: Promise.resolve({ academySlug: 'cove-seoul' }) }))
      .rejects.toThrow('access denied');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
