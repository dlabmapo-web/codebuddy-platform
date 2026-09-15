'use client';

import { useParams } from 'next/navigation';
import { routes } from '@/lib/routes';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { FeedbackDraftStore } from './feedback-draft-store';

const Context = React.createContext<{ store: FeedbackDraftStore; changed: () => void; revision: number } | null>(null);

/** Lives above membership navigation, but never outside this class or browser tab. */
export function FeedbackDraftProvider({ children }: { children: React.ReactNode }) {
  const slug = useAcademySlug();
  const { classId } = useParams<{ classId: string }>();
  const [store] = React.useState(() => new FeedbackDraftStore());
  const [revision, changed] = React.useReducer((n: number) => n + 1, 0);
  const { t } = useTranslation('monitoring');
  React.useEffect(() => {
    let actor: string | null | undefined;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (actor !== undefined && actor !== next) { store.clear(); changed(); }
      actor = next;
    });
    return () => subscription.unsubscribe();
  }, [store]);
  React.useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!store.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [store]);
  // Workspace exit controls explicitly identify exits; student links stay inside
  // this provider and need no confirmation.
  return <Context.Provider value={React.useMemo(() => ({ store, changed, revision }), [store, revision])}>
    <div className="contents" onClickCapture={(event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a');
      const exits = target.closest('[data-monitoring-class-exit]') || link?.getAttribute('href') === routes.academyTeachClass(slug, classId);
      if (exits && !event.metaKey && !event.ctrlKey && !event.shiftKey && link?.target !== '_blank' && store.dirty && !window.confirm(t('switcher.leave_notes'))) {
        event.preventDefault();
        event.stopPropagation();
      }
    }}>{children}</div>
  </Context.Provider>;
}

export function useFeedbackDraft(key: string) {
  const context = React.useContext(Context);
  if (!context) throw new Error('FeedbackDraftProvider is required');
  const { store, changed } = context;
  return {
    text: store.read(key),
    edit: React.useCallback((text: string) => { store.edit(key, text); changed(); }, [store, key, changed]),
    hydrate: React.useCallback((text: string) => { store.hydrate(key, text); changed(); }, [store, key, changed]),
    acknowledge: React.useCallback((text: string) => { store.acknowledge(key, text); changed(); }, [store, key, changed]),
  };
}
