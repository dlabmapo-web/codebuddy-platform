'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import Image from 'next/image';
import { ArrowRight, BookOpen, Download, Eraser, Maximize2, Play, RotateCcw, Square, Turtle, X } from 'lucide-react';
import { turtleHelperVersion, turtleRunning, turtleStarters, type TurtleBootstrap, type TurtleSession, type TurtleStarterId } from '@cove/shared';
import { CodeEditor } from '@/components/editor/code-editor';
import { GuiViewer } from '@/components/manual/gui-viewer';
import { turtleRequest, TurtleRequestError } from '@/lib/turtle-trial/client';
import { initialTurtleDraft, parseTurtleDraft, turtleDraftKey, turtleErrorHint, type TurtleDraft } from '@/lib/turtle-trial/drafts';
import styles from './turtle-trial.module.css';

const help = [
  ['TForward(100)', '앞으로 100만큼 이동해요.', 'Move forward 100 steps.'],
  ['TLeft(90)', '왼쪽으로 90도 돌아요. 내각이 아닌 외각이에요.', 'Turn left 90 degrees. Use the exterior angle.'],
  ['color("red")', '선과 거북이 색을 바꿔요.', 'Change the pen and turtle color.'],
  ['speed(0)', '0은 가장 빠른 속도예요. 1~10도 사용할 수 있어요.', '0 is fastest. You can also use 1–10.'],
  ['randint(1, 20)', '1과 20을 포함한 무작위 정수를 골라요.', 'Pick a random integer, including both bounds.'],
  ['print(123)', '아래 출력 창에 값을 표시해요.', 'Show a value in Output.'],
  ['ReadyToRace()', '경기장과 네 마리 거북이를 준비해요.', 'Prepare the track and four turtles.'],
  ['BlueForward(20)', '파란 거북이만 이동해요. Pink·Yellow·Green도 있어요.', 'Move Blue. Pink, Yellow and Green work too.'],
  ['BlueLeft(10)', '파란 거북이만 돌아요. 다른 색도 사용할 수 있어요.', 'Turn Blue. The other colors work too.'],
  ['BlueX()', '파란 거북이의 x좌표예요. 결승선은 330이에요.', 'Get Blue’s x coordinate. The finish is at 330.'],
];

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

