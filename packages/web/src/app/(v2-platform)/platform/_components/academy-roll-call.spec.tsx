import type { PlatformAcademySummary } from '@cove/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  // The copy is checked for existence by `@cove/i18n`'s locale suites. What
  // matters here is which key each state reaches for, so the stub echoes it.
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const values = Object.values(options ?? {});
      return values.length > 0 ? `${key}:${values.join(':')}` : key;
    },
  }),
}));

import { AcademyRollCall } from './academy-roll-call';

function academy(
  overrides: Partial<PlatformAcademySummary> = {},
): PlatformAcademySummary {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'DLab Gangnam',
    slug: 'dlab-gangnam',
    status: 'ACTIVE',
    timeZone: 'Asia/Seoul',
    managerState: 'active',
    memberCounts: {
      total: 0,
      managers: 0,
      teamLeads: 0,
      teachers: 0,
      students: 0,
    },
    pendingManagerInvitation: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    statusChangedAt: null,
    ...overrides,
  };
}

describe('AcademyRollCall', () => {
  it('says nothing needs doing when the roll call is empty', () => {
    const html = renderToStaticMarkup(<AcademyRollCall academies={[]} />);
    expect(html).toContain('empty.settled_title');
    expect(html).not.toContain('roll_call.action_invite');
  });

  it('leads a leaderless academy with the people it strands', () => {
    // The whole argument of the card: "no active manager" is administrative
    // until you read that 340 students are underneath it.
    const html = renderToStaticMarkup(
      <AcademyRollCall
        academies={[
          academy({
            managerState: 'no_active_manager',
            memberCounts: {
              total: 352,
              managers: 0,
              teamLeads: 0,
              teachers: 12,
              students: 340,
            },
          }),
        ]}
      />,
    );
    expect(html).toContain('roll_call.no_active_manager_body');
    expect(html).toContain('condition.no_active_manager');
    expect(html).toContain('roles.students:340');
    expect(html).toContain('roles.teachers:12');
    expect(html).toContain('roll_call.action_invite');
  });

  it('offers a resend, not an invite, while the first invitation is out', () => {
    const html = renderToStaticMarkup(
      <AcademyRollCall
        academies={[
          academy({
            managerState: 'awaiting_first_manager',
            pendingManagerInvitation: {
              email: 'manager@example.com',
              expiresAt: '2026-08-10T00:00:00.000Z',
              isExpired: true,
            },
          }),
        ]}
      />,
    );
    expect(html).toContain('roll_call.action_resend');
    expect(html).not.toContain('roll_call.action_invite');
    expect(html).toContain('manager@example.com');
  });

  it('says an empty academy strands nobody', () => {
    const html = renderToStaticMarkup(
      <AcademyRollCall
        academies={[academy({ managerState: 'awaiting_first_manager' })]}
      />,
    );
    expect(html).toContain('roll_call.stakes_empty');
  });

  it('links every card to the academy it names', () => {
    const html = renderToStaticMarkup(
      <AcademyRollCall
        academies={[academy({ managerState: 'no_active_manager' })]}
      />,
    );
    expect(html).toContain(
      '/platform/academies/20000000-0000-4000-8000-000000000001',
    );
  });
});
