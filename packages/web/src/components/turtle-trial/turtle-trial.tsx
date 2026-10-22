'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Image from 'next/image';
import { ArrowRight, Play, Square, Turtle, X } from 'lucide-react';
import { turtleHelperVersion, turtleRunning, turtleStarters, type TurtleBootstrap, type TurtleSession, type TurtleStarterId } from '@cove/shared';
import { CodeEditor } from '@/components/editor/code-editor';
import { GuiViewer } from '@/components/manual/gui-viewer';
import { turtleRequest, TurtleRequestError } from '@/lib/turtle-trial/client';
import { initialTurtleDraft, parseTurtleDraft, turtleDraftKey, turtleErrorHint, type TurtleDraft } from '@/lib/turtle-trial/drafts';
import { LanguageControl } from '@/components/studio/language-control';
import { useTurtleTranslation } from './use-turtle-translation';
import { TurtleOptions } from './turtle-options';
import styles from './turtle-trial.module.css';

const help = [
  ["TForward(100)", "help_forward"],
  ["TLeft(90)", "help_left"],
  ["color(\"red\")", "help_color"],
  ["speed(0)", "help_speed"],
  ["randint(1, 20)", "help_random"],
  ["print(123)", "help_print"],
  ["ReadyToRace()", "help_race"],
  ["BlueForward(20)", "help_racer_forward"],
  ["BlueLeft(10)", "help_racer_left"],
  ["BlueX()", "help_racer_x"],
] as const;

function TurtleBrand({ campus }: { campus: string }) {
  return <div className={styles.brand}>
    {/* The supplied Coveedu lockup, also used by the home site. */}
    <Image src="/brand/coveedu-logo.svg" width={894} height={281} alt="COVE edu" className={styles.brandLogo} loading="eager" />
    <span className={styles.campus}>{campus}</span>
  </div>;
}

