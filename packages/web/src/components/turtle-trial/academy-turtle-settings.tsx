'use client';

import { useEffect, useState } from 'react';
import type { AcademyTurtlePinState } from '@cove/shared';
import { Button } from '@/components/studio/button';
import { Modal, ModalContent, ModalTrigger } from '@/components/studio/primitives';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';
import { useTurtleTranslation } from './use-turtle-translation';

// Mount with academyId as key: plaintext never survives an academy change.
export function AcademyTurtleSettings({ academyId }: { academyId: string }) {
  const { t } = useTurtleTranslation();
  const [state, setState] = useState<AcademyTurtlePinState | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void orpc.academyTurtle.state({ academyId }).then(next => {
      if (!cancelled) setState(next);
    }).catch(() => { if (!cancelled) setError(t('manager_error')); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [academyId, refresh, t]);
  function failed(e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? e.code : '';
    setError(t(code === 'CONFLICT' ? 'manager_conflict' : code === 'TOO_MANY_REQUESTS' ? 'error_rate_limited' : 'manager_error'));
    setPin('');
  }
  async function generate() {
    if (busy || !state?.available) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await orpc.academyTurtle.generate({ academyId, expectedVersion: state.current?.version ?? null });
      setState({ available: true, current: result.current }); setPin(result.pin); setConfirm(false);
      setNotice(t('manager_generated'));
    } catch (e) { failed(e); } finally { setBusy(false); }
  }
  async function reveal() {
    if (pin) { setPin(''); return; }
    if (busy || !state?.current) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await orpc.academyTurtle.reveal({ academyId, expectedVersion: state.current.version });
      setPin(result.pin);
    } catch (e) { failed(e); } finally { setBusy(false); }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setNotice(t('manager_copied')); setError(''); }
    catch { setError(t('manager_copy_error')); }
  }
  function reload() { setPin(''); setError(''); setNotice(''); setBusy(true); setRefresh(n => n + 1); }
  return <section aria-labelledby="turtle-access-heading" className="mt-8 rounded-card border border-border bg-card p-5 sm:p-6">
    <h2 id="turtle-access-heading" className="text-lg font-bold">{t('manager_title')}</h2>
    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-sub">{t('manager_description')}</p>
    {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    {state && !state.available && <p className="mt-4 text-sm text-sub">{t('manager_unavailable')}</p>}
    {state?.available && <>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <output aria-label={t('manager_code')} className="min-w-48 rounded-lg border border-border bg-canvas px-5 py-3 font-mono text-3xl font-bold tracking-[.25em]">{state.current ? pin || '••••••' : '—'}</output>
        <p className="max-w-md text-sm leading-relaxed text-sub">{state.current ? t('manager_active') : t('manager_empty')}</p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {!state.current ? <Button disabled={busy} onClick={() => void generate()}>{t('manager_generate')}</Button> : <>
          <Button variant="outline" disabled={busy} onClick={() => void reveal()}>{t(pin ? 'manager_hide' : 'manager_show')}</Button>
          <Button variant="outline" disabled={busy || !pin} onClick={() => void copy(pin)}>{t('manager_copy')}</Button>
          <Modal open={confirm} onOpenChange={next => { if (!busy) { setConfirm(next); setError(''); } }}>
            <ModalTrigger asChild><Button variant="outline" disabled={busy}>{t('manager_replace')}</Button></ModalTrigger>
            <ModalContent title={t('manager_replace')} description={t('manager_replace_description')}>
              <div className="p-6">
                {error && <p role="alert" className="mb-4 text-sm text-danger">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>{t('manager_cancel')}</Button>
                  <Button disabled={busy} onClick={() => void generate()}>{t(busy ? 'please_wait' : 'manager_replace')}</Button>
                </div>
              </div>
            </ModalContent>
          </Modal>
        </>}
        <Button variant="ghost" disabled={busy} onClick={() => void copy(new URL(routes.turtle, window.location.origin).href)}>{t('manager_copy_link')}</Button>
        <Button variant="ghost" asChild><a href={routes.turtle} target="_blank" rel="noreferrer">{t('manager_open')}</a></Button>
      </div>
    </>}
    {busy && <p role="status" className="mt-3 text-sm text-sub">{t('please_wait')}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-brand">{notice}</p>}
    <Button variant="link" disabled={busy} className="mt-2 px-0" onClick={reload}>{t('manager_refresh')}</Button>
  </section>;
}
