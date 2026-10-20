import { ArrowRight, Braces, Check, ClipboardList, FileCode2, FileText, ListChecks, PenLine, Plus, Turtle, Video, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent, ModalTrigger } from '@/components/studio/primitives';
import type { MaterialCreationKind } from '../_lib/material-creation';

const icons = {
  python: Braces,
  pdfPractice: FileCode2,
  pdf: FileText,
  written: PenLine,
  turtle: Turtle,
  multipleChoice: ListChecks,
  shortAnswer: ClipboardList,
  video: Video,
};

/** Choose the material first; the existing authoring flow handles its content. */
export function NewMaterialDialog({ kinds, lectureTitle, onChoose }: {
  kinds: readonly MaterialCreationKind[];
  lectureTitle: string;
  onChoose: (kind: MaterialCreationKind) => void;
}) {
  const { t } = useTranslation('material-picker');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MaterialCreationKind | null>(null);
  const pendingChoice = useRef<MaterialCreationKind | null>(null);
  const groupId = useId();
  const validSelection = selected !== null && kinds.includes(selected) ? selected : null;
  if (!kinds.length) return null;

  return (
    <Modal open={open} onOpenChange={(next) => {
      if (next) setSelected(null);
      setOpen(next);
    }}>
      <ModalTrigger asChild>
        <button type="button" className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-medium text-sub transition-colors hover:border-brand/30 hover:bg-brand-soft hover:text-brand data-[state=open]:border-brand/30 data-[state=open]:bg-brand-soft data-[state=open]:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
          <Plus aria-hidden className="size-3.5 text-brand" />
          {t('title')}
        </button>
      </ModalTrigger>
      <ModalContent
        title={t('title')}
        description={t('description', { lecture: lectureTitle })}
        className="max-w-2xl"
        onCloseAutoFocus={(event) => {
          if (pendingChoice.current) {
            event.preventDefault();
            const kind = pendingChoice.current;
            pendingChoice.current = null;
            onChoose(kind);
          }
        }}
      >
        <button type="button" aria-label={t('close')} onClick={() => setOpen(false)} className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
          <X aria-hidden className="size-5" />
        </button>
        <fieldset className="min-h-0 overflow-y-auto bg-canvas/70 p-5 sm:p-6">
          <legend className="sr-only">{t('choose')}</legend>
          <div className={`grid grid-cols-2 gap-3 ${kinds.length > 4 ? 'sm:grid-cols-3' : ''}`}>
            {kinds.map((kind) => {
              const Icon = icons[kind];
              const active = validSelection === kind;
              return (
                <label key={kind} className="relative cursor-pointer">
                  <input className="peer sr-only" type="radio" name={groupId} value={kind} checked={active} onChange={() => setSelected(kind)} />
                  <span className={`flex h-full min-h-40 flex-col items-center rounded-xl border p-4 text-center transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${active ? 'border-brand bg-brand-soft shadow-sm' : 'border-border bg-card hover:border-brand/40 hover:bg-brand-soft/40'}`}>
                    <span className={`mb-3 grid size-11 place-items-center rounded-xl ${active ? 'bg-brand text-white' : 'bg-brand-soft text-brand'}`}>
                      <Icon aria-hidden className="size-6" strokeWidth={1.7} />
                    </span>
                    <span className={`text-sm font-semibold ${active ? 'text-brand' : 'text-ink'}`}>{t(`types.${kind}.title`)}</span>
                    <span className="mt-1.5 text-xs leading-relaxed text-sub">{t(`types.${kind}.description`)}</span>
                    {active ? <Check aria-hidden className="absolute right-3 top-3 size-4 text-brand" /> : null}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-border px-4 text-sm font-semibold text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand">{t('cancel')}</button>
          <button type="button" disabled={!validSelection} onClick={() => {
            if (!validSelection) return;
            pendingChoice.current = validSelection;
            setOpen(false);
          }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40">
            {t('next')}<ArrowRight aria-hidden className="size-4" />
          </button>
        </div>
      </ModalContent>
    </Modal>
  );
}
