import { describe, expect, it } from 'vitest';

import { myPageBackDestination } from './back-destination';

const mapo = { slug: 'mapo-dlab', role: 'MANAGER' as const };
const operatorManager = {
  origin: 'admin' as const,
  firstAcademy: mapo,
  isPlatformAdmin: true,
};

describe('the way back from My Page', () => {
  /*
   * The trip this function was written for. An operator who also manages an
   * academy holds a membership, so every rule below would have sent them into
   * that academy from a page they opened in the console.
   */
  it('returns an operator to the console they came from, membership or not', () => {
    expect(myPageBackDestination(operatorManager)).toEqual({
      href: '/admin',
      labelKey: 'back_to_console',
    });
  });

  it('sends the same person to their academy when they came from there', () => {
    expect(
      myPageBackDestination({ ...operatorManager, origin: null }),
    ).toEqual({ href: '/academy/mapo-dlab/classes', labelKey: 'back_to_studio' });
  });

  /*
   * The origin rides in a URL, so anybody can type it. It picks between
   * answers the account already has rather than granting a destination — a
   * member who writes `?from=admin` is still returned to their academy.
   */
  it('ignores a console origin claimed by somebody who is not an operator', () => {
    expect(
      myPageBackDestination({
        origin: 'admin',
        firstAcademy: mapo,
        isPlatformAdmin: false,
      }),
    ).toEqual({ href: '/academy/mapo-dlab/classes', labelKey: 'back_to_studio' });
  });

  it('gives a member with no origin their first academy', () => {
    expect(
      myPageBackDestination({
        origin: null,
        firstAcademy: mapo,
        isPlatformAdmin: false,
      }),
    ).toEqual({ href: '/academy/mapo-dlab/classes', labelKey: 'back_to_studio' });
  });

  // The academy root only redirects to this page, so linking it would cost a hop.
  it("lands a teacher or student on their role's entry page, not the academy root", () => {
    const back = (role: 'TEACHER' | 'STUDENT') =>
      myPageBackDestination({
        origin: null,
        firstAcademy: { slug: 'mapo-dlab', role },
        isPlatformAdmin: false,
      }).href;
    expect(back('TEACHER')).toBe('/academy/mapo-dlab/teach/classes');
    expect(back('STUDENT')).toBe('/academy/mapo-dlab/learn/courses');
  });

  it('gives an operator with no membership the console', () => {
    expect(
      myPageBackDestination({
        origin: null,
        firstAcademy: null,
        isPlatformAdmin: true,
      }),
    ).toEqual({ href: '/admin', labelKey: 'back_to_console' });
  });

  /*
   * An applicant, or an account between academies. Sign-in is the only honest
   * answer left — and it is the only case where the page may offer it, because
   * for anyone above it reads as though their session had lapsed.
   */
  it('falls back to sign-in only for an account with nowhere to go', () => {
    expect(
      myPageBackDestination({
        origin: null,
        firstAcademy: null,
        isPlatformAdmin: false,
      }),
    ).toEqual({ href: '/login', labelKey: 'back_to_studio' });
  });

  /*
   * The label names where the link goes. "Back to Studio" over a link into the
   * console is the one thing this page can say that is simply false.
   */
  it('never labels a console destination as the studio', () => {
    for (const origin of [null, 'admin' as const]) {
      for (const firstAcademy of [null, mapo]) {
        for (const isPlatformAdmin of [false, true]) {
          const back = myPageBackDestination({
            origin,
            firstAcademy,
            isPlatformAdmin,
          });
          expect(back.href === '/admin').toBe(
            back.labelKey === 'back_to_console',
          );
        }
      }
    }
  });
});
