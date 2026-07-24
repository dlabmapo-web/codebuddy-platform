import { describe, expect, it } from 'vitest';

import { initTranslations } from './init-translations';

describe('initTranslations formatters', () => {
  it('registers Cove date, number, and percent formatters', async () => {
    const { i18n } = await initTranslations('ko', ['common'], undefined, {
      ko: {
        common: {
          summary:
            '{{date, date}} · {{count, number}} · {{ratio, percent}}',
        },
      },
    });

    expect(
      i18n.t('summary' as never, {
        date: '2026-07-24T06:40:00.000Z',
        count: 1204,
        ratio: 0.24,
      }),
    ).toBe('2026년 7월 24일 · 1,204 · 24%');
  });
});
