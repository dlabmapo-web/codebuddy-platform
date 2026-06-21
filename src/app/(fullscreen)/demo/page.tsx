'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import {
  ChevronLeft, Play, Send, ChevronDown, ChevronUp, Lightbulb, Clock,
} from 'lucide-react';
import { ResultModal, type SubmitResult } from '@/components/demo/ResultModal';
import { HintPanel } from '@/components/demo/HintPanel';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#1E1E1E' }}>
      <span style={{ fontSize: '13px', color: '#5A6270' }}>에디터 로딩 중...</span>
    </div>
  ),
});

const INITIAL_CODE = `n = int(input())
nums = list(map(int, input().split()))
target = int(input())

# 여기에 코드를 작성하세요
result = [1,2,3]
print(*result)
`;

const PROBLEM = {
  no: 1,
  title: '두 수의 합',
  difficulty: '쉬움' as const,
  timeLimit: '1초',
  memoryLimit: '256MB',
  description: `정수 배열 \`nums\`와 정수 \`target\`이 주어질 때,\n합이 \`target\`이 되는 두 수의 인덱스를 반환하세요.\n\n각 입력에 정확히 하나의 답이 존재하며, 같은 요소를 두 번 사용할 수 없습니다.`,
  inputDesc: '첫째 줄에 배열 길이 n, 둘째 줄에 n개의 정수, 셋째 줄에 target이 주어진다.',
  outputDesc: '합이 target이 되는 두 인덱스를 공백으로 구분하여 출력한다.',
  examples: [
    { input: '4\n2 7 11 15\n9', output: '0 1' },
    { input: '3\n3 2 4\n6', output: '1 2' },
  ],
  constraints: [
    '2 ≤ nums.length ≤ 10⁴',
    '-10⁹ ≤ nums[i] ≤ 10⁹',
    '-10⁹ ≤ target ≤ 10⁹',
    '정확히 하나의 답이 존재한다.',
  ],
};

const TEST_CASES = [
  { input: '4\n2 7 11 15\n9', expected: '0 1' },
  { input: '3\n3 2 4\n6', expected: '1 2' },
  { input: '2\n3 3\n6', expected: '0 1' },
];

const DIFF_STYLE = {
  쉬움: { bg: '#DCFCE7', color: '#15803D' },
  보통: { bg: '#EAF1FD', color: '#1450B5' },
  어려움: { bg: '#FEE2E2', color: '#B91C1C' },
};

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  globals: { set: (key: string, value: string) => void };
};

