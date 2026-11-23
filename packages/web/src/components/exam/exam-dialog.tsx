'use client';

import { X } from 'lucide-react';
import * as React from 'react';

/** The exam dialogs' frame: title, close, scrolling body, footer. Escape and the backdrop close it. */
export function Dialog({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-modal">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[18px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-sub hover:bg-surface hover:text-ink"><X aria-hidden className="size-5" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <div className="flex items-center gap-3 border-t border-border px-6 py-4">{footer}</div> : null}
      </div>
    </div>
  );
}
