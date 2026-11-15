'use client';

import type { LearnDraftSummary } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import en from '@cove/i18n/locales/en/student-classes.json';
import ko from '@cove/i18n/locales/ko/student-classes.json';
import { initTranslationsSync } from '@/i18n/init-translations';
import { useLocale } from '@/i18n';
import { orpc } from '@/lib/orpc';
import { claimServerRead, SERVER_READ_FRESH_MS } from '@/lib/server-read';
import { ContinuePanel } from '../../courses/_components/continue-panel';

/** The existing saved-draft shortcut, without fetching a course catalog. */
export function ContinueLearning({ academyId, initialDrafts, serverReadToken }: {
  academyId: string; initialDrafts: LearnDraftSummary[] | null; serverReadToken: string;
}) {
  const locale = useLocale();
  const instance = useMemo(() => initTranslationsSync(locale, ['student-classes'], { en: { 'student-classes': en }, ko: { 'student-classes': ko } }), [locale]);
  const { t } = useTranslation('student-classes', { i18n: instance });
  const cache = useQueryClient();
  const [seed] = useState(() => claimServerRead(serverReadToken) ? initialDrafts ?? undefined : undefined);
  const queryKey = ['learn', academyId, 'class-home-drafts', serverReadToken];
  const query = useQuery({
    queryKey, queryFn: async () => (await orpc.learn.listDrafts({ academyId })).drafts,
    initialData: seed, enabled: initialDrafts !== null, retry: false,
    staleTime: seed ? SERVER_READ_FRESH_MS : 0, gcTime: 0,
  });
  const discard = useMutation({
    mutationFn: (materialId: string) => orpc.learn.discardDraft({ academyId, materialId }),
    onMutate: async materialId => {
      await cache.cancelQueries({ queryKey });
      const previous = cache.getQueryData<LearnDraftSummary[]>(queryKey);
      cache.setQueryData(queryKey, previous?.filter(item => item.materialId !== materialId));
      return { previous };
    },
    onError: (_error, _materialId, context) => { if (context?.previous) cache.setQueryData(queryKey, context.previous); },
    onSettled: () => { void cache.invalidateQueries({ queryKey }); },
  });
  const unavailable = query.isError || (!query.data && !query.isFetching);
  return <>
    {unavailable ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4 text-sm text-sub">
      <span>{t('unavailable')}</span>
      <button type="button" disabled={query.isFetching} className="rounded-lg px-3 py-2 font-semibold text-brand hover:bg-brand-soft disabled:opacity-50" onClick={() => void query.refetch()}>{t('retry')}</button>
    </div> : null}
    {query.data ? <ContinuePanel drafts={query.data} discard={id => discard.mutate(id)} discardingId={discard.isPending ? discard.variables : null} /> : null}
    {discard.isError ? <p role="alert" className="text-sm text-danger">{t('discard_failed')}</p> : null}
  </>;
}
