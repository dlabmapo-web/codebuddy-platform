/* eslint-disable i18next/no-literal-string -- These labels identify mocked test components. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import Page from './page';
const reads = vi.hoisted(() => ({ classes: vi.fn(), drafts: vi.fn() }));
vi.mock('@/lib/academy-route', () => ({ requireAcademyRoute: async () => ({ academyId: 'academy' }) }));
vi.mock('@/lib/orpc-server', () => ({ createServerORPCClient: () => ({ learn: { listClasses: reads.classes, listDrafts: reads.drafts } }) }));
vi.mock('@/i18n/server/get-server-translation', () => ({ getServerTranslation: async () => ({ t: (key: string) => key }) }));
vi.mock('@/app/(auth)/actions', () => ({ logoutAction: vi.fn() }));
vi.mock('@/app/(studio)/academy/[academySlug]/(framed)/_components/studio-page', () => ({ StudioPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./_components/class-list', () => ({ ClassList: () => <div>Loaded classes</div> }));
vi.mock('./_components/continue-learning', () => ({ ContinueLearning: ({ initialDrafts }: { initialDrafts: unknown }) => <div>{initialDrafts === null ? 'Drafts unavailable' : 'Loaded drafts'}</div> }));
beforeEach(() => {
  vi.stubGlobal('React', React);
  reads.classes.mockReset().mockResolvedValue({ classes: [] }); reads.drafts.mockReset().mockResolvedValue({ drafts: [] });
});
it('keeps classes when the independent draft read fails', async () => {
  reads.drafts.mockRejectedValue(new Error('unavailable'));
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ academySlug: 'academy' }) }));
  expect(html).toContain('Loaded classes'); expect(html).toContain('Drafts unavailable');
});
it('keeps saved work accessible while a class-list failure remains an error', async () => {
  reads.classes.mockRejectedValue(new Error('unavailable'));
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ academySlug: 'academy' }) }));
  expect(html).toContain('Loaded drafts'); expect(html).toContain('classes.unavailable_title');
  expect(html).not.toContain('Loaded classes');
});
it('uses the existing sign-out action for an ended learning session', async () => {
  reads.drafts.mockRejectedValue(new ApiError('expired', 401, [], 'STUDENT_SESSION_EXPIRED'));
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ academySlug: 'academy' }) }));
  expect(html).toContain('errors:STUDENT_SESSION_EXPIRED'); expect(html).toContain('<form');
  expect(html).not.toContain('Loaded classes');
});
