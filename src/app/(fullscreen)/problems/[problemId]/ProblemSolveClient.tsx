'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Play, Send, ChevronDown, ChevronUp, Lightbulb, Clock, RotateCcw, CheckCircle2, XCircle, MessageSquare, X, Keyboard } from 'lucide-react';
import { HintPanel } from '@/components/demo/HintPanel';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import { injectCursorStyles, CURSOR_COLORS } from '@/lib/monaco/cursor';
import { applyMinimalEdit } from '@/lib/monaco/applyEdit';
import { PointerOverlay, type RemotePointer } from '@/components/collab/PointerOverlay';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { OnMount } from '@monaco-editor/react';
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
  globals: { set: (key: string, value: unknown) => void };
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

type PresenceUser = { userId: string; name: string; role: string };

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

const CODE_NEEDS_INPUT = /(^|[^.\w])input\s*\(/;

async function runWithPyodide(pyodide: PyodideInstance, userCode: string, stdin: string) {
  pyodide.globals.set('_user_code', userCode);
  pyodide.globals.set('_stdin_input', stdin);
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

function InputModal({
  mode, initialValue, onConfirm, onCancel,
}: {
  mode: 'run' | 'submit';
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  const submit = () => onConfirm(value);
  const isSubmit = mode === 'submit';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onCancel}>
      <div className="bg-white rounded-2xl w-full max-w-md mx-4 overflow-hidden" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.2)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-5 py-4" style={{ borderBottom: '1px solid #E5E8EC' }}>
          <span className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, backgroundColor: '#EAF1FD' }}>
            <Keyboard size={18} style={{ color: '#1B64DA' }} />
          </span>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#16181D' }}>입력값 넣기</h3>
            <p style={{ fontSize: '12px', color: '#8A8F98' }}>이 문제는 <code style={{ fontFamily: 'monospace' }}>input()</code> 으로 값을 받아요</p>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg mb-3" style={{ backgroundColor: '#F0F7FF', border: '1px solid #C7D9F7' }}>
            <span style={{ fontSize: '12px', color: '#1450B5', lineHeight: 1.65 }}>
              코드의 <code style={{ fontFamily: 'monospace' }}>input()</code> 이 위에서부터 <strong>한 줄씩</strong> 이 값을 순서대로 읽어요.<br />
              한 줄에 여러 값이 필요하면 <strong>띄어쓰기</strong>로 구분하세요. (예: <code style={{ fontFamily: 'monospace' }}>3 5</code>)
            </span>
          </div>
          <label className="block mb-1.5" style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270' }}>입력값</label>
          <textarea
            ref={textareaRef}
            className="w-full px-3 py-2.5 rounded-lg focus:outline-none resize-none"
            style={{ height: 110, border: '1px solid #2D2D2D', fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.7, backgroundColor: '#1E1E1E', color: '#D4D4D4' }}
            placeholder={'예)\n3 5'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
            }}
          />
          <p className="mt-1.5" style={{ fontSize: '11px', color: '#8A8F98' }}>입력이 필요 없으면 비워두고 진행해도 됩니다. · ⌘/Ctrl + Enter 로 실행</p>
        </div>

        <div className="flex gap-2 px-5 py-4" style={{ borderTop: '1px solid #E5E8EC' }}>
          <button onClick={onCancel} className="flex-1 rounded-xl transition-colors" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>취소</button>
          <button
            onClick={submit}
            className="flex-1 rounded-xl text-white transition-colors flex items-center justify-center gap-1.5"
            style={{ height: 44, backgroundColor: isSubmit ? '#16A34A' : '#1B64DA', fontSize: '14px', fontWeight: 600 }}
          >
            {isSubmit ? <><Send size={15} /> 제출하기</> : <><Play size={15} /> 실행하기</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultModal({ result, onClose, onRetry, onHint }: { result: SubmitResult; onClose: () => void; onRetry: () => void; onHint: () => void }) {
  const isPass = result.status === 'pass';
  const minutes = Math.floor(result.elapsedSec / 60);
  const secs = result.elapsedSec % 60;
  const timeLabel = minutes > 0 ? `${minutes}분 ${secs}초` : `${secs}초`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,24,29,0.5)' }} onClick={onClose}>
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4" style={{ boxShadow: '0 8px 32px rgba(22,24,29,0.18)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: isPass ? '#DCFCE7' : '#FEE2E2' }}>
            {isPass
              ? <CheckCircle2 size={36} style={{ color: '#16A34A' }} />
              : <XCircle size={36} style={{ color: '#DC2626' }} />}
          </div>
        </div>
        <h2 className="text-center mb-1" style={{ fontSize: '20px', fontWeight: 700, color: isPass ? '#16A34A' : '#DC2626' }}>
          {isPass ? '정답입니다!' : result.status === 'partial' ? '일부 통과' : '오답입니다'}
        </h2>
        <p className="text-center mb-5" style={{ fontSize: '13px', color: '#5A6270' }}>{result.attemptNo}번째 제출</p>
        <div className="flex justify-around rounded-xl p-4 mb-5" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
          <div className="text-center">
            <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>채점 결과</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: isPass ? '#16A34A' : '#DC2626' }}>{isPass ? '정답' : '오답'}</div>
          </div>
          <div style={{ width: 1, backgroundColor: '#E5E8EC' }} />
          <div className="text-center">
            <div style={{ fontSize: '11px', color: '#5A6270', marginBottom: 2 }}>풀이 시간</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#16181D' }}>{timeLabel}</div>
          </div>
        </div>
        {!isPass && (
          <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: '#FFF5F5', border: '1px solid #FCA5A5' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>출력이 정답과 달라요</div>
            <div style={{ fontSize: '13px', color: '#5A6270' }}>입력값과 코드를 다시 확인해보세요. 터미널에서 실제 출력을 볼 수 있어요.</div>
            <div className="mt-1" style={{ fontSize: '11px', color: '#B91C1C' }}>* 정답은 공개되지 않습니다</div>
          </div>
        )}
        {isPass ? (
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 rounded-xl" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>닫기</button>
            <Link href="/problems" className="flex-1 rounded-xl text-white flex items-center justify-center" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}>다른 문제 풀기</Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onHint} className="flex-1 rounded-xl" style={{ height: 44, border: '1px solid #E5E8EC', fontSize: '14px', fontWeight: 600, color: '#16181D' }}>힌트 보기</button>
            <button onClick={onRetry} className="flex-1 rounded-xl text-white" style={{ height: 44, backgroundColor: '#1B64DA', fontSize: '14px', fontWeight: 600 }}>다시 풀기</button>
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
  const [editorFontSize, setEditorFontSize] = useState(13);
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teacherOnline, setTeacherOnline] = useState(false);
  const [teacherName, setTeacherName] = useState<string | null>(null);
  const teacherNameRef = useRef<string | null>(null);
  const [myInfo, setMyInfo] = useState<{ id: string; name: string } | null>(null);
  const [feedbacks, setFeedbacks] = useState<{ teacherName: string; content: string; createdAt: string }[]>([]);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [remotePointers, setRemotePointers] = useState<Record<string, RemotePointer>>({});
  const [inputModal, setInputModal] = useState<{ mode: 'run' | 'submit' } | null>(null);
  const inputResolveRef = useRef<((value: string | null) => void) | null>(null);
  const lastStdinRef = useRef('');

  const pyodideRef = useRef<PyodideInstance | null>(null);
  const pyodideLoadPromise = useRef<Promise<PyodideInstance> | null>(null);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeSentRef = useRef(0);
  const pendingCodeRef = useRef<string | null>(null);
  const lastCursorSentRef = useRef(0);
  const lastPointerSentRef = useRef(0);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const isApplyingRemoteRef = useRef(false);
  const hasPeerRef = useRef(false);
  const codeRef = useRef(code);
  const sessionIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingSyncRef = useRef(false);
  const lastSavedCodeRef = useRef<string | null>(null);
  // 세션에서 저장된 코드를 복원했는지 표시 → 문제 로드의 starter_code가 덮어쓰지 않도록 보호
  const codeRestoredRef = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);
  const remoteCursorDecorationsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteCursorWidgetRef = useRef<any>(null);

  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const updateRemoteCursor = useCallback((name: string, role: string, position: { lineNumber: number; column: number }) => {
    const editor = editorRef.current;
    const monacoInstance = monacoRef.current;
    if (!editor || !monacoInstance) return;
    const color = CURSOR_COLORS[role] ?? CURSOR_COLORS.teacher;

    if (remoteCursorWidgetRef.current) editor.removeContentWidget(remoteCursorWidgetRef.current);

    const dom = document.createElement('div');
    dom.className = 'remote-cursor-widget';
    const caret = document.createElement('div');
    caret.className = 'remote-cursor-caret';
    caret.style.backgroundColor = color;
    const label = document.createElement('div');
    label.className = 'remote-cursor-label';
    label.style.backgroundColor = color;
    label.textContent = name.length > 4 ? name.slice(0, 4) : name;
    dom.appendChild(caret);
    dom.appendChild(label);

    const widget = {
      getId: () => 'remote-cursor',
      getDomNode: () => dom,
      getPosition: () => ({ position, preference: [0] }),
    };
    remoteCursorWidgetRef.current = widget;
    editor.addContentWidget(widget);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    injectCursorStyles();

    editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
      if (isApplyingRemoteRef.current) return;
      if (!myInfo || !channelRef.current || !hasPeerRef.current) return;
      const now = Date.now();
      if (now - lastCursorSentRef.current < 250) return;
      lastCursorSentRef.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'cursor:move',
        payload: { senderId: myInfo.id, name: myInfo.name, role: 'student', position: e.position },
      });
    });
  }, [myInfo]);

  const handlePaneMouseMove = useCallback((e: React.MouseEvent) => {
    if (!myInfo || !channelRef.current || !editorPaneRef.current || !hasPeerRef.current) return;
    const now = Date.now();
    if (now - lastPointerSentRef.current < 80) return;
    lastPointerSentRef.current = now;
    const rect = editorPaneRef.current.getBoundingClientRect();
    channelRef.current.send({
      type: 'broadcast',
      event: 'pointer:move',
      payload: {
        senderId: myInfo.id,
        name: myInfo.name,
        role: 'student',
        xPct: (e.clientX - rect.left) / rect.width,
        yPct: (e.clientY - rect.top) / rect.height,
      },
    });
  }, [myInfo]);

  const handlePaneMouseLeave = useCallback(() => {
    if (!myInfo || !channelRef.current || !hasPeerRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'pointer:leave', payload: { senderId: myInfo.id } });
  }, [myInfo]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(json => {
      if (json.user) setMyInfo({ id: json.user.id, name: json.user.name });
    });
  }, []);

  useEffect(() => {
    let prevCount = -1;

    const loadFeedbacks = () => {
      if (document.hidden) return;
      fetch(`/api/feedbacks?problem_id=${problemId}`)
        .then(r => r.json())
        .then(json => {
          if (!json.feedbacks) return;
          const list = (json.feedbacks as { users?: { name: string }; content: string; created_at: string }[]).map(fb => ({
            teacherName: fb.users?.name ?? '선생님',
            content: fb.content,
            createdAt: fb.created_at,
          }));
          if (prevCount >= 0 && list.length > prevCount) {
            setFeedbackPanelOpen(true);
          }
          prevCount = list.length;
          setFeedbacks(list);
        });
    };

    loadFeedbacks();
    const interval = setInterval(loadFeedbacks, 3000);
    return () => clearInterval(interval);
  }, [problemId]);

  useEffect(() => {
    fetch(`/api/problems/${problemId}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.problem) { setLoadError(true); return; }
        setProblem({ ...json.problem, test_cases: json.test_cases ?? [] });
        const sc = json.problem.starter_code ?? '';
        setStarterCode(sc);
        // 세션에서 저장 코드를 이미 복원했으면 starter_code로 덮어쓰지 않음 (race 방지)
        if (!submissionId && !codeRestoredRef.current) { setCode(sc); codeRef.current = sc; }
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
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: problemId }),
    })
      .then(r => r.json())
      .then(json => {
        if (!json.session?.id) return;
        setSessionId(json.session.id);
        // 이전에 작성하던 코드가 있으면 복원 (제출 코드 열람 중이 아닐 때만)
        if (!submissionId && json.session.final_code) {
          codeRestoredRef.current = true;
          setCode(json.session.final_code);
          codeRef.current = json.session.final_code;
          lastSavedCodeRef.current = json.session.final_code;
        }
      });

    return () => {
      const sid = sessionIdRef.current;
      if (sid) {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        // codeRef.current가 비어있으면 final_code를 전송하지 않음 (auto-save된 코드 유지)
        const body: Record<string, unknown> = { status: 'ended' };
        if (codeRef.current) body.final_code = codeRef.current;
        fetch(`/api/sessions/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        });
      }
    };
  }, [problemId]);

  // 누가 입력했든(로컬/원격) 현재 코드를 디바운스 저장 → 새로고침 시 항상 복원 가능.
  // 혼자 풀 때도(선생님 없이도) 동일하게 동작한다.
  const scheduleAutoSave = useCallback((nextCode: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const sid = sessionIdRef.current;
      if (sid && nextCode !== lastSavedCodeRef.current) {
        lastSavedCodeRef.current = nextCode;
        fetch(`/api/sessions/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ final_code: nextCode }),
        });
      }
    }, 1000);
  }, []);

  // 안전장치: 디바운스를 놓치는 경우를 대비해 10초마다 변경분을 추가 저장
  useEffect(() => {
    const interval = setInterval(() => {
      const sid = sessionIdRef.current;
      if (sid && codeRef.current && codeRef.current !== lastSavedCodeRef.current) {
        lastSavedCodeRef.current = codeRef.current;
        fetch(`/api/sessions/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ final_code: codeRef.current }),
        });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sessionId || !myInfo) return;

    const supabase = supabaseBrowser();
    const channel = supabase.channel(`session:${sessionId}`, { config: { broadcast: { self: false } } });

    channel
      .on('broadcast', { event: 'code:update' }, ({ payload }: { payload: { senderId: string; code: string } }) => {
        if (payload.senderId === myInfo.id) return;
        if (editorRef.current && monacoRef.current) {
          isApplyingRemoteRef.current = true;
          applyMinimalEdit(editorRef.current, monacoRef.current, payload.code);
          // 편집 직후 비동기로 발생하는 커서 이동 이벤트까지 억제
          setTimeout(() => { isApplyingRemoteRef.current = false; }, 0);
        } else {
          codeRef.current = payload.code;
          setCode(payload.code);
          scheduleAutoSave(payload.code);
        }
      })
      .on('broadcast', { event: 'cursor:move' }, ({ payload }: { payload: { senderId: string; name: string; role: string; position: { lineNumber: number; column: number } } }) => {
        if (payload.senderId === myInfo.id) return;
        const displayName = teacherNameRef.current ?? payload.name;
        updateRemoteCursor(displayName, payload.role, payload.position);
      })
      .on('broadcast', { event: 'pointer:move' }, ({ payload }: { payload: { senderId: string; name: string; role: string; xPct: number; yPct: number } }) => {
        if (payload.senderId === myInfo.id) return;
        setRemotePointers(prev => ({ ...prev, [payload.senderId]: { name: payload.name, role: payload.role, xPct: payload.xPct, yPct: payload.yPct } }));
      })
      .on('broadcast', { event: 'pointer:leave' }, ({ payload }: { payload: { senderId: string } }) => {
        setRemotePointers(prev => {
          const next = { ...prev };
          delete next[payload.senderId];
          return next;
        });
      })
      // 다른 참가자가 "최신 코드 주세요"라고 요청하면, 내 현재 코드를 응답
      .on('broadcast', { event: 'sync:request' }, ({ payload }: { payload: { senderId: string } }) => {
        if (payload.senderId === myInfo.id) return;
        channel.send({
          type: 'broadcast',
          event: 'sync:state',
          payload: { senderId: myInfo.id, targetId: payload.senderId, code: codeRef.current },
        });
      })
      // 내가 요청한 최신 코드 응답을 받으면 에디터에 반영 (재접속 직후 1회만)
      .on('broadcast', { event: 'sync:state' }, ({ payload }: { payload: { senderId: string; targetId: string; code: string } }) => {
        if (payload.targetId !== myInfo.id || !awaitingSyncRef.current) return;
        awaitingSyncRef.current = false;
        if (typeof payload.code === 'string') {
          setCode(payload.code);
          codeRef.current = payload.code;
          scheduleAutoSave(payload.code);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        const all = Object.values(state).flat();
        const teacher = all.find(p => p.role === 'teacher');
        hasPeerRef.current = !!teacher;
        setTeacherOnline(!!teacher);
        setTeacherName(teacher?.name ?? null);
        teacherNameRef.current = teacher?.name ?? null;
        if (!teacher) {
          setRemotePointers({});
          const editor = editorRef.current;
          if (editor) {
            remoteCursorDecorationsRef.current = editor.deltaDecorations(remoteCursorDecorationsRef.current, []);
            if (remoteCursorWidgetRef.current) {
              editor.removeContentWidget(remoteCursorWidgetRef.current);
              remoteCursorWidgetRef.current = null;
            }
          }
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: myInfo.id, name: myInfo.name, role: 'student' });
          // 접속/재접속 시 현재 방에 있는 참가자에게 최신 코드를 요청
          awaitingSyncRef.current = true;
          channel.send({ type: 'broadcast', event: 'sync:request', payload: { senderId: myInfo.id } });
          // 3초 내 응답이 없으면(혼자 있음) DB에서 불러온 코드 유지
          setTimeout(() => { awaitingSyncRef.current = false; }, 3000);
        }
      });

    channelRef.current = channel;
    return () => { channel.unsubscribe(); channelRef.current = null; };
  }, [sessionId, myInfo, scheduleAutoSave, updateRemoteCursor]);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    codeRef.current = newCode;
    scheduleAutoSave(newCode);

    if (isApplyingRemoteRef.current) return;
    if (!myInfo || !channelRef.current || !hasPeerRef.current) return;
    pendingCodeRef.current = newCode;
    const flush = () => {
      if (pendingCodeRef.current === null) return;
      lastCodeSentRef.current = Date.now();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'code:update',
        payload: { senderId: myInfo.id, code: pendingCodeRef.current },
      });
      pendingCodeRef.current = null;
    };
    const elapsed = Date.now() - lastCodeSentRef.current;
    if (elapsed >= 80) {
      flush();
    } else {
      if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
      broadcastTimerRef.current = setTimeout(flush, 80 - elapsed);
    }
  }, [myInfo, scheduleAutoSave]);

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
        script.onerror = () => reject(new Error('실행 환경을 불러오지 못했습니다'));
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

  const requestInput = useCallback((mode: 'run' | 'submit'): Promise<string | null> => {
    return new Promise((resolve) => {
      inputResolveRef.current = resolve;
      setInputModal({ mode });
    });
  }, []);

  const closeInputModal = useCallback((value: string | null) => {
    setInputModal(null);
    const resolve = inputResolveRef.current;
    inputResolveRef.current = null;
    resolve?.(value);
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning || !problem) return;

    let stdin = '';
    if (CODE_NEEDS_INPUT.test(code)) {
      const value = await requestInput('run');
      if (value === null) return;
      stdin = value;
      lastStdinRef.current = value;
    }

    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalLines([{ text: '실행 환경 초기화 중...', type: 'info' }]);
    try {
      const pyodide = await getPyodide();
      setTerminalLines([{ text: '실행 중...', type: 'info' }]);
      const t0 = Date.now();
      const { stdout, stderr } = await Promise.race([
        runWithPyodide(pyodide, code, stdin),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('실행 시간 초과 (30초)')), 30000)),
      ]);
      const elapsed = Date.now() - t0;
      const lines: typeof terminalLines = [{ text: '$ python solution.py', type: 'meta' }];
      if (stdin.trim()) lines.push({ text: `입력: ${stdin.replace(/\n/g, ' ⏎ ')}`, type: 'info' });
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
  }, [isRunning, code, problem, getPyodide, requestInput]);

  const handleSubmit = useCallback(async () => {
    if (isRunning || !problem) return;

    const res = await fetch(`/api/problems/${problemId}/judge-cases`).catch(() => null);
    const judgeJson = res?.ok ? await res.json().catch(() => null) : null;
    const judgeCases: Array<{ input: string; expected_output: string }> = judgeJson?.test_cases ?? problem.test_cases;

    if (judgeCases.length === 0) {
      setTerminalOpen(true);
      setTerminalLines([{ text: '채점할 정답이 없습니다. 관리자에게 문의하세요.', type: 'err' }]);
      return;
    }

    // 등록된 정답(출력값)들 = 허용되는 출력 목록
    const expectedOutputs = judgeCases
      .map((tc) => tc.expected_output.trim())
      .filter((o) => o.length > 0);

    // 학생이 직접 입력값을 넣고 제출 (input()을 쓰는 경우)
    let stdin = '';
    if (CODE_NEEDS_INPUT.test(code)) {
      const value = await requestInput('submit');
      if (value === null) return;
      stdin = value;
      lastStdinRef.current = value;
    }

    setIsRunning(true);
    setTerminalOpen(true);
    setTerminalLines([{ text: '채점 중...', type: 'info' }]);

    try {
      const pyodide = await getPyodide();
      const t0 = Date.now();
      const { stdout, stderr } = await Promise.race([
        runWithPyodide(pyodide, code, stdin),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('실행 시간 초과')), 10000)),
      ]);
      const runtimeMs = Date.now() - t0;
      const actual = stdout.trim();
      const matched = !stderr && expectedOutputs.some((e) => e === actual);

      const lines: typeof terminalLines = [{ text: '$ python solution.py', type: 'meta' }];
      if (stdin.trim()) lines.push({ text: `입력: ${stdin.replace(/\n/g, ' ⏎ ')}`, type: 'info' });
      if (actual) actual.split('\n').forEach((l) => lines.push({ text: l, type: 'out' }));
      if (stderr) stderr.trimEnd().split('\n').forEach((l) => lines.push({ text: l, type: 'err' }));

      const status: 'pass' | 'fail' = matched ? 'pass' : 'fail';
      const score = matched ? 100 : 0;
      const newAttempt = attemptCount + 1;

      lines.push({ text: matched ? `정답입니다! (${runtimeMs}ms)` : `오답입니다. 출력이 정답과 달라요. (${runtimeMs}ms)`, type: matched ? 'out' : 'err' });
      setTerminalLines(lines);
      setAttemptCount(newAttempt);

      await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem_id: problemId, language: 'python', code, status, score, passed_count: matched ? 1 : 0, total_count: 1, runtime_ms: runtimeMs, elapsed_sec: seconds }),
      });

      if (sessionId) {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ final_code: code }),
        });
      }

      setModalResult({ status, passedCount: matched ? 1 : 0, totalCount: 1, runtimeMs, elapsedSec: seconds, failedCases: matched ? [] : [1], attemptNo: newAttempt });
    } catch (e) {
      setTerminalLines([{ text: e instanceof Error ? e.message : '채점 중 오류 발생', type: 'err' }]);
    } finally { setIsRunning(false); }
  }, [isRunning, code, problem, problemId, getPyodide, seconds, attemptCount, sessionId, requestInput]);

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

        <div className="flex-1 flex justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
            <Clock size={14} style={{ color: '#5A6270' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', fontFamily: 'monospace' }}>{timeStr}</span>
          </div>
          {attemptCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg" style={{ backgroundColor: '#F6F7F9', border: '1px solid #E5E8EC' }}>
              <span style={{ fontSize: '12px', color: '#5A6270' }}>제출 {attemptCount}회</span>
            </div>
          )}
          {teacherOnline && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: '#F5F3FF', border: '1px solid #C4B5FD' }}>
              <div
                className="flex items-center justify-center rounded-full text-white font-bold"
                style={{ width: 22, height: 22, fontSize: 11, backgroundColor: CURSOR_COLORS.teacher, flexShrink: 0 }}
              >
                {(teacherName ?? '선').charAt(0)}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: CURSOR_COLORS.teacher }}>
                {teacherName ?? '선생님'} 접속 중
              </span>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: CURSOR_COLORS.teacher }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {pyodideStatus === 'loading' && <span style={{ fontSize: '12px', color: '#D97706' }}>실행 환경 로딩 중...</span>}
          {pyodideStatus === 'ready' && (
            <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#16A34A' }}>
              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: '#16A34A' }} /> 준비됨
            </span>
          )}
          {feedbacks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setFeedbackPanelOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
                style={{ height: 32, border: `1px solid ${CURSOR_COLORS.teacher}`, backgroundColor: feedbackPanelOpen ? '#F5F3FF' : '#FFFFFF', fontSize: '13px', fontWeight: 600, color: CURSOR_COLORS.teacher }}
              >
                <MessageSquare size={14} /> 피드백
                <span className="flex items-center justify-center rounded-full text-white" style={{ width: 18, height: 18, fontSize: 10, backgroundColor: CURSOR_COLORS.teacher }}>{feedbacks.length}</span>
              </button>
              {feedbackPanelOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-lg overflow-hidden" style={{ width: 340, maxHeight: 400, overflowY: 'auto', zIndex: 50, border: `1px solid #E5E8EC` }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid #E5E8EC', position: 'sticky', top: 0, backgroundColor: '#FFFFFF' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#16181D' }}>선생님 피드백</span>
                    <button onClick={() => setFeedbackPanelOpen(false)} className="flex items-center justify-center rounded" style={{ width: 24, height: 24, color: '#BCC0C7' }}><X size={14} /></button>
                  </div>
                  {feedbacks.map((fb, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: i < feedbacks.length - 1 ? '1px solid #F5F3FF' : 'none' }}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ width: 22, height: 22, fontSize: 11, backgroundColor: CURSOR_COLORS.teacher }}>
                          {fb.teacherName.charAt(0)}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: CURSOR_COLORS.teacher }}>{fb.teacherName} 선생님</span>
                        <span style={{ fontSize: '11px', color: '#BCC0C7', marginLeft: 'auto' }}>
                          {new Date(fb.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: '#16181D', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{fb.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <button onClick={() => setCode(starterCode)} title="코드 초기화" className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[#F6F7F9]" style={{ fontSize: '12px', color: '#5A6270', border: '1px solid #E5E8EC', height: 32 }}>
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
            <div
                className="tiptap-render"
                style={{ fontSize: '14px', color: '#16181D', lineHeight: 1.75, marginBottom: 20 }}
                dangerouslySetInnerHTML={{ __html: problem.description }}
              />

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
                          <div className="p-3 rounded-lg" style={{ backgroundColor: '#1E1E1E', fontFamily: 'monospace', fontSize: '12px', color: '#D4D4D4', whiteSpace: 'pre' }}>{tc.input}</div>
                        </div>
                      )}
                      <div className="flex-1">
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#5A6270', marginBottom: 4 }}>예제 출력 {i + 1}</div>
                        <div className="p-3 rounded-lg" style={{ backgroundColor: '#1E1E1E', fontFamily: 'monospace', fontSize: '12px', color: '#D4D4D4', whiteSpace: 'pre' }}>{tc.expected_output}</div>
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

        <div
          ref={editorPaneRef}
          className="flex flex-col flex-1 overflow-hidden relative"
          onMouseMove={handlePaneMouseMove}
          onMouseLeave={handlePaneMouseLeave}
        >
          <PointerOverlay pointers={remotePointers} />
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-white" style={{ borderBottom: '1px solid #E5E8EC' }}>
            <span style={{ fontSize: '12px', color: '#5A6270', fontFamily: 'monospace' }}>Python 3</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
                <button
                  onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                  className="flex items-center justify-center transition-colors hover:bg-[#F6F7F9]"
                  style={{ width: 28, height: 28, fontSize: '16px', color: '#5A6270', fontWeight: 600 }}
                  title="글자 크기 줄이기"
                >−</button>
                <span style={{ fontSize: '12px', color: '#5A6270', minWidth: 28, textAlign: 'center', lineHeight: '28px', borderLeft: '1px solid #E5E8EC', borderRight: '1px solid #E5E8EC' }}>
                  {editorFontSize}
                </span>
                <button
                  onClick={() => setEditorFontSize(s => Math.min(24, s + 1))}
                  className="flex items-center justify-center transition-colors hover:bg-[#F6F7F9]"
                  style={{ width: 28, height: 28, fontSize: '16px', color: '#5A6270', fontWeight: 600 }}
                  title="글자 크기 키우기"
                >+</button>
              </div>
              <button onClick={() => setShowHint(true)} className="flex items-center gap-1.5 px-3 rounded-lg transition-colors hover:bg-[#F6F7F9]" style={{ height: 32, fontSize: '13px', color: '#5A6270' }}>
                <Lightbulb size={14} /> 힌트 보기
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
            <MonacoEditor
              height="100%"
              language="python"
              theme="paircode-dark"
              beforeMount={registerPaircodeTheme}
              onMount={handleEditorMount}
              value={code}
              onChange={(v) => handleCodeChange(v ?? '')}
              options={{ fontSize: editorFontSize, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 12, bottom: 12 }, automaticLayout: true, tabSize: 4 }}
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

      {inputModal && (
        <InputModal
          mode={inputModal.mode}
          initialValue={lastStdinRef.current}
          onConfirm={(value) => closeInputModal(value)}
          onCancel={() => closeInputModal(null)}
        />
      )}
      {modalResult && (
        <ResultModal result={modalResult} onClose={() => setModalResult(null)} onRetry={() => setModalResult(null)} onHint={() => { setModalResult(null); setShowHint(true); }} />
      )}
      {showHint && <HintPanel onClose={() => setShowHint(false)} />}
    </div>
  );
}