function SplitHandle({ vertical = false, value, onChange, label }: { vertical?: boolean; value: number; onChange: (n: number) => void; label: string }) {
  return <div role="separator" aria-label={label} aria-orientation={vertical ? 'horizontal' : 'vertical'} aria-valuenow={value} aria-valuemin={20} aria-valuemax={80}
    tabIndex={0} className={vertical ? styles.horizontalHandle : styles.handle}
    onKeyDown={e => { if (['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(e.key)) { e.preventDefault(); onChange(Math.min(80, Math.max(20, value + (['ArrowRight', 'ArrowUp'].includes(e.key) ? 5 : -5)))); } }}
    onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
    onPointerMove={e => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      const rect = e.currentTarget.parentElement!.getBoundingClientRect();
      onChange(Math.min(80, Math.max(20, vertical ? 100 - (e.clientY - rect.top) / rect.height * 100 : (e.clientX - rect.left) / rect.width * 100)));
    }} />;
}

export function TurtleTrial({ enabled }: { enabled: boolean }) {
  const { t } = useTurtleTranslation();
  const [draft, setDraft] = useState<TurtleDraft>(initialTurtleDraft);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [access, setAccess] = useState<boolean | null>(enabled ? null : false);
  const [loading, setLoading] = useState(enabled);
  const [nonceReady, setNonceReady] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [session, setSession] = useState<TurtleSession | null>(null);
  const [retainedFrame, setRetainedFrame] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [mobileTab, setMobileTab] = useState('code');
  const [split, setSplit] = useState(50);
  const [consoleSize, setConsoleSize] = useState(30);
  const [theme, setTheme] = useState<'paircode-dark' | 'light'>('paircode-dark');
  const [input, setInput] = useState('');
  const workspace = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const lastFrame = useRef('');
  const keepFrame = useCallback((frame: string) => { lastFrame.current = frame; }, []);
  const pendingRun = useRef<{ source: string; starterId: TurtleStarterId; helperVersion: typeof turtleHelperVersion; requestKey: string } | null>(null);
  const runGeneration = useRef(0);
  const mounted = useRef(false);
  const source = draft.buffers[draft.starter];
  const running = turtleRunning(session);
  const hint = turtleErrorHint(session?.output ?? '');

  const handleError = useCallback((e: unknown) => {
    const code = e instanceof Error ? e.message : '';
    const messages: Record<string, string> = {
      INVALID_PIN: t('error_invalid_pin'),
      ACCESS_EXPIRED: t('error_access_expired'),
      RUN_CONFLICT: t('error_run_conflict'),
      SOURCE_TOO_LARGE: t('error_source_too_large'),
      HELPERS_CHANGED: t('error_helpers_changed'),
      CHALLENGE_EXPIRED: t('error_challenge_expired'),
      RUN_LIMIT: t('error_run_limit'),
      RUNTIME_BUSY: t('error_runtime_busy'),
      RATE_LIMITED: t('error_rate_limited'),
      RUN_ENDED: t('error_run_ended'),
    };
    setError(messages[code] ?? t('error_connection'));
    if (e instanceof TurtleRequestError && e.retryAfter) setRetryUntil(Date.now() + e.retryAfter * 1000);
    if (e instanceof TurtleRequestError && e.status === 401 && code !== 'INVALID_PIN' && code !== 'CHALLENGE_EXPIRED') {
      setAccess(false); setSession(null); setNonceReady(false);
      void turtleRequest('challenge').then(() => setNonceReady(true)).catch(() => {});
    }
  }, [t]);
  const viewerError = useCallback((text: string) => setError(text), []);
  async function challenge() {
    try { await turtleRequest('challenge'); setNonceReady(true); setError(''); } catch (e) { handleError(e); }
  }
  async function bootstrap() {
    setLoading(true);
    try {
      const result = await turtleRequest<TurtleBootstrap | null>('bootstrap');
      if (!result) { setAccess(false); await challenge(); return; }
      setAccess(true); setSession(result.session); setError('');
    } catch (e) {
      if (e instanceof TurtleRequestError && e.status === 401) {
        setAccess(false); await challenge();
      } else handleError(e);
    } finally { setLoading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    // Browser-only storage is read after hydration, never during server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { setDraft(parseTurtleDraft(sessionStorage.getItem(turtleDraftKey))); } catch { setSaved(false); }
    setHydrated(true);
    if (enabled) void bootstrap();
    return () => { mounted.current = false; };
    // Initial guest bootstrap does not depend on subsequent editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      try { sessionStorage.setItem(turtleDraftKey, JSON.stringify(draft)); setSaved(true); } catch { setSaved(false); }
    }, 500);
    return () => clearTimeout(timer);
  }, [draft, hydrated]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!session?.id || !running || busy) return;
    const generation = runGeneration.current;
    let cancelled = false; let inFlight = false; let failed = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void turtleRequest<TurtleSession>('runs/' + session.id).then(next => {
        if (!cancelled && generation === runGeneration.current) {
          if (failed) { setError(''); failed = false; }
          if (!turtleRunning(next)) snapshot();
          setSession(next);
        }
      }).catch(e => {
        if (!cancelled && generation === runGeneration.current) {
          failed = true;
          handleError(e);
          if (e instanceof TurtleRequestError && [401, 404].includes(e.status)) setSession(old => old ? { ...old, state: 'DISCONNECTED' } : null);
        }
      }).finally(() => { inFlight = false; });
    }, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session?.id, running, busy, handleError]);

  async function enter(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await turtleRequest('access', 'POST', { pin }); setPin(''); await bootstrap(); }
    catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function snapshot() {
    try { const canvas = drawing.current?.querySelector('canvas'); if (canvas) lastFrame.current = canvas.toDataURL(); } catch { /* Keep the last frame if the viewer has already gone. */ }
    if (lastFrame.current) setRetainedFrame(lastFrame.current);
  }
  async function stop(clear = false) {
    if (busy) return false;
    runGeneration.current++;
    snapshot(); setBusy(true); setError('');
    try {
      if (session) await turtleRequest('runs/' + session.id, 'DELETE');
      setSession(old => clear ? null : old ? { ...old, state: 'STOPPED' } : null);
      pendingRun.current = null;
      if (clear) { setRetainedFrame(''); lastFrame.current = ''; setInput(''); }
      return true;
    } catch (e) { handleError(e); return false; } finally { setBusy(false); }
  }
  async function changeStarter(starter: TurtleStarterId) {
    if (busy || starter === draft.starter) return;
    // Retire the previous example before associating the editor with another
    // buffer. stop also invalidates in-flight polls and clears retained frames.
    if (!await stop(true)) return;
    setDraft(d => ({ ...d, starter }));
    setMobileTab('code');
  }
  async function run() {
    if (busy) return;
    runGeneration.current++;
    snapshot();
    setBusy(true); setError('');
    pendingRun.current ??= { source, starterId: draft.starter, helperVersion: turtleHelperVersion, requestKey: crypto.randomUUID() };
    try {
      // Run starts a fresh drawing, including when the previous drawing is still open.
      if (running && session) await turtleRequest('runs/' + session.id, 'DELETE');
      const next = await turtleRequest<TurtleSession>('runs', 'POST', pendingRun.current);
      if (mounted.current) {
        lastFrame.current = ''; setRetainedFrame(''); setSession(next); setMobileTab('drawing');
      }
      pendingRun.current = null;
    } catch (e) {
      handleError(e);
      if (e instanceof TurtleRequestError && e.status < 500) pendingRun.current = null;
    } finally { setBusy(false); }
  }
  async function exit() {
    runGeneration.current++;
    setBusy(true);
    try {
      await turtleRequest('access', 'DELETE');
      try { sessionStorage.removeItem(turtleDraftKey); } catch { /* Exit must work when browser storage is blocked. */ }
      setDraft(initialTurtleDraft()); setSession(null);
      setAccess(false); setRetainedFrame(''); setError(''); pendingRun.current = null;
      await challenge();
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function sendInput(e: FormEvent) {
    e.preventDefault(); if (!session || busy) return;
    try { await turtleRequest('runs/' + session.id + '/input', 'POST', { text: input }); setInput(''); }
    catch (e) { handleError(e); }
  }
  function reset() {
    if (!window.confirm(t('replace_this_starter_s_code_with_the_original'))) return;
    pendingRun.current = null;
    setDraft(d => ({ ...d, buffers: { ...d.buffers, [d.starter]: turtleStarters[d.starter] } }));
  }
  async function fullscreen(element: HTMLElement | null) {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element?.requestFullscreen(); }
    catch { setError(t('fullscreen_is_unavailable_in_this_browser')); }
  }
  function download(bytes: BlobPart, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([bytes], { type })); const a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function project() {
    try {
      const response = await fetch('/turtle/api/project', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cove-Turtle': '1' }, body: JSON.stringify({ source }) });
      if (!response.ok) { const body = await response.json(); throw new TurtleRequestError(body.message, response.status); }
      download(await response.arrayBuffer(), 'cove-turtle.zip', 'application/zip');
    } catch (e) { handleError(e); }
  }
  const retry = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  const status = session ? ({ QUEUED: t('waiting_for_a_drawing_space'), STARTING: t('preparing_your_turtle'), RUNNING: t('running_your_code'), DISPLAYING: t('your_drawing_is_ready'), WAITING_INPUT: t('waiting_for_your_input'), STOPPED: t('stopped'), TIMED_OUT: t('time_is_up_you_can_run_again'), ERROR: t('check_your_code'), OUTPUT_LIMIT: t('stopped_because_output_was_too_large'), QUEUE_EXPIRED: t('the_queue_expired_please_run_again'), DISCONNECTED: t('disconnected_please_run_again') } as Record<string, string>)[session.state] ?? session.state : t('write_some_code_and_press_run');

  if (access === null || (loading && !access)) return <main className={styles.workspace} aria-busy={loading} data-testid="turtle-restoring">
    <header className={styles.header}><TurtleBrand campus={t('mapo_campus')} /></header>
    <div className={styles.restoring} role="status">{error ? <div><p className={styles.error}>{error}</p><button type="button" className={styles.textButton} disabled={loading} onClick={() => void bootstrap()}>{t('refresh_access')}</button></div> : t('connecting_loading')}</div>
  </main>;

  if (!access) return <main className={styles.gate}>
    <div className={styles.gateHeader}><TurtleBrand campus={t('mapo_campus')} /><LanguageControl /></div>
    <div className={styles.gateGrid}>
      <section className={styles.intro}>
        <span className={styles.eyebrow}>{t('your_first_drawing_with_code')}</span>
        <h1>{t('a_little_code')}<br />{t('a_lot_of_imagination')}</h1>
        <p>{t('draw_shapes_with_a_turtle_then_build_a')}</p>
        <div className={styles.preview} aria-hidden="true"><code><b>TForward</b>(100)<br /><b>TLeft</b>(90)</code><div className={styles.square}><Turtle size={32} /></div></div>
      </section>
      <section className={styles.accessCard} aria-labelledby="trial-title">
        <Turtle className={styles.cardTurtle} size={38} /><h2 id="trial-title">{t('try_python_turtle')}</h2>
        <p>{t('enter_the_six_digit_code_from_your_teacher')}</p>
        {enabled ? <form onSubmit={enter}>
          <label htmlFor="turtle-pin">{t('classroom_code')}</label>
          <input id="turtle-pin" autoComplete="off" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} disabled={loading || busy || !nonceReady} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="······" required aria-describedby={error ? 'trial-error' : undefined} />
          <button className={styles.primary} disabled={busy || loading || !nonceReady || pin.length !== 6 || retry > 0} type="submit">{loading || busy ? t('connecting_loading') : t('start_drawing')}<ArrowRight size={18} /></button>
        </form> : <p role="status">{t('the_classroom_is_not_open_yet_please_ask')}</p>}
        {error && <p id="trial-error" className={styles.error} role="alert">{error}{retry > 0 && ` (${retry}s)`}</p>}
        {enabled && (!nonceReady || error) && <button type="button" className={styles.textButton} onClick={() => { setError(''); void challenge(); }}>{t('refresh_access')}</button>}
        <div className={styles.gateNote}>{t('start_without_creating_an_account')}</div>
      </section>
    </div>
    <footer className={styles.gateFooter}>COVE · {t('the_joy_of_thinking_the_joy_of_making')}</footer>
  </main>;

  return <main className={styles.workspace} ref={workspace}>
    <header className={styles.header}>
      <TurtleBrand campus={t('mapo_campus')} />
      <div className={styles.headerActions}>
        <LanguageControl />
        <TurtleOptions starter={draft.starter} font={draft.font} saved={saved} busy={busy}
          onStarterChange={starter => void changeStarter(starter)}
          onFontChange={font => setDraft(d => ({ ...d, font }))}
          onReset={reset} onHelp={() => setShowHelp(true)}
          onDownload={() => download(source, 'main.py', 'text/x-python')}
          onProject={() => void project()} onFullscreen={() => void fullscreen(workspace.current)} onExit={() => void exit()} />
      </div>
    </header>
    <nav className={styles.toolbar} aria-label={t('execution_controls')}>
      <button type="button" className={styles.run} disabled={busy || retry > 0} onClick={() => void run()}><Play size={13} fill="currentColor" />{busy ? t('please_wait') : t('run')}</button>
      <button type="button" onClick={() => setTheme(value => value === 'light' ? 'paircode-dark' : 'light')}>{theme === 'light' ? t('dark') : t('light')}</button>
      <button type="button" onClick={() => void stop(true)} disabled={busy}>{t('clear')}</button>
      {running && <button type="button" className={styles.stop} disabled={busy} onClick={() => void stop()}><Square size={11} fill="currentColor" />{t('stop')}</button>}
      <span className={styles.runStatus} role="status">{busy ? t('preparing_your_turtle_loading') : session && session.state !== 'DISPLAYING' && session.state !== 'STOPPED' ? status : ''}</span>
    </nav>
    {error && <div className={styles.errorBar} role="alert">{error}{retry > 0 && ` (${retry}s)`}<button type="button" aria-label={t('dismiss')} onClick={() => setError('')}><X size={16} /></button></div>}
    <nav className={styles.mobileTabs} aria-label={t('workspace')} role="tablist">{[['code', t('code')], ['drawing', t('drawing')], ['output', t('output')]].map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={mobileTab === id} onClick={() => setMobileTab(id!)}>{name}</button>)}</nav>
    <div className={styles.panes} style={{ '--editor': split + '%' } as CSSProperties}>
      <section className={styles.editor} data-visible={mobileTab === 'code'} aria-label={t('python_code')}>
        <CodeEditor code={source} fontSize={draft.font} theme={theme} onChange={value => { setSaved(false); setDraft(d => ({ ...d, buffers: { ...d.buffers, [d.starter]: value } })); }} />
      </section>
      <SplitHandle value={split} onChange={n => setSplit(Math.min(70, Math.max(30, n)))} label={t('resize_code_and_drawing')} />
      <div className={styles.results} style={{ gridTemplateRows: `minmax(0,${100 - consoleSize}fr) 6px minmax(0,${consoleSize}fr)` }}>
        <section className={styles.drawing} data-visible={mobileTab === 'drawing'} aria-label={t('drawing')} ref={drawing}>
          {retainedFrame ? <Image src={retainedFrame} width={1024} height={640} unoptimized alt={t('last_turtle_drawing')} className={styles.frame} /> : !busy && running && session && session.state !== 'QUEUED' ? <GuiViewer session={session} minimal onFrame={keepFrame} onError={viewerError} /> : <div className={styles.empty}><span className="sr-only">{session?.state === 'QUEUED' ? t('your_code_starts_when_a_drawing_space_is') : t('write_code_on_the_left_then_press_run')}</span></div>}
        </section>
        <SplitHandle vertical value={consoleSize} onChange={setConsoleSize} label={t('resize_output')} />
        <section className={styles.console} data-visible={mobileTab === 'output'} aria-label={t('output')}>
          {hint.key && <p className={styles.hint}>{hint.line && `${t('line')} ${hint.line} · `}{t(hint.key)}</p>}
          {hint.key ? <details><summary>{t('python_error_details')}</summary><pre>{session?.output}</pre></details> : <pre aria-live="polite">{session?.output}</pre>}
          {session?.state === 'WAITING_INPUT' && <form onSubmit={sendInput}><input aria-label={t('program_input')} value={input} onChange={e => setInput(e.target.value)} /><button type="submit">{t('send')}</button></form>}
        </section>
      </div>
    </div>
    {showHelp && <aside className={styles.help} aria-label={t('command_reference')}><header><h2>{t('your_command_reference')}</h2><button type="button" onClick={() => setShowHelp(false)} aria-label={t('close_help')}><X size={20} /></button></header><p>{t('command_names_are_case_sensitive_remember_the_parentheses')}</p>{help.map(([command, key]) => <div key={command}><code>{command}</code><p>{t(key)}</p></div>)}<p><code>TForward(100)</code> → <code>turtle.forward(100)</code></p></aside>}
  </main>;
}
