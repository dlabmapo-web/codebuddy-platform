'use client';

import Link from 'next/link';
import { ArrowLeft, CircleAlert, FileQuestion, RefreshCw } from 'lucide-react';
import { useLayoutTranslation } from '@/i18n';
import { isMaterialUnavailable } from '@/lib/material-read';

export function MaterialReadFailure({ error, unavailable = false, retry, retrying = false, embedded = false, backHref }: {
  error?: unknown;
  unavailable?: boolean;
  retry?: () => void;
  retrying?: boolean;
  embedded?: boolean;
  backHref?: string;
}) {
  const { t } = useLayoutTranslation('common');
  const missing = unavailable || isMaterialUnavailable(error);
  const Icon = missing ? FileQuestion : CircleAlert;
  return (
    <div className={`grid ${embedded ? 'min-h-full' : 'min-h-dvh'} place-items-center bg-canvas p-6 text-ink`}>
      <section role="alert" className="w-full max-w-md rounded-card border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-5 grid size-12 place-items-center rounded-xl bg-brand-soft text-brand"><Icon aria-hidden className="size-6" /></span>
        <h1 className="text-xl font-bold">{t(missing ? 'material_load.unavailable_title' : 'material_load.failed_title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-sub">{t(missing ? 'material_load.unavailable_body' : 'material_load.failed_body')}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {backHref ? <Link className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" href={backHref}><ArrowLeft aria-hidden className="size-4" />{t('material_load.back')}</Link> : null}
          {!missing && retry ? <button type="button" disabled={retrying} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={retry}><RefreshCw aria-hidden className="size-4" />{t('action.try_again')}</button> : null}
        </div>
      </section>
    </div>
  );
}
