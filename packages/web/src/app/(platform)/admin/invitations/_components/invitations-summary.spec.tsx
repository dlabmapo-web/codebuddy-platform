import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import en from '@cove/i18n/locales/en/platform-invitations.json';
import ko from '@cove/i18n/locales/ko/platform-invitations.json';

import { InvitationsSummary } from './invitations-summary';

const summary = {
  total: 34,
  accepted: 18,
  pending: 12,
  expiringSoon: 4,
  bounced: 3,
  bouncedLeaderless: 2,
  academies: 9,
};

/**
 * Rendered against the real locale files rather than a stub `t`.
 *
 * The console shipped this strip printing `summary.total` at every reader: the
 * page had nested a second `PageTranslationsProvider`, `useTranslation`
 * resolved to that instance instead of the shell's, and every key fell through
 * to another namespace's `defaultNS`. A mocked `t` that echoes its key cannot
 * see any of that — and cannot see a renamed key either. So this test loads the
 * shipped JSON and asserts the words.
 */
function render(
  locale: 'en' | 'ko',
  props: { academyName?: string; summary?: typeof summary } = {},
) {
  const i18n = createInstance();
  void i18n.init({
    lng: locale,
    resources: {
      en: { 'platform-invitations': en },
      ko: { 'platform-invitations': ko },
    },
    defaultNS: 'platform-invitations',
    ns: ['platform-invitations'],
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <InvitationsSummary summary={summary} {...props} />
    </I18nextProvider>,
  );
}

describe('InvitationsSummary', () => {
  beforeAll(() => {
    // A guard on the fixture rather than on the component: every field the
    // strip reads must exist, or a later schema change makes these assertions
    // pass against `undefined`.
    expect(Object.keys(summary)).toHaveLength(7);
  });

  it('prints words, never raw keys', () => {
    for (const locale of ['en', 'ko'] as const) {
      const html = render(locale);
      expect(html, locale).not.toMatch(/summary\.[a-z_]+/);
      expect(html, locale).not.toContain('platform-invitations');
    }
  });

  it('qualifies the total with how many were accepted', () => {
    // Not with the academy count, which the header beside it already states.
    const html = render('en');
    expect(html).toContain('18 accepted');
    expect(html).toContain('across 9 academies');
    expect(html).not.toContain('in 9 academies');
  });

  it('names the academy the counts belong to, and drops the scope line', () => {
    const html = render('en', { academyName: 'D.Lab Mapo' });
    expect(html).toContain('D.Lab Mapo');
    // "D.Lab Mapo, across 9 academies" would be two different scopes claimed
    // at once.
    expect(html).not.toContain('across 9 academies');
  });

  it('goes green when every bounce has a manager who can resend it', () => {
    // The green state is the point: an operator who never sees it cannot tell
    // "I am done" from "I have not looked".
    expect(render('en')).toContain('text-danger');

    const clear = render('en', {
      summary: { ...summary, bounced: 0, bouncedLeaderless: 0 },
    });
    expect(clear).toContain('text-success');
    expect(clear).toContain('Every one has a manager who can resend');
  });
});
