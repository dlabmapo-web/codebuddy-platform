import { describe, expect, it } from 'vitest';

import { myPageBackDestination } from './back-destination';

const operatorManager = {
  origin: 'admin' as const,
  firstAcademySlug: 'mapo-dlab',
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
    ).toEqual({ href: '/academy/mapo-dlab', labelKey: 'back_to_studio' });
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
        firstAcademySlug: 'mapo-dlab',
        isPlatformAdmin: false,
      }),
    ).toEqual({ href: '/academy/mapo-dlab', labelKey: 'back_to_studio' });
  });

  it('gives a member with no origin their first academy', () => {
    expect(
      myPageBackDestination({
        origin: null,
        firstAcademySlug: 'mapo-dlab',
        isPlatformAdmin: false,
      }),
    ).toEqual({ href: '/academy/mapo-dlab', labelKey: 'back_to_studio' });
  });

  it('gives an operator with no membership the console', () => {
    expect(
      myPageBackDestination({
        origin: null,
        firstAcademySlug: null,
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
        firstAcademySlug: null,
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
      for (const firstAcademySlug of [null, 'mapo-dlab']) {
        for (const isPlatformAdmin of [false, true]) {
          const back = myPageBackDestination({
            origin,
            firstAcademySlug,
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