export function TurtleTrial({ enabled, english }: { enabled: boolean; english: boolean }) {
  const t = (ko: string, en: string) => english ? en : ko;
  const [draft, setDraft] = useState<TurtleDraft>(initialTurtleDraft);
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState(true);
  const [access, setAccess] = useState(false);
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
  const [consoleSize, setConsoleSize] = useState(20);
  const [input, setInput] = useState('');
  const workspace = useRef<HTMLDivElement>(null);
  const drawing = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  const pendingRun = useRef<{ source: string; starterId: TurtleStarterId; helperVersion: typeof turtleHelperVersion; requestKey: string } | null>(null);
  const mounted = useRef(false);
  const source = draft.buffers[draft.starter];
  const running = turtleRunning(session);
  const hint = turtleErrorHint(session?.output ?? '', english);

  const handleError = useCallback((e: unknown) => {
    const code = e instanceof Error ? e.message : '';
    const en = english;
    const messages: Record<string, string> = {
      INVALID_PIN: en ? 'That code doesn’t match. Please check it and try again.' : '코드가 맞지 않아요. 다시 확인해 주세요.',
      ACCESS_EXPIRED: en ? 'Your session ended. Enter the classroom code again; your code is still here.' : '체험 시간이 끝났어요. 코드를 다시 입력해 주세요. 작성한 코드는 그대로 있어요.',
      RUN_CONFLICT: en ? 'A run is already active. Stop it before running again.' : '이미 실행 중인 코드가 있어요. 먼저 중지해 주세요.',
      SOURCE_TOO_LARGE: en ? 'Your code is larger than 64 KiB. Shorten it before running.' : '코드가 64 KiB를 넘었어요. 코드를 줄인 후 실행해 주세요.',
      HELPERS_CHANGED: en ? 'The classroom has been updated. Reload this page; your code is saved in this tab.' : '체험 수업이 업데이트됐어요. 이 탭에 코드를 저장한 후 새로고침해 주세요.',
      CHALLENGE_EXPIRED: en ? 'The code form expired. Refresh access and try again.' : '코드 입력 시간이 지났어요. 연결 확인 후 다시 시도해 주세요.',
      RUN_LIMIT: en ? 'You’ve reached this session’s run limit. Ask your teacher before starting a new session.' : '이번 체험의 실행 한도에 도달했어요. 선생님께 알려 주세요.',
      RUNTIME_BUSY: en ? 'All drawing spaces are in use. Try again shortly.' : '지금은 모든 그림 공간을 사용 중이에요. 잠시 후 다시 실행해 주세요.',
      RATE_LIMITED: en ? 'Too many attempts. Please wait before trying again.' : '시도 횟수가 많아요. 잠시 기다린 후 다시 시도해 주세요.',
      RUN_ENDED: en ? 'This run has ended. Press Run to start again.' : '실행이 끝났어요. 실행 버튼으로 다시 시작해 보세요.',
    };
    setError(messages[code] ?? (en ? 'The classroom connection is unavailable. Please try again.' : '체험 수업에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'));
    if (e instanceof TurtleRequestError && e.retryAfter) setRetryUntil(Date.now() + e.retryAfter * 1000);
    if (e instanceof TurtleRequestError && e.status === 401 && code !== 'INVALID_PIN' && code !== 'CHALLENGE_EXPIRED') {
      setAccess(false); setSession(null); setNonceReady(false);
      void turtleRequest('challenge').then(() => setNonceReady(true)).catch(() => {});
    }
  }, [english]);
  const viewerError = useCallback((text: string) => setError(text), []);
  async function challenge() {
    try { await turtleRequest('challenge'); setNonceReady(true); setError(''); } catch (e) { handleError(e); }
  }
  async function bootstrap() {
    setLoading(true);
    try {
      const result = await turtleRequest<TurtleBootstrap>('bootstrap');
      setAccess(true); setSession(result.session); setError('');
    } catch (e) {
      if (!(e instanceof TurtleRequestError && e.status === 401)) handleError(e);
      await challenge();
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
    if (!session?.id || !running) return;
    let cancelled = false; let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void turtleRequest<TurtleSession>('runs/' + session.id).then(next => {
        if (!cancelled) setSession(next);
      }).catch(e => {
        if (!cancelled) {
          handleError(e);
          if (e instanceof TurtleRequestError && [401, 404].includes(e.status)) setSession(old => old ? { ...old, state: 'DISCONNECTED' } : null);
        }
      }).finally(() => { inFlight = false; });
    }, 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [session?.id, running, handleError]);

  async function enter(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await turtleRequest('access', 'POST', { pin }); setPin(''); await bootstrap(); }
    catch (e) { handleError(e); } finally { setBusy(false); }
  }
  function snapshot() {
    try { const canvas = drawing.current?.querySelector('canvas'); if (canvas) setRetainedFrame(canvas.toDataURL()); } catch { /* Keep the previous frame if the viewer has already gone. */ }
  }
  async function stop(clear = false) {
    snapshot(); setBusy(true); setError('');
    try {
      if (session) await turtleRequest('runs/' + session.id, 'DELETE');
      setSession(old => clear ? null : old ? { ...old, state: 'STOPPED' } : null);
      pendingRun.current = null;
      if (clear) setRetainedFrame('');
    } catch (e) { handleError(e); } finally { setBusy(false); }
  }
  async function run() {
    if (busy || running) return;
    setBusy(true); setError(''); setRetainedFrame('');
    pendingRun.current ??= { source, starterId: draft.starter, helperVersion: turtleHelperVersion, requestKey: crypto.randomUUID() };
    try {
      const next = await turtleRequest<TurtleSession>('runs', 'POST', pendingRun.current);
      if (mounted.current) { setSession(next); setMobileTab('drawing'); }
      pendingRun.current = null;
    } catch (e) {
      handleError(e);
      if (e instanceof TurtleRequestError && e.status < 500) pendingRun.current = null;
    } finally { setBusy(false); }
  }
  async function exit() {
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
    if (!window.confirm(t('현재 코드를 기본 코드로 바꿀까요?', 'Replace this starter’s code with the original?'))) return;
    pendingRun.current = null;
    setDraft(d => ({ ...d, buffers: { ...d.buffers, [d.starter]: turtleStarters[d.starter] } }));
  }
  async function fullscreen(element: HTMLElement | null) {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await element?.requestFullscreen(); }
    catch { setError(t('이 브라우저에서는 전체 화면을 사용할 수 없어요.', 'Fullscreen is unavailable in this browser.')); }
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
  const remaining = session ? Math.max(0, Math.ceil((session.expiresAt - now) / 1000)) : 0;
  const status = session ? ({ QUEUED: t('그림 공간을 기다리고 있어요', 'Waiting for a drawing space'), STARTING: t('거북이를 준비하고 있어요', 'Preparing your turtle'), RUNNING: t('코드를 실행하고 있어요', 'Running your code'), DISPLAYING: t('그림을 확인하고 있어요', 'Your drawing is ready'), WAITING_INPUT: t('입력할 값을 기다리고 있어요', 'Waiting for your input'), STOPPED: t('실행을 멈췄어요', 'Stopped'), TIMED_OUT: t('실행 시간이 끝났어요. 다시 실행할 수 있어요.', 'Time is up. You can run again.'), ERROR: t('코드를 확인해 보세요', 'Check your code'), OUTPUT_LIMIT: t('출력이 너무 많아 실행을 멈췄어요', 'Stopped because output was too large'), QUEUE_EXPIRED: t('대기 시간이 끝났어요. 다시 실행해 주세요.', 'The queue expired. Please run again.'), DISCONNECTED: t('연결이 끝났어요. 다시 실행해 주세요.', 'Disconnected. Please run again.') } as Record<string, string>)[session.state] ?? session.state : t('코드를 쓰고 실행해 보세요', 'Write some code and press Run');

  if (!access) return <main className={styles.gate}>
    <div className={styles.gateBrand}><Turtle size={27} /> <strong>Cove Turtle</strong><span>PYTHON PLAYGROUND</span></div>
    <div className={styles.gateGrid}>
      <section className={styles.intro}>
        <span className={styles.eyebrow}>{t('코드로 그리는 첫 번째 그림', 'YOUR FIRST DRAWING WITH CODE')}</span>
        <h1>{t('작은 명령어로,', 'A little code.')}<br />{t('커다란 상상력.', 'A lot of imagination.')}</h1>
        <p>{t('거북이와 함께 도형을 그리고, 나만의 경주를 만들어 보세요.', 'Draw shapes with a turtle, then build a race of your own.')}</p>
        <div className={styles.preview} aria-hidden="true"><code><b>TForward</b>(100)<br /><b>TLeft</b>(90)</code><div className={styles.square}><Turtle size={32} /></div></div>
      </section>
      <section className={styles.accessCard} aria-labelledby="trial-title">
        <Turtle className={styles.cardTurtle} size={38} /><h2 id="trial-title">{t('파이썬 거북이 체험', 'Try Python & Turtle')}</h2>
        <p>{t('선생님이 알려준 6자리 코드를 입력해 주세요.', 'Enter the six-digit code from your teacher.')}</p>
        {enabled ? <form onSubmit={enter}>
          <label htmlFor="turtle-pin">{t('체험 코드', 'Classroom code')}</label>
          <input id="turtle-pin" autoComplete="off" type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={pin} disabled={loading || busy || !nonceReady} onChange={e => setPin(e.target.value.replace(/[^0-9]/g, ''))} placeholder="······" required aria-describedby={error ? 'trial-error' : undefined} />
          <button className={styles.primary} disabled={busy || loading || !nonceReady || pin.length !== 6 || retry > 0} type="submit">{loading || busy ? t('연결하고 있어요…', 'Connecting…') : t('시작하기', 'Start drawing')}<ArrowRight size={18} /></button>
        </form> : <p role="status">{t('체험 수업을 준비하고 있어요. 선생님께 문의해 주세요.', 'The classroom is not open yet. Please ask your teacher.')}</p>}
        {error && <p id="trial-error" className={styles.error} role="alert">{error}{retry > 0 && ` (${retry}s)`}</p>}
        {enabled && (!nonceReady || error) && <button type="button" className={styles.textButton} onClick={() => { setError(''); void challenge(); }}>{t('연결 확인', 'Refresh access')}</button>}
        <div className={styles.gateNote}>{t('회원가입 없이 바로 시작해요.', 'Start without creating an account.')}</div>
      </section>
    </div>
    <footer className={styles.gateFooter}>COVE · {t('생각하는 즐거움, 만드는 즐거움', 'The joy of thinking. The joy of making.')}</footer>
  </main>;

  return <main className={styles.workspace} ref={workspace}>
    <header className={styles.header}><div className={styles.wordmark}><Turtle size={25} /><strong>Cove Turtle</strong></div>
      <select aria-label={t('기본 코드 선택', 'Choose a starter')} value={draft.starter} onChange={e => setDraft(d => ({ ...d, starter: e.target.value as TurtleStarterId }))}>
        <option value="drawing">{t('도형 그리기', 'Draw shapes')}</option><option value="race">{t('거북이 경주', 'Turtle race')}</option><option value="free">{t('자유 연습', 'Free practice')}</option>
      </select>
      <div className={styles.headerActions}><label>{t('글자', 'Text')} <select aria-label={t('글자 크기', 'Font size')} value={draft.font} onChange={e => setDraft(d => ({ ...d, font: Number(e.target.value) }))}>{[14, 16, 18, 20, 22, 24, 26, 28].map(n => <option value={n} key={n}>{n}px</option>)}</select></label>
      <button type="button" onClick={() => void fullscreen(workspace.current)} title={t('전체 화면', 'Fullscreen')} aria-label={t('전체 화면', 'Fullscreen')}><Maximize2 size={17} /></button><button type="button" onClick={() => void exit()} disabled={busy}>{t('나가기', 'Exit')}</button></div>
    </header>
    <nav className={styles.toolbar} aria-label={t('실행 도구', 'Execution controls')}>
      <button type="button" className={running ? styles.stop : styles.primary} disabled={busy || retry > 0} onClick={() => running ? void stop() : void run()}>{running ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}{busy ? t('잠시만요', 'Please wait') : running ? t('중지', 'Stop') : t('실행', 'Run')}</button>
      <button type="button" onClick={reset} disabled={busy}><RotateCcw size={16} />{t('코드 초기화', 'Reset code')}</button>
      <button type="button" onClick={() => void stop(true)} disabled={busy}><Eraser size={16} />{t('그림 지우기', 'Clear drawing')}</button>
      <div className={styles.toolbarEnd}><button type="button" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}><BookOpen size={17} />{t('명령어 도움말', 'Commands')}</button>
      <details className={styles.download}><summary><Download size={16} />{t('다운로드', 'Download')}</summary><div><button type="button" onClick={() => download(source, 'main.py', 'text/x-python')}>main.py</button><button type="button" onClick={() => void project()}>{t('전체 프로젝트 (.zip)', 'Project with helpers (.zip)')}</button></div></details></div>
    </nav>
    {error && <div className={styles.errorBar} role="alert">{error}{retry > 0 && ` (${retry}s)`}<button type="button" aria-label={t('닫기', 'Dismiss')} onClick={() => setError('')}><X size={16} /></button></div>}
    <nav className={styles.mobileTabs} aria-label={t('작업 공간', 'Workspace')} role="tablist">{[['code', t('코드', 'Code')], ['drawing', t('그림', 'Drawing')], ['output', t('출력', 'Output')]].map(([id, name]) => <button key={id} type="button" role="tab" aria-selected={mobileTab === id} onClick={() => setMobileTab(id!)}>{name}</button>)}</nav>
    <div className={styles.panes} style={{ '--editor': split + '%' } as CSSProperties}>
      <section ref={editor} className={styles.editor} data-visible={mobileTab === 'code'} aria-label={t('파이썬 코드', 'Python code')}><div className={styles.paneTitle}><span><span className={styles.pythonDot} />main.py</span><button type="button" onClick={() => void fullscreen(editor.current)} aria-label={t('코드 전체 화면', 'Fullscreen code')}><Maximize2 size={14} /></button></div>
        <CodeEditor code={source} fontSize={draft.font} onChange={value => { setSaved(false); setDraft(d => ({ ...d, buffers: { ...d.buffers, [d.starter]: value } })); }} />
      </section>
      <SplitHandle value={split} onChange={n => setSplit(Math.min(70, Math.max(30, n)))} label={t('코드와 그림 크기 조절', 'Resize code and drawing')} />
      <div className={styles.results} style={{ gridTemplateRows: `minmax(0,${100 - consoleSize}fr) 6px minmax(0,${consoleSize}fr)` }}>
        <section className={styles.drawing} data-visible={mobileTab === 'drawing'} aria-label={t('그림', 'Drawing')} ref={drawing}>
          <div className={styles.paneTitle}><span>{t('그림', 'Drawing')}</span><span className={styles.statusDot}>{running && <i />}{running ? t('실행 중', 'Live') : t('결과', 'Result')}</span></div>
          {retainedFrame ? <Image src={retainedFrame} width={1024} height={640} unoptimized alt={t('마지막 거북이 그림', 'Last turtle drawing')} className={styles.frame} /> : session && session.state !== 'QUEUED' ? <GuiViewer session={session} onError={viewerError} /> : <div className={styles.empty}><Turtle size={62} strokeWidth={1.2} /><h2>{session?.state === 'QUEUED' ? t('조금만 기다려 주세요', 'Your turn is coming') : t('거북이가 기다리고 있어요', 'Your turtle is waiting')}</h2><p>{session?.state === 'QUEUED' ? t('그림 공간이 준비되면 자동으로 시작해요.', 'Your code starts when a drawing space is ready.') : t('왼쪽에 코드를 쓰고 실행을 눌러 보세요.', 'Write code on the left, then press Run.')}</p></div>}
        </section>
        <SplitHandle vertical value={consoleSize} onChange={setConsoleSize} label={t('출력 창 크기 조절', 'Resize output')} />
        <section className={styles.console} data-visible={mobileTab === 'output'} aria-label={t('출력', 'Output')}><div className={styles.paneTitle}><span>{t('출력', 'Output')}</span>{session?.state === 'WAITING_INPUT' && <span>{t('입력 대기', 'Input requested')}</span>}</div>
          {hint.message && <p className={styles.hint}>{hint.line && `${t('줄', 'Line')} ${hint.line} · `}{hint.message}</p>}
          {hint.message ? <details><summary>{t('파이썬 오류 자세히 보기', 'Python error details')}</summary><pre>{session?.output}</pre></details> : <pre aria-live="polite">{session?.output || t('print()의 결과가 여기에 나타나요.', 'Output from print() appears here.')}</pre>}
          {session?.state === 'WAITING_INPUT' && <form onSubmit={sendInput}><input aria-label={t('입력할 값', 'Program input')} value={input} onChange={e => setInput(e.target.value)} /><button type="submit">{t('입력', 'Send')}</button></form>}
        </section>
      </div>
    </div>
    <footer className={styles.status}><span className={saved ? '' : styles.unsaved}>{saved ? t('이 탭에 임시 저장됨', 'Saved in this tab') : t('임시 저장 안 됨 · 다운로드로 보관하세요', 'Not saved · Download to keep your code')}</span><span role="status">{status}{running && session?.state !== 'QUEUED' && ` · ${remaining}s`}</span></footer>
    {showHelp && <aside className={styles.help} aria-label={t('명령어 도움말', 'Command reference')}><header><h2>{t('작은 명령어 사전', 'Your command reference')}</h2><button type="button" onClick={() => setShowHelp(false)} aria-label={t('도움말 닫기', 'Close help')}><X size={20} /></button></header><p>{t('명령어의 대소문자와 괄호를 확인해 보세요.', 'Command names are case-sensitive. Remember the parentheses.')}</p>{help.map(([command, ko, en]) => <div key={command}><code>{command}</code><p>{english ? en : ko}</p></div>)}<p><code>TForward(100)</code> → <code>turtle.forward(100)</code></p></aside>}
  </main>;
}
