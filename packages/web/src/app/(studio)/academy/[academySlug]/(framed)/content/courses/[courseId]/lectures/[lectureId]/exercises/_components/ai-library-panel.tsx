'use client';

import { AI_LIBRARY_TEXT_MAX, type AiLibraryItemView, type AiLibraryView } from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Sparkles } from 'lucide-react';
import * as React from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { secondaryButtonClass, SectionCard } from './authoring-fields';

type Target = { academyId: string; courseId: string; materialId: string };

/** States that change on their own, so the panel reads again while it is open. */
const MOVING = ['WAITING', 'WRITING', 'CHECKING', 'REVIEWING'];
const fieldClass =
  'mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] leading-6 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20';

/**
 * The AI-written hints and feedback of one saved problem.
 *
 * Nothing here has to be filled in: the panel reads only when opened, and an
 * edit is for a teacher who wants better words. It is not part of the exercise
 * draft, so it saves on its own.
 */
export function AiLibraryPanel({ academyId, courseId, materialId, editable }: Target & { editable: boolean }) {
  const { t } = useTranslation('ai-library');
  const [open, setOpen] = React.useState(false);
  const [asking, setAsking] = React.useState<'no' | 'busy' | 'failed'>('no');
  const client = useQueryClient();
  const target = { academyId, courseId, materialId };
  const queryKey = ['ai-library', academyId, materialId];
  const query = useQuery({
    queryKey,
    enabled: open,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: () => orpc.aiAssistant.getLibrary(target),
    refetchInterval: (current) => MOVING.includes(current.state.data?.state ?? '') ? 30_000 : false,
  });
  const replace = (view: AiLibraryView) => client.setQueryData(queryKey, view);
  const view = query.data;
  const regenerate = async () => {
    setAsking('busy');
    try {
      replace(await orpc.aiAssistant.regenerateLibrary(target));
      setAsking('no');
    } catch {
      setAsking('failed');
    }
  };
  // A first library needs no asking for; one being made finishes first.
  const canRegenerate = view?.enabled && editable && (view.state === 'READY' || view.state === 'FAILED');
  const shown = (kind: AiLibraryItemView['kind']) =>
    view?.items.filter((item) => item.kind === kind && item.state !== 'REJECTED') ?? [];

  return (
    <SectionCard
      action={canRegenerate ? (
        <button className={secondaryButtonClass} disabled={asking === 'busy'} onClick={() => void regenerate()} type="button">
          <RefreshCw aria-hidden className="size-4" />
          {t(asking === 'busy' ? 'regenerating' : 'regenerate')}
        </button>
      ) : null}
      description={t('help')}
      icon={Sparkles}
      title={t('title')}
    >
      {!open ? (
        <button className={secondaryButtonClass} data-testid="open-ai-library" onClick={() => setOpen(true)} type="button">
          {t('open')}
        </button>
      ) : query.isPending ? (
        <div aria-busy="true" className="h-16 animate-pulse rounded-lg bg-canvas" />
      ) : !view ? (
        <div className="flex flex-wrap items-center gap-3" role="alert">
          <p className="text-[14px] text-danger">{t('failed')}</p>
          <button className={secondaryButtonClass} onClick={() => void query.refetch()} type="button">{t('retry')}</button>
        </div>
      ) : (
        <div className="space-y-5" data-testid="ai-library">
          <div className="space-y-1 text-[14px]" role="status">
            <p className={view.enabled ? 'font-semibold' : 'text-sub'}>{view.enabled ? t(`state.${view.state}`) : view.blocked ? t(`blocked.${view.blocked}`) : t('off')}</p>
            <LibraryError code={view.errorCode} ready={view.state === 'READY'} />
            {!view.current && view.items.some((item) => item.state === 'ACTIVE') ? <p className="text-warning">{t('stale')}</p> : null}
            {asking === 'failed' ? <p className="text-danger">{t('regenerate_failed')}</p> : null}
          </div>
          {(['HINT', 'FEEDBACK'] as const).map((kind) => (
            <section key={kind}>
              <h3 className="mb-2 text-[14px] font-bold">{t(kind === 'HINT' ? 'hints' : 'feedback')}</h3>
              {shown(kind).length ? (
                <ol className="space-y-2">
                  {shown(kind).map((item) => (
                    <LibraryItem
                      editable={editable}
                      item={item}
                      key={item.id}
                      onConflict={() => void query.refetch()}
                      onSaved={replace}
                      target={target}
                    />
                  ))}
                </ol>
              ) : <p className="text-[13.5px] text-sub">{t('empty')}</p>}
            </section>
          ))}
          <Dropped items={view.items.filter((item) => item.state === 'REJECTED')} />
          {view.correctPrograms.length ? (
            <details className="rounded-lg border border-border px-4 py-3">
              <summary className="cursor-pointer text-[13.5px] font-semibold">{t('correct_programs')} ({view.correctPrograms.length})</summary>
              <div className="mt-3 space-y-3">
                {view.correctPrograms.map((program, index) => (
                  <div key={index}>
                    <p className="text-[13px] text-sub">{program.approach}</p>
                    <Code>{program.code}</Code>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          <Mistakes view={view} />
        </div>
      )}
    </SectionCard>
  );
}

function LibraryError({ code, ready }: { code: string | null; ready: boolean }) {
  const { t } = useTranslation('ai-library');
  if (!code) return null;
  if (code === 'SOLUTION_FAILS') return <p className="text-danger">{t('error.SOLUTION_FAILS')}</p>;
  return ready ? null : <p className="text-sub">{t('error.other', { code })}</p>;
}

function LibraryItem({ item, editable, target, onSaved, onConflict }: {
  item: AiLibraryItemView;
  editable: boolean;
  target: Target;
  onSaved: (view: AiLibraryView) => void;
  onConflict: () => void;
}) {
  const { t } = useTranslation('ai-library');
  const [draft, setDraft] = React.useState<{ ko: string; en: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<'conflict' | 'save_failed' | null>(null);
  const hidden = item.state === 'HIDDEN';
  const save = async (change: { textKo?: string; textEn?: string; state?: 'ACTIVE' | 'HIDDEN' }) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await orpc.aiAssistant.updateLibraryItem({ ...target, itemId: item.id, expectedVersion: item.version, ...change }));
      setDraft(null);
    } catch (failure) {
      const conflict = toApiError(failure).code === 'CONTENT_EDIT_CONFLICT';
      setError(conflict ? 'conflict' : 'save_failed');
      if (conflict) {
        setDraft(null);
        onConflict();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={cn('rounded-lg border border-border px-4 py-3', hidden && 'bg-canvas')} data-testid="ai-library-item">
      <p className="flex flex-wrap items-center gap-2 text-[12px] text-sub">
        {item.label ? <span className="font-bold text-ink">{item.label}</span> : null}
        <span>{t(`item_state.${item.state}`)} · {t(`origin.${item.origin}`)}</span>
        {item.reports ? <span className="rounded-full bg-danger/10 px-2 py-0.5 font-semibold text-danger">{t('reports', { count: item.reports })}</span> : null}
      </p>
      {draft ? (
        <div className="mt-2 space-y-2">
          <label className="block text-[12.5px] font-semibold">
            {t('ko')}
            <textarea className={fieldClass} lang="ko" maxLength={AI_LIBRARY_TEXT_MAX} onChange={(event) => setDraft({ ...draft, ko: event.target.value })} rows={2} value={draft.ko} />
          </label>
          <label className="block text-[12.5px] font-semibold">
            {t('en')}
            <textarea className={fieldClass} lang="en" maxLength={AI_LIBRARY_TEXT_MAX} onChange={(event) => setDraft({ ...draft, en: event.target.value })} rows={2} value={draft.en} />
          </label>
        </div>
      ) : (
        <div className="mt-1 space-y-1 text-[14px] leading-6">
          <p lang="ko">{item.textKo}</p>
          <p className="text-sub" lang="en">{item.textEn}</p>
        </div>
      )}
      {item.wrongProgram ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[12.5px] text-sub">{t('wrong_program')}</summary>
          <Code>{item.wrongProgram}</Code>
        </details>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger" role="alert">{t(error)}</p> : null}
      {editable && item.state !== 'CHECKING' ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {draft ? (
            <>
              <button className={secondaryButtonClass} disabled={busy || !draft.ko.trim() || !draft.en.trim()} onClick={() => void save({ textKo: draft.ko.trim(), textEn: draft.en.trim() })} type="button">
                {t(busy ? 'saving' : 'save')}
              </button>
              <button className={secondaryButtonClass} disabled={busy} onClick={() => { setDraft(null); setError(null); }} type="button">{t('cancel')}</button>
            </>
          ) : (
            <>
              <button className={secondaryButtonClass} disabled={busy} onClick={() => setDraft({ ko: item.textKo, en: item.textEn })} type="button">{t('edit')}</button>
              <button className={secondaryButtonClass} disabled={busy} onClick={() => void save({ state: hidden ? 'ACTIVE' : 'HIDDEN' })} type="button">{t(hidden ? 'restore' : 'hide')}</button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function Dropped({ items }: { items: AiLibraryItemView[] }) {
  const { t } = useTranslation('ai-library');
  if (!items.length) return null;
  return (
    <details className="rounded-lg border border-border px-4 py-3">
      <summary className="cursor-pointer text-[13.5px] font-semibold">{t('dropped', { count: items.length })}</summary>
      <ul className="mt-2 space-y-2 text-[13px]">
        {items.map((item) => (
          <li key={item.id}>
            <span className="text-[12px] font-semibold text-sub">{dropReason(t, item.rejectReason)}</span>
            <p lang="ko">{item.textKo}</p>
          </li>
        ))}
      </ul>
    </details>
  );
}

const knownReasons = ['SIZE', 'LINK', 'LANGUAGE', 'CODE', 'SOLUTION', 'WRONG_PASSES', 'NOT_RUN', 'NO_REVIEW', 'TOO_FEW', 'EXTRA'] as const;

/** Why the checks dropped an item, in words; the second check's own reason is quoted. */
function dropReason(t: TFunction<'ai-library'>, reason: string | null): string {
  if (reason?.startsWith('REVIEW: ')) return t('reason.review', { reason: reason.slice('REVIEW: '.length) });
  const known = knownReasons.find((code) => code === reason);
  return known ? t(`reason.${known}`) : t('reason.other', { code: reason ?? '—' });
}

function Mistakes({ view }: { view: AiLibraryView }) {
  const { t } = useTranslation('ai-library');
  const { mistakes } = view;
  const label = (id: string) => view.items.find((item) => item.id === id)?.label || '—';
  return (
    <section className="border-t border-border pt-4">
      <h3 className="text-[14px] font-bold">{t('mistakes.title')}</h3>
      {mistakes.failures === 0 ? <p className="mt-1 text-[13.5px] text-sub">{t('mistakes.none')}</p> : (
        <div className="mt-1 space-y-3 text-[13.5px]">
          <p className="text-sub">{t('mistakes.failures', { count: mistakes.failures })} · {t('mistakes.students', { count: mistakes.students })}</p>
          <Counts heading={t('mistakes.python')} rows={mistakes.pythonErrors.map((row) => ({ ...row, key: row.type, name: row.type }))} />
          <Counts heading={t('mistakes.library')} rows={mistakes.library.map((row) => ({ ...row, key: row.itemId, name: label(row.itemId) }))} />
          {mistakes.unmatched ? <p className="text-sub">{t('mistakes.unmatched', { total: mistakes.unmatched })}</p> : null}
        </div>
      )}
    </section>
  );
}

function Counts({ heading, rows }: { heading: string; rows: { key: string; name: string; count: number; students: number }[] }) {
  const { t } = useTranslation('ai-library');
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[12.5px] font-semibold text-sub">{heading}</p>
      <ul className="mt-1 divide-y divide-border">
        {rows.map((row) => (
          <li className="flex items-center justify-between gap-3 py-1.5" key={row.key}>
            <span className="min-w-0 truncate font-semibold">{row.name}</span>
            <span className="shrink-0 tabular-nums text-sub">{t('mistakes.times', { count: row.count })} · {t('mistakes.students', { count: row.students })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="mt-1 overflow-x-auto rounded-lg bg-canvas px-3 py-2 font-mono text-[12.5px] leading-5">{children}</pre>;
}
