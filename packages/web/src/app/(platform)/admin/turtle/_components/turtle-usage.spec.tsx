import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TurtleUsageResult } from '@cove/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const address = vi.hoisted(() => ({ search: '' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(address.search) }));
vi.mock('@/i18n', () => ({ useLocale: () => 'en', useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/orpc', () => ({ orpc: { platformTurtle: { usage: vi.fn() } } }));

const { TurtleUsage } = await import('./turtle-usage');

const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const data: TurtleUsageResult = {
  asOf: '2026-11-24T02:00:00.000Z', unit: 'hour',
  academies: [
    { academyId: a, name: 'Mapo', slug: 'mapo', activeNow: 3, devices: 12, entries: 14, runs: 205, lastUsedAt: '2026-11-24T01:59:00.000Z' },
    { academyId: b, name: 'Quiet', slug: 'quiet', activeNow: 0, devices: 0, entries: 0, runs: 0, lastUsedAt: null },
  ],
  series: [{ at: '2026-11-24T01:00:00.000Z', devices: 12, entries: 14, runs: 205 }],
};
const render = (value = data) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <TurtleUsage initialData={value} initialInput={{ from: '2026-11-24', to: '2026-11-24' }} />
  </QueryClientProvider>,
);
const tiles = (html: string) => [...html.matchAll(/text-\[22px\][^>]*>([^<]*)</g)].map((match) => match[1]);

describe('TurtleUsage', () => {
  beforeEach(() => { address.search = 'from=2026-11-24&to=2026-11-24'; });
  it('lists every academy and adds them up', () => {
    const html = render();
    expect(tiles(html)).toEqual(['3', '12', '14', '205']);
    expect(html).toContain('Mapo');
    expect(html).toContain('Quiet');
    expect(html).toContain('table.never');
    expect(html).toContain('note');
  });
  it('narrows the tiles to the chosen academy', () => {
    address.search += `&academy=${b}`;
    expect(tiles(render())).toEqual(['0', '0', '0', '0']);
  });
  it('says so when nothing was used', () => {
    expect(render({ ...data, series: [{ at: data.asOf, devices: 0, entries: 0, runs: 0 }] })).toContain('chart.empty');
  });
});
