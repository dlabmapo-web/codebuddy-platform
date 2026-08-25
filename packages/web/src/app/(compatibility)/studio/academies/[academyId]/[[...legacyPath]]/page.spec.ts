import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthMeResponse } from '@cove/shared';

const { authMe, notFound, redirect } = vi.hoisted(() => ({
  authMe: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound,
  redirect,
  RedirectType: { replace: 'replace' },
}));

vi.mock('@/lib/orpc-server', () => ({
  createServerORPCClient: () => ({ auth: { me: authMe } }),
}));

import LegacyAcademyPage from './page';

const academy = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Cove Development Academy',
  slug: 'cove-development',
};

const account: AuthMeResponse = {
  user: {
    id: '30000000-0000-4000-8000-000000000001',
    authUserId: '40000000-0000-4000-8000-000000000001',
    email: 'student@cove.test',
    username: 'student',
    displayName: 'Student',
    avatarUrl: null,
    imageUrl: null,
    platformRole: 'USER',
    status: 'ACTIVE',
    memberships: [
      { academy, role: 'STUDENT', status: 'ACTIVE', imageUrl: null },
    ],
    applications: [],
  },
};

describe('legacy academy compatibility page', () => {
  beforeEach(() => {
    authMe.mockReset();
    notFound.mockClear();
    redirect.mockClear();
  });

  it('replacement-redirects an authorized legacy URL to its canonical path', async () => {
    authMe.mockResolvedValue(account);

    await expect(LegacyAcademyPage({
      params: Promise.resolve({
        academyId: academy.id,
        legacyPath: ['content', 'courses'],
      }),
    })).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith(
      '/academy/cove-development/content/courses',
      'replace',
    );
  });

  it('replacement-redirects an unauthenticated visit to login', async () => {
    authMe.mockResolvedValue(null);

    await expect(LegacyAcademyPage({
      params: Promise.resolve({ academyId: academy.id }),
    })).rejects.toThrow('NEXT_REDIRECT');

    expect(redirect).toHaveBeenCalledWith('/login', 'replace');
  });

  it('returns not-found for an academy outside the active memberships', async () => {
    authMe.mockResolvedValue(account);

    await expect(LegacyAcademyPage({
      params: Promise.resolve({ academyId: 'unknown-academy' }),
    })).rejects.toThrow('NEXT_NOT_FOUND');

    expect(notFound).toHaveBeenCalledOnce();
    expect(redirect).not.toHaveBeenCalled();
  });
});
