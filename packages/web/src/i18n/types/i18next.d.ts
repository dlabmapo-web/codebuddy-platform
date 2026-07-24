/**
 * Makes `t()` key-checked. English is the source of truth for the key shape,
 * so `t('nav.link.membrs')` fails `pnpm typecheck` instead of rendering the
 * raw key at runtime. Korean parity is checked separately, by
 * `i18n/key-parity.spec.ts`.
 */
import type academy from '@cove/i18n/locales/en/academy.json';
import type applications from '@cove/i18n/locales/en/applications.json';
import type auth from '@cove/i18n/locales/en/auth.json';
import type common from '@cove/i18n/locales/en/common.json';
import type content from '@cove/i18n/locales/en/content.json';
import type courses from '@cove/i18n/locales/en/courses.json';
import type errors from '@cove/i18n/locales/en/errors.json';
import type invitations from '@cove/i18n/locales/en/invitations.json';
import type members from '@cove/i18n/locales/en/members.json';
import type nav from '@cove/i18n/locales/en/nav.json';
import type validation from '@cove/i18n/locales/en/validation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      academy: typeof academy;
      applications: typeof applications;
      auth: typeof auth;
      common: typeof common;
      content: typeof content;
      courses: typeof courses;
      errors: typeof errors;
      invitations: typeof invitations;
      members: typeof members;
      nav: typeof nav;
      validation: typeof validation;
    };
  }
}
