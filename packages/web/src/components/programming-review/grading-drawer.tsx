'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, X } from 'lucide-react';
import type { TeacherSubmissionReview } from '@cove/shared';
import { formatDateTime } from '@cove/i18n/format';
import { useLocale } from '@/i18n';
import { Sheet, SheetContent, SheetTrigger } from '@/components/studio/primitives';
import { ProgrammingGradingPanel } from './grading-panel';
import { useReviewTranslation } from './use-review-translation';

export type GradingSnapshot = Pick<TeacherSubmissionReview,
  'submissionId' | 'materialId' | 'membershipId' | 'studentName' | 'problemTitle' | 'code' | 'manualAssessment' | 'canPublishManualReview'> & {createdAt: string | null};
export type RegisterGradingGuard = (guard: (() => boolean) | null) => void;

/** The opened snapshot stays pinned while live code, material or latest receipt changes. */
export function ProgrammingGradingDrawer({
  academyId, classId, review, active = true, onRegisterGuard, onOpenStateChange,
}: {
  academyId: string;
  classId: string;
  review: GradingSnapshot | null;
  active?: boolean;
  onRegisterGuard?: RegisterGradingGuard;
  onOpenStateChange?: (open: boolean) => void;
}) {
  const t = useReviewTranslation(), locale = useLocale();
  const [snapshot, setSnapshot] = useState<GradingSnapshot | null>(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const dirty = useRef(false), saving = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null), contentRef = useRef<HTMLDivElement>(null);
  const setDirty = useCallback((value: boolean) => { dirty.current = value; }, []);
  const setSaving = useCallback((value: boolean) => { saving.current = value; }, []);
  const prepareLeave = useCallback(() => {
    if (saving.current) return false;
    if (dirty.current && !window.confirm(t('unsaved_grade'))) return false;
    dirty.current = false;
    setOpen(false);
    setSnapshot(null);
    return true;
  }, [t]);
  useEffect(() => {
    onRegisterGuard?.(open ? prepareLeave : null);
    return () => onRegisterGuard?.(null);
  }, [onRegisterGuard, prepareLeave, open]);
  useEffect(() => {
    if (!open) return;
    const unload = (event: BeforeUnloadEvent) => {
      if (!(dirty.current || saving.current)) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [open]);
  useEffect(() => {
    onOpenStateChange?.(open);
    return () => onOpenStateChange?.(false);
  }, [open, onOpenStateChange]);
  const available = Boolean(active && review?.manualAssessment && review.canPublishManualReview);
  const openLatest = () => {
    if (!available || !review) return;
    setContainer(document.fullscreenElement as HTMLElement | null);
    setSnapshot(review); setOpen(true);
  };
  const newer = Boolean(snapshot && review?.manualAssessment && snapshot.materialId === review.materialId && snapshot.membershipId === review.membershipId && snapshot.submissionId !== review.submissionId);
  return (
    <Sheet modal={false} open={open} onOpenChange={next => { if (next) openLatest(); else prepareLeave(); }}>
      {available ? <SheetTrigger ref={triggerRef} type="button" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-brand/25 bg-brand-soft px-3 py-2 text-xs font-semibold text-brand hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand">
        <ClipboardCheck aria-hidden className="size-4" />{t(review?.manualAssessment?.state === 'GRADED' ? 'edit_grade' : 'grade_submission')}
      </SheetTrigger> : null}
      <SheetContent side="right" title={t('grade_submission')} description={t('saved_submission_hint')} portalContainer={container}
        className="w-[440px] max-w-[100vw] min-w-0 border-l border-border bg-card text-ink"
        data-testid="programming-grading-drawer" ref={contentRef}
        onCloseAutoFocus={event => {
          // Keep focus on a control the user chose while the close animation ran.
          const focused = document.activeElement;
          if (focused instanceof HTMLElement && focused !== document.body && focused !== triggerRef.current && !contentRef.current?.contains(focused)) event.preventDefault();
        }}
        onInteractOutside={event => event.preventDefault()}
        onEscapeKeyDown={event => { event.preventDefault(); event.stopPropagation(); prepareLeave(); }}>
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{t('grade_submission')}</h2>
            <p className="mt-1 truncate text-sm font-semibold" title={snapshot?.studentName}>{snapshot?.studentName}</p>
            <p className="mt-0.5 truncate text-xs text-sub" title={snapshot?.problemTitle}>{snapshot?.problemTitle}</p>
            {snapshot?.createdAt ? <p className="mt-1 text-xs text-sub">{formatDateTime(snapshot.createdAt, locale, true)}</p> : null}
          </div>
          <button type="button" aria-label={t('close_grading')} onClick={prepareLeave} className="rounded-lg p-2 text-sub hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand"><X aria-hidden className="size-4" /></button>
        </header>
        {newer ? <div role="status" className="shrink-0 border-b border-border bg-brand-soft px-5 py-3 text-xs leading-5">
          <p>{t('newer_submission')}</p>
          <button type="button" onClick={() => { if (prepareLeave()) openLatest(); }} className="mt-1 font-semibold text-brand underline">{t('grade_latest')}</button>
        </div> : null}
        {snapshot?.manualAssessment ? <>
          <details className="shrink-0 border-b border-border px-5 py-3">
            <summary className="cursor-pointer text-xs font-semibold text-brand">{t('view_submitted_code')}</summary>
            <p className="mt-2 text-xs leading-5 text-sub">{t('saved_submission_hint')}</p>
            <pre className="mt-2 max-h-[30vh] overflow-auto rounded-lg bg-editor-bg p-3 font-mono text-xs leading-5 text-white/85" data-testid="grading-submitted-code">{snapshot.code}</pre>
          </details>
          <ProgrammingGradingPanel key={snapshot.submissionId} academyId={academyId} classId={classId}
            submissionId={snapshot.submissionId} initial={snapshot.manualAssessment} canPublish={snapshot.canPublishManualReview ?? false}
            variant="sidebar" onDirtyChange={setDirty} onSavingChange={setSaving} />
        </> : null}
      </SheetContent>
    </Sheet>
  );
}