async function runWithPyodide(
  pyodide: PyodideInstance,
  userCode: string,
  stdinInput: string
): Promise<{ stdout: string; stderr: string }> {
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

export default function DemoPage() {
  const [code, setCode] = useState(INITIAL_CODE);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalLines, setTerminalLines] = useState<Array<{ text: string; type: 'info' | 'out' | 'err' | 'meta' }>>([
    { text: '실행 버튼을 눌러 코드를 실행하세요.', type: 'info' },
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [modalResult, setModalResult] = useState<SubmitResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [leftWidth, setLeftWidth] = useState(46);
  const [pyodideStatus, setPyodideStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const pyodideRef = useRef<PyodideInstance | null>(null);
  const pyodideLoadPromise = useRef<Promise<PyodideInstance> | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
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

    try {
      return await pyodideLoadPromise.current;
    } catch (e) {
      pyodideLoadPromise.current = null;
      setPyodideStatus('error');
      throw e;
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalLines([{ text: 'Pyodide 초기화 중...', type: 'info' }]);

    try {
      const pyodide = await getPyodide();
      setTerminalLines([{ text: '실행 중...', type: 'info' }]);

      const startTime = Date.now();
      const { stdout, stderr } = await Promise.race([
        runWithPyodide(pyodide, code, PROBLEM.examples[0].input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('실행 시간 초과 (5초)')), 5000)
        ),
      ]);
      const elapsed = Date.now() - startTime;

      const lines: typeof terminalLines = [];
      lines.push({ text: `$ python solution.py`, type: 'meta' });
      if (stdout) {
        stdout.trimEnd().split('\n').forEach((l) => lines.push({ text: l, type: 'out' }));
      }
      if (stderr) {
        stderr.trimEnd().split('\n').forEach((l) => lines.push({ text: l, type: 'err' }));
      }
      if (!stdout && !stderr) {
        lines.push({ text: '(출력 없음)', type: 'info' });
      }
      lines.push({ text: `실행 완료 (${elapsed}ms)`, type: 'meta' });
      setTerminalLines(lines);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '실행 중 오류 발생';
      setTerminalLines([
        { text: '$ python solution.py', type: 'meta' },
        { text: msg, type: 'err' },
      ]);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, code, getPyodide]);

  const handleSubmit = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalLines([{ text: '채점 중...', type: 'info' }]);

    try {
      const pyodide = await getPyodide();
      const lines: typeof terminalLines = [];
      let passedCount = 0;
      const failedCases: number[] = [];
      const startTime = Date.now();

      for (let i = 0; i < TEST_CASES.length; i++) {
        const tc = TEST_CASES[i];
        try {
          const { stdout, stderr } = await Promise.race([
            runWithPyodide(pyodide, code, tc.input),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('시간 초과')), 5000)
            ),
          ]);

          const actual = stdout.trim();
          const expected = tc.expected.trim();

          if (stderr) {
            lines.push({ text: `TC ${i + 1}: 런타임 오류 — ${stderr.split('\n').pop() ?? stderr}`, type: 'err' });
            failedCases.push(i + 1);
          } else if (actual === expected) {
            lines.push({ text: `TC ${i + 1}: ✓ 통과`, type: 'out' });
            passedCount++;
          } else {
            lines.push({ text: `TC ${i + 1}: ✗ 실패`, type: 'err' });
            failedCases.push(i + 1);
          }
        } catch {
          lines.push({ text: `TC ${i + 1}: 시간 초과`, type: 'err' });
          failedCases.push(i + 1);
        }
      }

      const runtimeMs = Date.now() - startTime;
      const status: SubmitResult['status'] =
        passedCount === TEST_CASES.length ? 'pass' : passedCount > 0 ? 'partial' : 'fail';

      lines.push({ text: `채점 완료 — ${passedCount}/${TEST_CASES.length} 통과 (${runtimeMs}ms)`, type: 'meta' });
      setTerminalLines(lines);

      setModalResult({ status, passedCount, totalCount: TEST_CASES.length, runtimeMs, failedCases });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '채점 중 오류 발생';
      setTerminalLines([{ text: msg, type: 'err' }]);
    } finally {
      setIsRunning(false);
    }
  }, [isRunning, code, getPyodide]);

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftWidth(Math.max(28, Math.min(65, pct)));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  const termColor = (type: string) => {
    if (type === 'err') return '#F87171';
    if (type === 'out') return '#D4D4D4';
    if (type === 'meta') return '#6A9955';
    return '#8C8C8C';
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#F6F7F9' }}>
      <header
        className="flex items-center px-4 gap-3 flex-shrink-0 bg-white"
        style={{ height: 48, borderBottom: '1px solid #E5E8EC', zIndex: 10 }}
      >
        <Link
          href="/problems"
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-surface"
          style={{ color: '#5A6270', fontSize: '13px' }}
        >
          <ChevronLeft size={16} />
          목록
        </Link>

        <div style={{ width: 1, height: 20, backgroundColor: '#E5E8EC' }} />

        <div className="flex items-center gap-2">
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>
            {PROBLEM.no}. {PROBLEM.title}
          </span>
          <span
            className="px-2 py-0.5 rounded"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: DIFF_STYLE[PROBLEM.difficulty].bg,
              color: DIFF_STYLE[PROBLEM.difficulty].color,
            }}
          >
            {PROBLEM.difficulty}
          </span>
        </div>

        <div className="flex-1 flex justify-center">
          <div
            className="flex items-center gap-2 px-3 py-1 rounded-lg"
            style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}
          >
            <Clock size={14} style={{ color: '#5A6270' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', fontFamily: 'monospace' }}>
              {timeStr}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pyodideStatus === 'loading' && (
            <span style={{ fontSize: '12px', color: '#D97706' }}>Pyodide 로딩 중...</span>
          )}
          {pyodideStatus === 'ready' && (
            <span
              className="flex items-center gap-1.5"
              style={{ fontSize: '12px', color: '#16A34A' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              실행 준비됨
            </span>
          )}

          <button
            onClick={handleRun}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 rounded-lg transition-colors disabled:opacity-50"
            style={{
              height: 36,
              border: '1px solid #E5E8EC',
              backgroundColor: '#FFFFFF',
              fontSize: '13px',
              fontWeight: 600,
              color: '#16181D',
            }}
          >
            <Play size={14} />
            실행
          </button>

          <button
            onClick={handleSubmit}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-4 rounded-lg text-white transition-colors disabled:opacity-50"
            style={{ height: 36, backgroundColor: '#1B64DA', fontSize: '13px', fontWeight: 600 }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
          >
            <Send size={14} />
            제출
          </button>
        </div>
      </header>

      <div
        ref={containerRef}
        className="flex flex-1 overflow-hidden"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          className="flex flex-col bg-white overflow-auto flex-shrink-0"
          style={{ width: `${leftWidth}%`, borderRight: '1px solid #E5E8EC' }}
        >
          <div className="p-5">
            <div
              className="flex gap-5 mb-5 pb-4"
              style={{ borderBottom: '1px solid #E5E8EC' }}
            >
              <div>
                <span style={{ fontSize: '11px', color: '#5A6270', display: 'block' }}>시간 제한</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{PROBLEM.timeLimit}</span>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#5A6270', display: 'block' }}>메모리 제한</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>{PROBLEM.memoryLimit}</span>
              </div>
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>문제</h3>
            <p style={{ fontSize: '14px', color: '#16181D', lineHeight: 1.75, whiteSpace: 'pre-line', marginBottom: 20 }}>
              {PROBLEM.description}
            </p>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 6 }}>입력 형식</h3>
            <p style={{ fontSize: '13px', color: '#5A6270', marginBottom: 16 }}>{PROBLEM.inputDesc}</p>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 6 }}>출력 형식</h3>
            <p style={{ fontSize: '13px', color: '#5A6270', marginBottom: 20 }}>{PROBLEM.outputDesc}</p>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 10 }}>예제</h3>
            <div className="flex flex-col gap-4 mb-5">
              {PROBLEM.examples.map((ex, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-1">
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>
                      예제 입력 {i + 1}
                    </div>
                    <div
                      className="p-3 rounded-lg overflow-auto"
                      style={{
                        backgroundColor: '#1E1E1E',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#D4D4D4',
                        whiteSpace: 'pre',
                      }}
                    >
                      {ex.input}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>
                      예제 출력 {i + 1}
                    </div>
                    <div
                      className="p-3 rounded-lg overflow-auto"
                      style={{
                        backgroundColor: '#1E1E1E',
                        fontFamily: 'monospace',
                        fontSize: '12px',
                        color: '#D4D4D4',
                        whiteSpace: 'pre',
                      }}
                    >
                      {ex.output}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>제약 조건</h3>
            <ul className="flex flex-col gap-1.5">
              {PROBLEM.constraints.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    style={{
                      width: 4, height: 4, borderRadius: 99,
                      backgroundColor: '#5A6270',
                      display: 'inline-block', flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '13px', color: '#5A6270', fontFamily: 'monospace' }}>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div
          className="flex-shrink-0 cursor-col-resize"
          style={{ width: 5, backgroundColor: '#E5E8EC' }}
          onMouseDown={handleMouseDown}
        />

        <div className="flex flex-col flex-1 overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-white"
            style={{ borderBottom: '1px solid #E5E8EC' }}
          >
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#5A6270' }}>Python 3</span>
            <button
              onClick={() => setShowHint(true)}
              className="flex items-center gap-1.5 px-3 rounded-lg transition-colors hover:bg-surface"
              style={{ height: 32, fontSize: '13px', color: '#5A6270' }}
            >
              <Lightbulb size={14} />
              힌트 보기
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
              options={{
                fontSize: 13,
                fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                roundedSelection: false,
                padding: { top: 12, bottom: 12 },
                automaticLayout: true,
                tabSize: 4,
                insertSpaces: true,
                wordWrap: 'off',
                renderLineHighlight: 'line',
              }}
            />
          </div>

          <div
            className="flex-shrink-0"
            style={{
              backgroundColor: '#1E1E1E',
              borderTop: '1px solid #2D2D2D',
              height: terminalOpen ? 180 : 38,
              transition: 'height 0.2s ease',
            }}
          >
            <button
              onClick={() => setTerminalOpen((o) => !o)}
              className="flex items-center gap-2 w-full px-4"
              style={{
                height: 38,
                borderBottom: terminalOpen ? '1px solid #2D2D2D' : 'none',
              }}
            >
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#8C8C8C' }}>실행 결과</span>
              {terminalOpen
                ? <ChevronDown size={13} style={{ color: '#8C8C8C' }} />
                : <ChevronUp size={13} style={{ color: '#8C8C8C' }} />}
            </button>
            {terminalOpen && (
              <div
                ref={terminalRef}
                className="px-4 py-3 overflow-auto"
                style={{ height: 142, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.7 }}
              >
                {terminalLines.map((line, i) => (
                  <div key={i} style={{ color: termColor(line.type), whiteSpace: 'pre-wrap' }}>
                    {line.text}
                  </div>
                ))}
                {isRunning && (
                  <div style={{ color: '#D97706' }}>▌</div>
                )}
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
