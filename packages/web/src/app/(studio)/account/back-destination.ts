import { routes, type AccountOrigin } from '@/lib/routes';

/**
 * Where My Page's back link goes, and what it calls the place.
 *
 * A pure function rather than an expression inside the page, for the same
 * reason `studioNavGroups` is one: it is a decision with four inputs and four
 * answers, and the failure it guards against — sending somebody back through a
 * door they did not come in — is invisible in a rendered page.
 *
 * The rules, in the order they win:
 *
 * 1. **The door the reader used**, when they said which. Only the console says
 *    so today, and only an operator may be sent there — the origin arrives in
 *    a URL anybody can type, so it selects between answers this account is
 *    already entitled to rather than granting a destination.
 * 2. **Their first academy.** The ordinary answer for a member.
 * 3. **The console**, for an operator holding no membership at all.
 * 4. **Sign-in**, for an account with neither — the only case where there is
 *    genuinely nowhere else to go.
 *
 * Rule 1 exists because rule 2 is wrong for exactly one person: an operator who
 * also manages an academy. Without it they open My Page in the console and are
 * returned to their academy. Making the platform role outrank the membership
 * instead would fix that trip and break its mirror, throwing an
 * operator-manager into the console from inside their own academy.
 *
 * The label names the destination rather than the product the reader is most
 * likely in. "Back to Studio" over a link into the console is the one thing
 * this page can say that is simply false.
 */
export function myPageBackDestination(input: {
  origin: AccountOrigin | null;
  firstAcademySlug: string | null;
  isPlatformAdmin: boolean;
}): { href: string; labelKey: 'back_to_console' | 'back_to_studio' } {
  const { origin, firstAcademySlug, isPlatformAdmin } = input;

  if (origin === 'admin' && isPlatformAdmin) {
    return { href: routes.admin, labelKey: 'back_to_console' };
  }
  if (firstAcademySlug) {
    return {
      href: routes.academy(firstAcademySlug),
      labelKey: 'back_to_studio',
    };
  }
  if (isPlatformAdmin) {
    return { href: routes.admin, labelKey: 'back_to_console' };
  }
  return { href: routes.login, labelKey: 'back_to_studio' };
}
