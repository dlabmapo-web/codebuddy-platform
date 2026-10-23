'use client';

import { Check, CheckCircle2, Copy, FileCode2, LockKeyhole, Play, X } from 'lucide-react';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ManualConfig } from '@cove/shared';
import { Button } from '@/components/studio/button';
import { Modal, ModalContent, ModalTrigger } from '@/components/studio/primitives';
import { CodeEditor } from '@/components/editor/code-editor';
import { manualApi } from '@/lib/manual-api';
import { lessonAction } from '@/components/workspace/lesson-chrome';
import { useManualTranslation } from './use-manual-translation';

export function solutionFileNames(files: Record<string, string>, entryPoint: string) {
  const first = Object.hasOwn(files, entryPoint) ? entryPoint : Object.hasOwn(files, 'main.py') ? 'main.py' : undefined;
  return Object.keys(files).sort((a, b) => a === b ? 0 : a === first ? -1 : b === first ? 1 : a.localeCompare(b));
}

export function TurtleSolutionFiles({ config }: { config: ManualConfig }) {
  const { t } = useManualTranslation();
  const id = useId();
  const files = config.solutionFiles ?? {};
  const names = solutionFileNames(files, config.entryPoint);
  const [selected, setSelected] = useState(names[0]);
  const [copied, setCopied] = useState<string>();
  const [failed, setFailed] = useState<string>();
  const current = Object.hasOwn(files, selected ?? '') ? selected : names[0];
  if (!current) return <p className="p-6 text-sm text-sub">{t('ui.no_reference')}</p>;
  return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-editor-bg" data-testid="turtle-solution-files">
    <div className="flex shrink-0 items-center border-b border-white/15 bg-editor-bg text-white/75">
      <div role="tablist" aria-label={t('solution_files')} className="flex min-w-0 flex-1 overflow-x-auto">
        {names.map((name, index) => <button key={name} type="button" role="tab"
          id={`${id}-tab-${index}`} aria-selected={name === current} aria-controls={`${id}-code`} tabIndex={name === current ? 0 : -1}
          className="inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand aria-selected:border-brand aria-selected:bg-white/5 aria-selected:text-white"
          onClick={() => setSelected(name)}
          onKeyDown={event => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
            setSelected(names[next]); document.getElementById(`${id}-tab-${next}`)?.focus();
          }}><FileCode2 aria-hidden className="size-4 shrink-0" />{name}</button>)}
      </div>
      <button type="button" className="mx-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand"
        aria-label={t('copy_solution_file', { name: current })}
        onClick={async () => {
          try { await navigator.clipboard.writeText(files[current]); setCopied(current); setFailed(undefined); }
          catch { setFailed(current); setCopied(undefined); }
        }}>{copied === current ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}{t(copied === current ? 'copied' : 'copy')}</button>
    </div>
    <div id={`${id}-code`} role="tabpanel" aria-labelledby={`${id}-tab-${names.indexOf(current)}`} className="flex min-h-0 flex-1" data-testid="turtle-solution-code">
      <CodeEditor key={current} code={files[current]} fontSize={14} readOnly onChange={() => {}} />
    </div>
    {failed === current ? <p role="alert" className="border-t border-white/15 px-4 py-2 text-sm text-red-300">{t('copy_solution_failed')}</p> : null}
    <span role="status" className="sr-only">{copied === current ? t('copied') : ''}</span>
  </div>;
}

export function TurtleSolutionDialog({ academyId, materialId, title, onRun, runDisabled }: {
  academyId: string; materialId: string; title: string; onRun?: () => void; runDisabled?: boolean;
}) {
  const { t } = useManualTranslation();
  const [open, setOpen] = useState(false);
  const reference = useQuery({
    queryKey: ['manual-reference', academyId, materialId],
    queryFn: () => manualApi.read({ academyId, materialId, preview: true }),
    enabled: open, retry: false, staleTime: 0,
  });
  return <Modal open={open} onOpenChange={setOpen}>
    <ModalTrigger asChild><button type="button" className={lessonAction}><CheckCircle2 aria-hidden className="size-3.5" />{t('view_solution')}</button></ModalTrigger>
    <ModalContent title={t('view_solution')} description={title} className="h-[min(700px,90dvh)] max-w-4xl">
      <Button type="button" variant="ghost" size="icon" aria-label={t('close_solution')} className="absolute right-4 top-4" onClick={() => setOpen(false)}><X aria-hidden /></Button>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-6">
        <p className="flex items-center gap-2 text-xs text-sub"><LockKeyhole aria-hidden className="size-3.5 shrink-0" />{t('ui.staff_reference_notice')}</p>
        {reference.isPending ? <p role="status" className="grid flex-1 place-items-center text-sm text-sub">{t('loading_activity')}</p>
          : reference.isError ? <div className="grid flex-1 content-center justify-items-center gap-3"><p role="alert" className="text-sm text-danger">{t('ui.reference_unavailable')}</p><Button variant="outline" onClick={() => void reference.refetch()}>{t('retry_reference')}</Button></div>
          : reference.data ? <TurtleSolutionFiles config={reference.data.config} /> : null}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-4 sm:px-6">
        {onRun && reference.data?.config.solutionFiles && Object.keys(reference.data.config.solutionFiles).length > 0 ? <Button variant="outline" disabled={runDisabled || reference.isError} onClick={() => { setOpen(false); onRun(); }}><Play aria-hidden />{t('run_solution')}</Button> : null}
        <Button onClick={() => setOpen(false)}>{t('close')}</Button>
      </div>
    </ModalContent>
  </Modal>;
}
