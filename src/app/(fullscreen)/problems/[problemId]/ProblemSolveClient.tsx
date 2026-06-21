'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Play, Send, ChevronDown, ChevronUp, Lightbulb, Clock, RotateCcw } from 'lucide-react';
import { HintPanel } from '@/components/demo/HintPanel';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import type { DbProblem, DbTestCase, ProblemDifficulty } from '@/lib/types/db';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#1E1E1E' }}>
      <span style={{ fontSize: '13px', color: '#5A6270' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: { set: (key: string, value: string) => void };
};

type ProblemDetail = DbProblem & {
  test_cases: Pick<DbTestCase, 'id' | 'input' | 'expected_output' | 'is_sample' | 'order_no'>[];
};

type SubmitResult = {
  status: 'pass' | 'fail' | 'partial';
  passedCount: number;
  totalCount: number;
  runtimeMs: number;
  elapsedSec: number;
  failedCases: number[];
  attemptNo: number;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

async function runWithPyodide(pyodide: PyodideInstance, userCode: string, stdinInput: string) {
  pyodide.globals.set('_user_code', userCode);
  pyodide.globals.set('_stdin_input', stdinInput);
  const result = await pyodide.runPythonAsync(`
import sys, io
_saved_stdin = sys.stdin
_saved_stdout = sys.stdout
sys.stdin = io.StringIO(_stdin_input)
_captured = io.StringIO()
sys.stdout = _captured
_stderr_msg = ''
try:
    exec(compile(_user_code, '<solution>', 'exec'), {})
except Exception as _e:
    _stderr_msg = type(_e).__name__ + ': ' + str(_e)
finally:
    sys.stdin = _saved_stdin
    sys.stdout = _saved_stdout
(_captured.getvalue(), _stderr_msg)
`) as [string, string];
  return { stdout: result[0], stderr: result[1] };
}

function ResultModal({ result, onClose, onRetry, onHint }: { result: SubmitResult; onClose: () => void; onRetry: () => void; onHint: () => void }) {
  const isPass = result.status === 'pass';
  const minutes = Math.floor(result.elapsedSec / 60);
  const secs = result.elapsedSec % 60;
  const timeLabel = minutes > 0 ? `${minutes}분 ${secs}초` : `${secs}초`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4"
        style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: isPass ? '#DCFCE7' : '#FEE2E2' }}>
            <span style={{ fontSize: 32 }}>{isPass ? '✓' : '✗'}</span>
          </div>
        </div>

        <h2 className="text-center mb-1" style={{ fontSize: '20px', fontWeight: 700, color: isPass ? '#16A34A' : '#DC2626' }}>
          {isPass ? '정답입니다!' : result.status === 'partial' ? '일부 통과' : '오답입니다'}
        </h2>
        <p className="text-center mb-5" style={{ fontSize: '13px', color: '#5A6270' }}>
          {result.attemptNo}번째 제출
        </p>

        <div className="flex justify-around rounded-xl p-4 mb-5" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
          <div className="text-center">
            <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>통과한 케이스</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: isPass ? '#16A34A' : '#DC2626' }}>
              {result.passedCount} / {result.totalCount}
            </div>
          </div>
          <div style={{ width: 1, backgroundColor: '#E5E8EC' }} />
          <div className="text-center">
            <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>풀이 시간</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#16181D' }}>{timeLabel}</div>
          </div>
        </div>

        {!isPass && result.failedCases.length > 0 && (
          <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: '#FFF5F5', border: '1px solid #FCA5A5' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>실패한 케이스</div>
            <div style={{ fontSize: '13px', color: '#5A6270' }}>케이스 {result.failedCases.join(', ')}에서 오류가 발생했습니다.</div>
            <div className="mt-1" style={{ fontSize: '11px', color: '#B91C1C' }}>* 정답은 공개되지 않습니다</div>
          </div>
        )}

        {isPass ? (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>닫기</button>
            <Link href="/problems" className="flex-1 rounded-xl text-white flex items-center justify-center transition-colors" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
            >
              다른 문제 풀기
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onHint} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>
              힌트 보기
            </button>
            <button onClick={onRetry} className="flex-1 rounded-xl text-white transition-colors" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
            >
              다시 풀기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProblemSolveClient({ problemId, submissionId }: { problemId: string; submissionId?: string }) {
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; type: 'info' | 'out' | 'err' | 'meta' }>>([
    { text: '실행 버튼을 눌러 코드를 실행해보세요.', type: 'info' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [modalResult, setModalResult] = useState<SubmitResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [leftWidth, setLeftWidth] = useState(46);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [starterCode, setStarterCode] = useState('');

  const pyodideRef = useRef<PyodideInstance | null>(null);
  const pyodideLoadPromise = useRef<Promise<PyodideInstance> | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/problems/${problemId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.problem) { setLoadError(true); return; }
        setProblem({ ...json.problem, test_cases: json.test_cases ?? [] });
        const sc = json.problem.starter_code ?? '';
        setStarterCode(sc);
        if (!submissionId) setCode(sc);
      })
      .catch(() => setLoadError(true));

    fetch(`/api/submissions?problem_id=${problemId}`)
      .then((r) => r.json())
      .then((json) => setAttemptCount(json.submissions?.length ?? 0));

    if (submissionId) {
      fetch(`/api/submissions/${submissionId}`)
        .then((r) => r.json())
        .then((json) => { if (json.submission?.code) setCode(json.submission.code); });
    }
  }, [problemId, submissionId]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [terminalLines]);

  const timeStr = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const getPyodide = useCallback(async (): Promise<PyodideInstance> => {
    if (pyodideRef.current) return pyodideRef.current;
    if (pyodideLoadPromise.current) return pyodideLoadPromise.current;
    setPyodideStatus('loading');
    pyodideLoadPromise.current = (async () => {
      await new Promise<void>((resolve, reject) => {
        if ((window as { loadPyodide?: unknown }).loadPyodide) { resolve(); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Pyodide CDN 로드 실패'));
        document.head.appendChild(script);
      });
      const instance = await (window as unknown as { loadPyodide: () => Promise<PyodideInstance> }).loadPyodide();
      pyodideRef.current = instance;
      setPyodideStatus('ready');
      return instance;
    })();
    try { return await pyodideLoadPromise.current; }
    catch (e) { pyodideLoadPromise.current = null; setPyodideStatus('error'); throw e; }
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning || !problem) return;
    setIsRunning(true);
    setTerminalOpen(true);
    const sampleInput = problem.test_cases.find((tc) => tc.is_sample)?.input ?? '';
    setTerminalLines([{ text: 'Pyodide 초기화 중...', type: 'info' }]);
    try {
      const pyodide = await getPyodide();
      setTerminalLines([{ text: '실행 중...', type: 'info' }]);
      const t0 = Date.now();
      const { stdout, stderr } = await Promise.race([
        runWithPyodide(pyodide, code, sampleInput),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('실행 시간 초과 (5초)')), 5000)),
      ]);
      const elapsed = Date.now() - t0;
      const lines: typeof terminalLines = [{ text: '$ python solution.py', type: 'meta' }];
      if (stdout) stdout.trimEnd().split('\n').forEach((l) => lines.push({ text: l, type: 'out' }));
      if (stderr) stderr.trimEnd().split('\n').forEach((l) => lines.push({ text: l, type: 'err' }));
      if (!stdout && !stderr) lines.push({ text: '(출력 없음)', type: 'info' });
      lines.push({ text: `완료 (${elapsed}ms)`, type: 'meta' });
      setTerminalLines(lines);
    } catch (e) {
      setTerminalLines([
        { text: '$ python solution.py', type: 'meta' },
        { text: e instanceof Error ? e.message : '실행 오류', type: 'err' },
      ]);
    } finally { setIsRunning(false); }
  }, [isRunning, code, problem, getPyodide]);

  const handleSubmit = useCallback(async () => {
    if (isRunning || !problem) return;
    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalLines([{ text: '채점 중...', type: 'info' }]);

    const res = await fetch(`/api/problems/${problemId}/judge-cases`).catch(() => null);
    const judgeJson = res?.ok ? await res.json().catch(() => null) : null;
    const judgeCases: Array<{ input: string; expected_output: string }> = judgeJson?.test_cases ?? problem.test_cases;

    if (judgeCases.length === 0) {
      setTerminalLines([{ text: '채점할 테스트케이스가 없습니다. 관리자에게 문의하세요.', type: 'err' }]);
      setIsRunning(false);
      return;
    }

    try {
      const pyodide = await getPyodide();
      const lines: typeof terminalLines = [];
      let passedCount = 0;
      const failedCases: number[] = [];
      const t0 = Date.now();

      for (let i = 0; i < judgeCases.length; i++) {
        const tc = judgeCases[i];
        try {
          const { stdout, stderr } = await Promise.race([
            runWithPyodide(pyodide, code, tc.input),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('시간 초과')), 5000)),
          ]);
          const actual = stdout.trim();
          const expected = tc.expected_output.trim();
          if (stderr) {
            lines.push({ text: `케이스 ${i + 1}: 오류 — ${stderr.split('\n').pop() ?? stderr}`, type: 'err' });
            failedCases.push(i + 1);
          } else if (actual === expected) {
            lines.push({ text: `케이스 ${i + 1}: ✓ 통과`, type: 'out' });
            passedCount++;
          } else {
            lines.push({ text: `케이스 ${i + 1}: ✗ 실패`, type: 'err' });
            failedCases.push(i + 1);
          }
        } catch {
          lines.push({ text: `케이스 ${i + 1}: 시간 초과`, type: 'err' });
          failedCases.push(i + 1);
        }
      }

      const runtimeMs = Date.now() - t0;
      const status: 'pass' | 'fail' | 'partial' =
        passedCount === judgeCases.length ? 'pass' : passedCount > 0 ? 'partial' : 'fail';
      const score = Math.round((passedCount / judgeCases.length) * 100);
      const newAttempt = attemptCount + 1;

      lines.push({ text: `채점 완료 — ${passedCount}/${judgeCases.length} 통과 (${runtimeMs}ms)`, type: 'meta' });
      setTerminalLines(lines);
      setAttemptCount(newAttempt);

      await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: problemId,
          language: 'python',
          code,
          status,
          score,
          passed_count: passedCount,
          total_count: judgeCases.length,
          runtime_ms: runtimeMs,
          elapsed_sec: seconds,
        }),
      });

      setModalResult({ status, passedCount, totalCount: judgeCases.length, runtimeMs, elapsedSec: seconds, failedCases, attemptNo: newAttempt });
    } catch (e) {
      setTerminalLines([{ text: e instanceof Error ? e.message : '채점 중 오류 발생', type: 'err' }]);
    } finally { setIsRunning(false); }
  }, [isRunning, code, problem, problemId, getPyodide, seconds, attemptCount]);

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setLeftWidth(Math.max(28, Math.min(65, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  const termColor = (type: string) => {
    if (type === 'err') return '#F87171';
    if (type === 'out') return '#D4D4D4';
    if (type === 'meta') return '#6A9955';
    return '#8C8C8C';
  };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ backgroundColor: '#F6F7F9' }}>
        <p style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>문제를 불러올 수 없습니다</p>
        <Link href="/problems" style={{ fontSize: '14px', color: '#1B64DA' }}>목록으로 돌아가기</Link>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: '#F6F7F9' }}>
        <span style={{ fontSize: '14px', color: '#5A6270' }}>문제 불러오는 중...</span>
      </div>
    );
  }

  const sampleCases = problem.test_cases.filter((tc) => tc.is_sample);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#F6F7F9' }}>
      <header className="flex items-center px-4 gap-3 flex-shrink-0 bg-white" style={{ height: 48, borderBottom: '1px solid #E5E8EC', zIndex: 10 }}>
        <Link href="/problems" className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-[#F6F7F9]" style={{ color: '#5A6270', fontSize: '13px' }}>
          <ChevronLeft size={16} /> 목록
        </Link>
        <div style={{ width: 1, height: 20, backgroundColor: '#E5E8EC' }} />

        <div className="flex items-center gap-2">
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>{problem.problem_no}. {problem.title}</span>
          <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[problem.difficulty].bg, color: DIFF_STYLE[problem.difficulty].color }}>
            {DIFF_LABEL[problem.difficulty]}
          </span>
        </div>

        <div className="flex-1 flex justify-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
            <Clock size={14} style={{ color: '#5A6270' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', fontFamily: 'monospace' }}>{timeStr}</span>
          </div>
          {attemptCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
              <span style={{ fontSize: '12px', color: '#5A6270' }}>제출 {attemptCount}회</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pyodideStatus === 'loading' && <span style={{ fontSize: '12px', color: '#D97706' }}>Pyodide 로딩 중...</span>}
          {pyodideStatus === 'ready' && (
            <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#16A34A' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#16A34A' }} /> 준비됨
            </span>
          )}
          <button
            onClick={() => setCode(starterCode)}
            title="코드 초기화"
            className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[#F6F7F9]"
            style={{ fontSize: '12px', color: '#5A6270', border: '1px solid #E5E8EC', height: 32 }}
          >
            <RotateCcw size={12} /> 초기화
          </button>
          <button onClick={handleRun} disabled={isRunning} className="flex items-center gap-1.5 px-3 rounded-lg transition-colors disabled:opacity-50" style={{ height: 36, border: '1px solid #E5E8EC', backgroundColor: '#FFFFFF', fontSize: '13px', fontWeight: 600, color: '#16181D' }}>
            <Play size={14} /> 실행
          </button>
          <button onClick={handleSubmit} disabled={isRunning} className="flex items-center gap-1.5 px-4 rounded-lg text-white transition-colors disabled:opacity-50" style={{ height: 36, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 600 }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
          >
            <Send size={14} /> 제출
          </button>
        </div>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="flex flex-col bg-white overflow-auto flex-shrink-0" style={{ width: `${leftWidth}%`, borderRight: '1px solid #E5E8EC' }}>
          <div className="p-5">
            <div className="flex gap-5 mb-5 pb-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
              <div>
                <span style={{ fontSize: '11px', color: '#5A6270', display: 'block' }}>실행 제한</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{problem.time_limit_ms / 1000}초</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#5A6270', display: 'block' }}>언어</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>Python 3</span>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>문제</h3>
            <p style={{ fontSize: '14px', color: '#16181D', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 20 }}>{problem.description}</p>

            {problem.input_format && (
              <>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 6 }}>입력</h3>
                <p style={{ fontSize: '13px', color: '#5A6270', marginBottom: 16, lineHeight: 1.6 }}>{problem.input_format}</p>
              </>
            )}
            {problem.output_format && (
              <>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 6 }}>출력</h3>
                <p style={{ fontSize: '13px', color: '#5A6270', marginBottom: 20, lineHeight: 1.6 }}>{problem.output_format}</p>
              </>
            )}

            {sampleCases.length > 0 && (
              <>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 10 }}>예제</h3>
                <div className="flex flex-col gap-4 mb-5">
                  {sampleCases.map((tc, i) => (
                    <div key={tc.id} className="flex gap-3">
                      {tc.input && (
                        <div className="flex-1">
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>예제 입력 {i + 1}</div>
                          <div className="p-3 rounded-lg" style={{ backgroundColor: '#1E1E1E', fontFamily: 'monospace', fontSize: '12px', color: '#D4D4D4', whiteSpace: 'pre' }}>
                            {tc.input}
                          </div>
                        </div>
                      )}
                      <div className="flex-1">
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>예제 출력 {i + 1}</div>
                        <div className="p-3 rounded-lg" style={{ backgroundColor: '#1E1E1E', fontFamily: 'monospace', fontSize: '12px', color: '#D4D4D4', whiteSpace: 'pre' }}>
                          {tc.expected_output}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {problem.constraint_text && (
              <>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>제약 조건</h3>
                <ul className="flex flex-col gap-1.5">
                  {problem.constraint_text.split('\n').filter(Boolean).map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span style={{ width: 4, height: 4, borderRadius: 99, backgroundColor: '#5A6270', display: 'inline-block', flexShrink: 0, marginTop: 6 }} />
                      <span style={{ fontSize: '13px', color: '#5A6270', fontFamily: 'monospace' }}>{c.replace(/^[•·\-]\s*/, '')}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 cursor-col-resize" style={{ width: 5, backgroundColor: '#E5E8EC' }} onMouseDown={handleMouseDown} />

        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E5E8EC' }}>
            <span style={{ fontSize: '12px', color: '#5A6270', fontFamily: 'monospace' }}>Python 3</span>
            <button onClick={() => setShowHint(true)} className="flex items-center gap-1.5 px-3 rounded-lg transition-colors hover:bg-[#F6F7F9]" style={{ height: 32, fontSize: '13px', color: '#5A6270' }}>
              <Lightbulb size={14} /> 힌트 보기
            </button>
          </div>

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
            <MonacoEditor
              height="100%"
              language="python"
              theme="paircode-dark"
              beforeMount={registerPaircodeTheme}
              value={code}
              onChange={(v) => setCode(v ?? '')}
              options={{ fontSize: 13, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 12, bottom: 12 }, automaticLayout: true, tabSize: 4 }}
            />
          </div>

          <div className="flex-shrink-0" style={{ backgroundColor: '#1E1E1E', borderTop: '1px solid #2D2D2D', height: terminalOpen ? 180 : 38, transition: 'height 0.2s ease' }}>
            <button onClick={() => setTerminalOpen((o) => !o)} className="flex items-center gap-2 w-full px-4" style={{ height: 38, borderBottom: terminalOpen ? '1px solid #2D2D2D' : 'none' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#8C8C8C' }}>실행 결과</span>
              {terminalOpen ? <ChevronDown size={13} style={{ color: '#8C8C8C' }} /> : <ChevronUp size={13} style={{ color: '#8C8C8C' }} />}
            </button>
            {terminalOpen && (
              <div ref={terminalRef} className="px-4 py-3 overflow-auto" style={{ height: 142, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7 }}>
                {terminalLines.map((line, i) => (
                  <div key={i} style={{ color: termColor(line.type), whiteSpace: 'pre-wrap' }}>{line.text}</div>
                ))}
                {isRunning && <div style={{ color: '#D97706' }}>▌</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {modalResult && (
        <ResultModal
          result={modalResult}
          onClose={() => setModalResult(null)}
          onRetry={() => setModalResult(null)}
          onHint={() => { setModalResult(null); setShowHint(true); }}
        />
      )}
      {showHint && <HintPanel onClose={() => setShowHint(false)} />}
    </div>
  );
}
