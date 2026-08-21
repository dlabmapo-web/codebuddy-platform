/**
 * Makes `t()` key-checked. English is the source of truth for the key shape,
 * so `t('nav.link.membrs')` fails `pnpm typecheck` instead of rendering the
 * raw key at runtime. Korean parity is checked separately, by
 * `i18n/key-parity.spec.ts`.
 */
import type academy from '@cove/i18n/locales/en/academy.json';
import type applications from '@cove/i18n/locales/en/applications.json';
import type audit from '@cove/i18n/locales/en/audit.json';
import type auth from '@cove/i18n/locales/en/auth.json';
import type classes from '@cove/i18n/locales/en/classes.json';
import type common from '@cove/i18n/locales/en/common.json';
import type content from '@cove/i18n/locales/en/content.json';
import type courses from '@cove/i18n/locales/en/courses.json';
import type errors from '@cove/i18n/locales/en/errors.json';
import type invitations from '@cove/i18n/locales/en/invitations.json';
import type lead from '@cove/i18n/locales/en/lead.json';
import type learn from '@cove/i18n/locales/en/learn.json';
import type learning from '@cove/i18n/locales/en/learning.json';
import type manager from '@cove/i18n/locales/en/manager.json';
import type members from '@cove/i18n/locales/en/members.json';
import type monitoring from '@cove/i18n/locales/en/monitoring.json';
import type nav from '@cove/i18n/locales/en/nav.json';
import type peopleOps from '@cove/i18n/locales/en/people-ops.json';
import type platform from '@cove/i18n/locales/en/platform.json';
import type profile from '@cove/i18n/locales/en/profile.json';
import type session from '@cove/i18n/locales/en/session.json';
import type teach from '@cove/i18n/locales/en/teach.json';
import type teaching from '@cove/i18n/locales/en/teaching.json';
import type validation from '@cove/i18n/locales/en/validation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      academy: typeof academy;
      applications: typeof applications;
      audit: typeof audit;
      auth: typeof auth;
      classes: typeof classes;
      common: typeof common;
      content: typeof content;
      courses: typeof courses;
      errors: typeof errors;
      invitations: typeof invitations;
      lead: typeof lead;
      learn: typeof learn;
      learning: typeof learning;
      manager: typeof manager;
      members: typeof members;
      monitoring: typeof monitoring;
      nav: typeof nav;
      'people-ops': typeof peopleOps;
      platform: typeof platform;
      profile: typeof profile;
      session: typeof session;
      teach: typeof teach;
      teaching: typeof teaching;
      validation: typeof validation;
    };
  }
}
