import { academyAuditActions } from '@cove/shared';
import en from '@cove/i18n/locales/en/audit.json';
import ko from '@cove/i18n/locales/ko/audit.json';
import { describe, expect, it } from 'vitest';

/**
 * Every action the Recent changes panel can receive has copy in both locales.
 *
 * This exists because the alternative failed in the product. The panel's action
 * list was hand-written from what the actions *ought* to be called, the
 * services wrote something else, and `class.teacher.replaced` reached a
 * manager's history as a raw dotted code. Nothing caught it: `t()` is
 * key-checked, so a key that exists always compiles, and key-parity between
 * `en` and `ko` only proves the two catalogues agree with *each other* — both
 * were wrong together.
 *
 * The missing link was a comparison against the vocabulary the API actually
 * writes. `academyAuditActions` is now that single list — the API's action
 * helpers are typed against it — so this test closes the loop by requiring the
 * copy to cover it.
 */
describe('audit action copy', () => {
  const catalogues = { en, ko } as const;

  it.each(Object.keys(catalogues) as (keyof typeof catalogues)[])(
    'names every audited action in %s',
    (locale) => {
      const labels = catalogues[locale].action as Record<string, string>;
      const missing = academyAuditActions.filter((action) => !labels[action]);
      expect(missing, `add to locales/${locale}/audit.json`).toEqual([]);
    },
  );

  it('carries no label for an action the panel can never receive', () => {
    // A stale key is not harmless: it is a label somebody wrote for an action
    // that was renamed, and it hides the fact that the new name has none.
    const known = new Set<string>([...academyAuditActions, 'fallback']);
    for (const locale of Object.keys(catalogues) as (keyof typeof catalogues)[]) {
      const extra = Object.keys(catalogues[locale].action).filter(
        (key) => !known.has(key),
      );
      expect(extra, `stale keys in locales/${locale}/audit.json`).toEqual([]);
    }
  });

  it('keeps the fallback, so an unnamed action still prints something', () => {
    expect(en.action.fallback).toContain('{{action}}');
    expect(ko.action.fallback).toContain('{{action}}');
  });
});
