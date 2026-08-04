'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type CSSProperties,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Play, Send, ChevronDown, ChevronUp, Lightbulb, Clock, RotateCcw, MessageSquare, X, Square, Sparkles, CircleHelp, LoaderCircle } from 'lucide-react';
import { HintPanel } from '@/components/demo/HintPanel';
import { registerCoveTheme } from '@/lib/monaco/theme';
import { injectCursorStyles, CURSOR_COLORS } from '@/lib/monaco/cursor';
import { applyMinimalEdit } from '@/lib/monaco/applyEdit';
import {
  WholePagePointerOverlay,
  type WholePagePointerOverlayHandle,
} from '@/components/collab/WholePagePointerOverlay';
import { ConsoleTerminal, type TerminalLine } from '@/components/collab/ConsoleTerminal';
import { AiFeedbackPanel, type AiFeedbackItem } from '@/components/collab/AiFeedbackPanel';
import { SyntaxErrorCoach } from '@/components/collab/SyntaxErrorCoach';
import { InteractiveRunner, isInteractiveSupported } from '@/lib/pyodide/interactiveRunner';
import { loadPyodide as loadPyodideFallback } from '@/lib/pyodide/loader';
import {
  createSyntaxLesson,
  explainPythonError,
  isSyntaxExecutionError,
  type PythonExecutionError,
  type SyntaxLesson,
} from '@/lib/pyodide/pythonError';
import {
  canAskAiForSyntaxHelp,
  recordSyntaxAttempt,
  type SyntaxAttemptState,
} from '@/lib/pyodide/syntaxCoach';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { OnMount } from '@monaco-editor/react';
import type { DbProblem, DbTestCase, DbProblemHint, ProblemDifficulty } from '@/lib/types/db';
import ThemeToggle from '@/components/ThemeToggle';
import {
  SubmissionResultDrawer,
  type SubmissionResult,
} from '@/components/judge/SubmissionResultDrawer';
import { shouldReconcileSubmission } from '@/lib/judge/reconciliationPolicy';
import { SampleRunControls } from '@/components/judge/SampleRunControls';
import { PublicProblemStatement } from '@/components/problems/PublicProblemStatement';
import {
  createSampleInputQueue,
  isSampleOutputMatch,
} from '@/lib/pyodide/sampleRun';
import type {
  ProblemNavigation,
  ProblemNavigationItem,
} from '@/lib/problems/navigation';
import {
  loadProblemLearningContext,
  loadProblemTransitionSnapshot,
  type ProblemTransitionSnapshot,
} from '@/lib/problems/transition';
import {
  encodeReturnTo,
  validateReturnTo,
} from '@/lib/navigation/returnTo';
import {
  CURRICULUM_PANEL_DESKTOP_WIDTH,
  CurriculumNavigator,
} from '@/components/curriculum/CurriculumNavigator';
import {
  updateLearningProgress,
  type LearningContext,
  type LearningContextProblem,
} from '@/lib/curriculum/learningContext';
import {
  isTeacherPointerLeave,
  normalizePointerPosition,
  parseTeacherPointerMove,
  resolvePointerSurface,
  type CollaborationSurface,
  type StudentPointerLeavePayload,
  type StudentPointerMovePayload,
} from '@/lib/collab/pointerSurfaces';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#1E1E1E' }}>
      <span style={{ fontSize: '13px', color: 'var(--color-sub)' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type ProblemDetail = DbProblem & {
  test_cases: Pick<DbTestCase, 'id' | 'input' | 'expected_output' | 'is_sample' | 'order_no'>[];
  hints: Pick<DbProblemHint, 'id' | 'hint_text' | 'order_no'>[];
};

type PresenceUser = { userId: string; name: string; role: string };
type ProblemTransitionDirection = 'previous' | 'next';
type ProblemNavigationFailure = {
  destination: ProblemNavigationItem | null;
  direction: ProblemTransitionDirection | null;
};
type ActiveSyntaxCoach = {
  error: PythonExecutionError;
  lesson: SyntaxLesson;
  code: string;
  attemptCount: number;
};

// 선생님 커서가 이 시간(ms) 동안 움직이지 않으면 학생 화면에서 숨긴다.
// (포인터 쪽 숨김은 WholePagePointerOverlay가 직접 관리)
const CURSOR_IDLE_HIDE_MS = 3000;

// 학생 화면에서는 선생님의 실제 이름(가입 시 입력값) 대신 항상 이 호칭으로 표시한다.
const TEACHER_DISPLAY_NAME = '선생님';

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

// 비지원 브라우저(cross-origin isolated 아님) 폴백: 메인 스레드에서 단발 실행 (대화식 입력 없음)
async function runFallbackOnce(userCode: string, stdin = ''): Promise<{
  stdout: string;
  stderr: string;
  pythonError: PythonExecutionError | null;
}> {
  const pyodide = await loadPyodideFallback();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const py = pyodide as any;
  py.globals.set('_user_code', userCode);
  py.globals.set('_stdin_text', stdin);
  const result = await py.runPythonAsync(`
import sys, io, traceback, json, linecache
_saved_stdout = sys.stdout
_saved_stdin = sys.stdin
_captured = io.StringIO()
sys.stdout = _captured
sys.stdin = io.StringIO(_stdin_text)
_stderr_msg = ''
_error = None
try:
    linecache.cache['solution.py'] = (
        len(_user_code),
        None,
        _user_code.splitlines(True),
        'solution.py',
    )
    exec(compile(_user_code, 'solution.py', 'exec'), {'__name__': '__main__'})
except BaseException as exc:
    error_type = type(exc).__name__
    error_message = str(exc)
    error_line = getattr(exc, 'lineno', None)
    error_offset = getattr(exc, 'offset', None)
    if isinstance(exc, SyntaxError):
        error_display = ''.join(traceback.format_exception_only(type(exc), exc))
    else:
        frames = [frame for frame in traceback.extract_tb(exc.__traceback__) if frame.filename == 'solution.py']
        if frames:
            error_line = frames[-1].lineno
        error_display = (
            'Traceback (most recent call last):\\n'
            + ''.join(traceback.format_list(frames))
            + ''.join(traceback.format_exception_only(type(exc), exc))
        )
    _error = json.dumps({
        'type': error_type,
        'message': error_message,
        'line': error_line,
        'offset': error_offset,
        'display': error_display,
    }, ensure_ascii=False)
finally:
    sys.stdout = _saved_stdout
    sys.stdin = _saved_stdin
(_captured.getvalue(), _stderr_msg, _error)
`) as [string, string, string | null];
  return {
    stdout: result[0],
    stderr: result[1],
    pythonError: result[2] ? JSON.parse(result[2]) as PythonExecutionError : null,
  };
}

export default function ProblemSolveClient({
  problemId,
  submissionId,
  returnTo,
}: {
  problemId: string;
  submissionId?: string;
  returnTo?: string;
}) {
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [navigation, setNavigation] = useState<ProblemNavigation | null>(null);
  const [learningContext, setLearningContext] = useState<LearningContext | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isProblemTransitioning, setIsProblemTransitioning] = useState(false);
  const [lastCatalogReturn, setLastCatalogReturn] = useState<string | null>(null);
  const [problemTransitionDirection, setProblemTransitionDirection] = useState<ProblemTransitionDirection | null>(null);
  const [navigationFailure, setNavigationFailure] = useState<ProblemNavigationFailure | null>(null);
  const [code, setCode] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [lastPythonError, setLastPythonError] = useState<PythonExecutionError | null>(null);
  const [terminalTab, setTerminalTab] = useState<'terminal' | 'error'>('terminal');
  const [errorExplainSeen, setErrorExplainSeen] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSampleIndex, setActiveSampleIndex] = useState<number | null>(null);
  const [modalResult, setModalResult] = useState<SubmissionResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [leftWidth, setLeftWidth] = useState(46);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [interactiveSupported, setInteractiveSupported] = useState(true);
  const [starterCode, setStarterCode] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [teacherOnline, setTeacherOnline] = useState(false);
  // 학생 화면에는 선생님 이름을 노출하지 않으므로 접속 여부(teacherOnline)만 있으면 된다.
  const [myInfo, setMyInfo] = useState<{ id: string; name: string } | null>(null);
  const [feedbacks, setFeedbacks] = useState<{ teacherName: string; content: string; createdAt: string }[]>([]);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState(false);
  const [aiFeedbacks, setAiFeedbacks] = useState<AiFeedbackItem[]>([]);
  const [aiFeedbackPanelOpen, setAiFeedbackPanelOpen] = useState(false);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);
  const [syntaxCoach, setSyntaxCoach] = useState<ActiveSyntaxCoach | null>(null);
  const [syntaxAiExplanation, setSyntaxAiExplanation] = useState<string | null>(null);
  const [syntaxAiError, setSyntaxAiError] = useState<string | null>(null);

  const runnerRef = useRef<InteractiveRunner | null>(null);
  const runOffRef = useRef<(() => void) | null>(null);
  const runFinishRef = useRef<((stopped: boolean) => void) | null>(null);
  const runStdoutRef = useRef('');
  const runStderrRef = useRef('');
  const runPythonErrorRef = useRef<PythonExecutionError | null>(null);
  const syntaxAttemptRef = useRef<SyntaxAttemptState | null>(null);
  const manualInputQueueRef = useRef<string[]>([]);
  const runOutBufRef = useRef<Array<{ text: string; kind: TerminalLine['kind'] }>>([]);
  const runOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myInfoRef = useRef<{ id: string; name: string } | null>(null);
  const isDragging = useRef(false);
  const isDraggingTerminalRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCodeSentRef = useRef(0);
  const pendingCodeRef = useRef<string | null>(null);
  const lastCursorSentRef = useRef(0);
  const lastPointerSentRef = useRef(0);
  const lastPointerSurfaceRef = useRef<CollaborationSurface | null>(null);
  const wholePagePointerRef = useRef<WholePagePointerOverlayHandle>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const isApplyingRemoteRef = useRef(false);
  const hasPeerRef = useRef(false);
  const codeRef = useRef(code);
  const problemRef = useRef<ProblemDetail | null>(null);
  const navigationRef = useRef<ProblemNavigation | null>(null);
  const problemTransitioningRef = useRef(false);
  const problemTransitionControllerRef = useRef<AbortController | null>(null);
  const initialProblemIdRef = useRef(problemId);
  const initialSubmissionIdRef = useRef(submissionId);
  const validatedReturnTo = validateReturnTo(returnTo, 'student');
  const sessionIdRef = useRef<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingSyncRef = useRef(false);
  const lastSavedCodeRef = useRef<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);
  const remoteCursorDecorationsRef = useRef<string[]>([]);
  const syntaxErrorDecorationsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteCursorWidgetRef = useRef<any>(null);

  useEffect(() => {
    if (validatedReturnTo) return;
    setLastCatalogReturn(
      validateReturnTo(sessionStorage.getItem('cove-last-student-catalog'), 'student'),
    );
  }, [validatedReturnTo]);
  // 선생님 커서가 멈추면 일정 시간 뒤 커서 위젯을 숨기는 타이머
  const remoteCursorIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { problemRef.current = problem; }, [problem]);
  useEffect(() => { navigationRef.current = navigation; }, [navigation]);
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
    label.textContent = role === 'teacher' ? TEACHER_DISPLAY_NAME : (name.length > 4 ? name.slice(0, 4) : name);
    dom.appendChild(caret);
    dom.appendChild(label);

    const widget = {
      getId: () => 'remote-cursor',
      getDomNode: () => dom,
      getPosition: () => ({ position, preference: [0] }),
    };
    remoteCursorWidgetRef.current = widget;
    editor.addContentWidget(widget);

    // 커서가 움직일 때마다 타이머 리셋 → 3초간 정지하면 학생 화면에서 커서 위젯을 숨긴다.
    if (remoteCursorIdleTimerRef.current) clearTimeout(remoteCursorIdleTimerRef.current);
    remoteCursorIdleTimerRef.current = setTimeout(() => {
      remoteCursorIdleTimerRef.current = null;
      const ed = editorRef.current;
      if (ed && remoteCursorWidgetRef.current) {
        ed.removeContentWidget(remoteCursorWidgetRef.current);
        remoteCursorWidgetRef.current = null;
      }
    }, CURSOR_IDLE_HIDE_MS);
  }, []);

  const handleEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    injectCursorStyles();
    if (!document.getElementById('cove-syntax-error-styles')) {
      const style = document.createElement('style');
      style.id = 'cove-syntax-error-styles';
      style.textContent = `
        .cove-syntax-error-line {
          background: rgba(239, 68, 68, 0.16);
          border-left: 3px solid #F87171;
        }
        .cove-syntax-error-glyph {
          background: #F87171;
          border-radius: 999px;
          height: 8px !important;
          margin-left: 5px;
          margin-top: 5px;
          width: 8px !important;
        }
      `;
      document.head.appendChild(style);
    }

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

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/me', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (json?.user) setMyInfo({ id: json.user.id, name: json.user.name });
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!sessionId || !myInfo || !problem?.id) return;

    const sendLeave = () => {
      if (!lastPointerSurfaceRef.current) return;
      lastPointerSurfaceRef.current = null;
      if (!channelRef.current || !hasPeerRef.current) return;

      const payload: StudentPointerLeavePayload = {
        senderId: myInfo.id,
        sessionId,
        problemId: problem.id,
        role: 'student',
      };
      void channelRef.current.send({
        type: 'broadcast',
        event: 'student:pointer:leave',
        payload,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!channelRef.current || !hasPeerRef.current) {
        lastPointerSurfaceRef.current = null;
        return;
      }

      const resolved = resolvePointerSurface(event.target);
      if (!resolved) {
        sendLeave();
        return;
      }

      const now = Date.now();
      if (now - lastPointerSentRef.current < 80) return;
      const position = normalizePointerPosition(
        event.clientX,
        event.clientY,
        resolved.element.getBoundingClientRect()
      );
      if (!position) return;

      lastPointerSentRef.current = now;
      lastPointerSurfaceRef.current = resolved.surface;
      const payload: StudentPointerMovePayload = {
        senderId: myInfo.id,
        sessionId,
        problemId: problem.id,
        name: myInfo.name,
        role: 'student',
        surface: resolved.surface,
        ...position,
        sentAt: now,
      };
      void channelRef.current.send({
        type: 'broadcast',
        event: 'student:pointer:move',
        payload,
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) sendLeave();
    };

    document.addEventListener('pointermove', handlePointerMove, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', sendLeave);
    return () => {
      sendLeave();
      document.removeEventListener('pointermove', handlePointerMove, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', sendLeave);
    };
  }, [myInfo, problem?.id, sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    let prevCount = -1;
    let loading = false;
    const controller = new AbortController();
    setFeedbacks([]);

    const loadFeedbacks = async () => {
      if (document.hidden || loading || controller.signal.aborted) return;
      loading = true;
      try {
        const response = await fetch(
          `/api/feedbacks?session_id=${sessionId}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const json = await response.json();
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
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      } finally {
        loading = false;
      }
    };

    void loadFeedbacks();
    const interval = setInterval(loadFeedbacks, 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    setAiFeedbacks([]);
    fetch(`/api/ai-feedbacks?session_id=${sessionId}`, {
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (json) setAiFeedbacks(json.feedbacks ?? []);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [sessionId]);

  const applyProblemSnapshot = useCallback((snapshot: ProblemTransitionSnapshot) => {
    runnerRef.current?.stop();
    runFinishRef.current?.(true);
    runOffRef.current?.();
    runOffRef.current = null;
    runFinishRef.current = null;
    runnerRef.current?.dispose();
    runnerRef.current = null;
    manualInputQueueRef.current = [];
    runStdoutRef.current = '';
    runStderrRef.current = '';
    runPythonErrorRef.current = null;
    pendingCodeRef.current = null;
    awaitingSyncRef.current = false;
    hasPeerRef.current = false;
    if (broadcastTimerRef.current) clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = null;
    if (runOutTimerRef.current) clearTimeout(runOutTimerRef.current);
    runOutTimerRef.current = null;
    runOutBufRef.current = [];

    const editor = editorRef.current;
    if (editor) {
      remoteCursorDecorationsRef.current = editor.deltaDecorations(
        remoteCursorDecorationsRef.current,
        [],
      );
      syntaxErrorDecorationsRef.current = editor.deltaDecorations(
        syntaxErrorDecorationsRef.current,
        [],
      );
      if (remoteCursorWidgetRef.current) {
        editor.removeContentWidget(remoteCursorWidgetRef.current);
        remoteCursorWidgetRef.current = null;
      }
    }

    problemRef.current = snapshot.problem;
    navigationRef.current = snapshot.navigation;
    codeRef.current = snapshot.code;
    sessionIdRef.current = snapshot.sessionId;
    lastSavedCodeRef.current = snapshot.lastSavedCode;

    setProblem(snapshot.problem);
    setNavigation(snapshot.navigation);
    setLearningContext(snapshot.learningContext);
    setStarterCode(snapshot.starterCode);
    setCode(snapshot.code);
    setSessionId(snapshot.sessionId);
    setAttemptCount(snapshot.attemptCount);
    setSeconds(0);
    setTerminalLines([]);
    setTerminalOpen(true);
    setLastPythonError(null);
    setTerminalTab('terminal');
    setErrorExplainSeen(false);
    setAwaitingInput(false);
    setIsRunning(false);
    setActiveSampleIndex(null);
    setModalResult(null);
    setShowHint(false);
    setFeedbacks([]);
    setFeedbackPanelOpen(false);
    setAiFeedbacks([]);
    setAiFeedbackPanelOpen(false);
    setAiFeedbackLoading(false);
    setSyntaxCoach(null);
    setSyntaxAiExplanation(null);
    setSyntaxAiError(null);
    syntaxAttemptRef.current = null;
    setTeacherOnline(false);
    wholePagePointerRef.current?.clear();
    setLoadError(false);
    setNavigationFailure(null);
    setProblemTransitionDirection(null);
    problemTransitioningRef.current = false;
    setIsProblemTransitioning(false);
  }, []);

  const loadDeferredLearningContext = useCallback((
    problemId: string,
    signal: AbortSignal,
  ) => {
    void loadProblemLearningContext({ problemId, signal })
      .then((context) => {
        if (!signal.aborted && problemRef.current?.id === problemId) {
          setLearningContext(context);
        }
      })
      .catch(() => {
        // Curriculum context is supplementary; the editor remains usable.
      });
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    problemTransitionControllerRef.current = controller;

    loadProblemTransitionSnapshot({
      problemId: initialProblemIdRef.current,
      submissionId: initialSubmissionIdRef.current,
      previousSessionId: null,
      signal: controller.signal,
    })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          applyProblemSnapshot(snapshot);
          loadDeferredLearningContext(snapshot.problem.id, controller.signal);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(true);
        setProblemTransitionDirection(null);
        problemTransitioningRef.current = false;
        setIsProblemTransitioning(false);
      });

    return () => {
      controller.abort();
      if (problemTransitionControllerRef.current === controller) {
        problemTransitionControllerRef.current = null;
      }
    };
  }, [applyProblemSnapshot, loadDeferredLearningContext]);

  useEffect(() => () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    fetch(`/api/sessions/${sid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'ended',
        final_code: codeRef.current,
      }),
      keepalive: true,
    });
  }, []);

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

  const saveDraftBeforeNavigation = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const sid = sessionIdRef.current;
    const currentCode = codeRef.current;
    if (!sid || currentCode === lastSavedCodeRef.current) return;

    lastSavedCodeRef.current = currentCode;
    fetch(`/api/sessions/${sid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ final_code: currentCode }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  const transitionToProblem = useCallback(async ({
    destination,
    direction,
    updateHistory,
  }: {
    destination: ProblemNavigationItem;
    direction: ProblemTransitionDirection | null;
    updateHistory: 'push' | 'none';
  }) => {
    const displayedProblem = problemRef.current;
    if (!displayedProblem || problemTransitioningRef.current) return;

    saveDraftBeforeNavigation();
    runnerRef.current?.stop();
    runFinishRef.current?.(true);
    setIsRunning(false);
    setActiveSampleIndex(null);
    setAwaitingInput(false);
    setNavigationFailure(null);
    setProblemTransitionDirection(direction);
    problemTransitioningRef.current = true;
    setIsProblemTransitioning(true);

    problemTransitionControllerRef.current?.abort();
    const controller = new AbortController();
    problemTransitionControllerRef.current = controller;
    const previousSessionId = sessionIdRef.current;
    const previousCode = codeRef.current;

    try {
      const snapshot = await loadProblemTransitionSnapshot({
        problemId: destination.id,
        previousSessionId,
        previousCode,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      applyProblemSnapshot(snapshot);
      loadDeferredLearningContext(snapshot.problem.id, controller.signal);
      if (updateHistory === 'push') {
        const returnQuery = validatedReturnTo
          ? `?returnTo=${encodeReturnTo(validatedReturnTo)}`
          : '';
        window.history.pushState(
          null,
          '',
          `/problems/${snapshot.problem.id}${returnQuery}`,
        );
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;

      try {
        const restoreResponse = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ problem_id: displayedProblem.id }),
          signal: controller.signal,
        });
        const restored = restoreResponse.ok
          ? await restoreResponse.json()
          : null;
        const restoredSessionId = restored?.session?.id as string | undefined;
        if (restoredSessionId) {
          await fetch(`/api/sessions/${restoredSessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ final_code: codeRef.current }),
            signal: controller.signal,
          });
          sessionIdRef.current = restoredSessionId;
          lastSavedCodeRef.current = codeRef.current;
          setSessionId(restoredSessionId);
        }
      } catch {
        if (controller.signal.aborted) return;
      }

      if (updateHistory === 'none') {
        window.history.replaceState(null, '', `/problems/${displayedProblem.id}`);
      }
      setNavigationFailure({ destination, direction });
      setProblemTransitionDirection(null);
      problemTransitioningRef.current = false;
      setIsProblemTransitioning(false);
    } finally {
      if (problemTransitionControllerRef.current === controller) {
        problemTransitionControllerRef.current = null;
      }
    }
  }, [
    applyProblemSnapshot,
    loadDeferredLearningContext,
    saveDraftBeforeNavigation,
    validatedReturnTo,
  ]);

  const handleNavigateProblem = useCallback((
    destination: ProblemNavigationItem | null,
    direction: ProblemTransitionDirection,
  ) => {
    if (!destination || isRunning || problemTransitioningRef.current) return;
    void transitionToProblem({
      destination,
      direction,
      updateHistory: 'push',
    });
  }, [isRunning, transitionToProblem]);

  const handleCurriculumProblemSelect = useCallback((
    destination: LearningContextProblem,
  ) => {
    if (
      destination.id === problemRef.current?.id
      || isRunning
      || problemTransitioningRef.current
    ) {
      return;
    }

    void transitionToProblem({
      destination: {
        id: destination.id,
        problem_no: destination.problemNo,
        title: destination.title,
        chapter_id: '',
        chapter_order_no: 0,
        problem_order_no: destination.orderNo,
      },
      direction: null,
      updateHistory: 'push',
    });
  }, [isRunning, transitionToProblem]);

  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/problems\/([^/]+)\/?$/);
      const destinationId = match?.[1] ? decodeURIComponent(match[1]) : null;
      const displayedProblem = problemRef.current;
      if (!destinationId || !displayedProblem || destinationId === displayedProblem.id) return;

      const displayedNavigation = navigationRef.current;
      const destination = displayedNavigation?.next?.id === destinationId
        ? displayedNavigation.next
        : displayedNavigation?.previous?.id === destinationId
          ? displayedNavigation.previous
          : {
              id: destinationId,
              problem_no: 0,
              title: '',
              chapter_id: '',
              chapter_order_no: 0,
              problem_order_no: 0,
            };
      const direction: ProblemTransitionDirection | null =
        displayedNavigation?.next?.id === destinationId
          ? 'next'
          : displayedNavigation?.previous?.id === destinationId
            ? 'previous'
            : null;

      void transitionToProblem({
        destination,
        direction,
        updateHistory: 'none',
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [transitionToProblem]);

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
    const pointerOverlay = wholePagePointerRef.current;

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
        updateRemoteCursor(payload.name, payload.role, payload.position);
      })
      .on('broadcast', { event: 'teacher:pointer:move' }, ({ payload }: { payload: unknown }) => {
        const currentProblemId = problemRef.current?.id;
        if (!currentProblemId) return;
        const pointer = parseTeacherPointerMove(payload, {
          viewerId: myInfo.id,
          sessionId,
          problemId: currentProblemId,
        });
        if (!pointer) return;
        // 선생님의 실제 이름 대신 항상 '선생님'으로 표시 (숨김 타이머는 오버레이가 관리)
        wholePagePointerRef.current?.show({ ...pointer, name: TEACHER_DISPLAY_NAME });
      })
      .on('broadcast', { event: 'teacher:pointer:leave' }, ({ payload }: { payload: unknown }) => {
        const currentProblemId = problemRef.current?.id;
        if (!currentProblemId) return;
        if (isTeacherPointerLeave(payload, {
          viewerId: myInfo.id,
          sessionId,
          problemId: currentProblemId,
        })) {
          wholePagePointerRef.current?.clear();
        }
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
        if (!teacher) {
          wholePagePointerRef.current?.clear();
          if (remoteCursorIdleTimerRef.current) { clearTimeout(remoteCursorIdleTimerRef.current); remoteCursorIdleTimerRef.current = null; }
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
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
      pointerOverlay?.clear();
      if (remoteCursorIdleTimerRef.current) { clearTimeout(remoteCursorIdleTimerRef.current); remoteCursorIdleTimerRef.current = null; }
    };
  }, [sessionId, myInfo, scheduleAutoSave, updateRemoteCursor]);

  const handleCodeChange = useCallback((newCode: string) => {
    if (isProblemTransitioning) return;
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
  }, [isProblemTransitioning, myInfo, scheduleAutoSave]);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => { myInfoRef.current = myInfo; }, [myInfo]);

  useEffect(() => {
    setInteractiveSupported(isInteractiveSupported());
    return () => { runnerRef.current?.dispose(); runnerRef.current = null; };
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!isDraggingTerminalRef.current || !editorPaneRef.current) return;
      const rect = editorPaneRef.current.getBoundingClientRect();
      const h = rect.bottom - e.clientY;
      setTerminalHeight(Math.max(120, Math.min(rect.height - 160, h)));
    };
    const up = () => {
      if (isDraggingTerminalRef.current) {
        isDraggingTerminalRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  const startTerminalDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (!terminalOpen) return;
    isDraggingTerminalRef.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, [terminalOpen]);

  const timeStr = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  const appendTerminal = useCallback((text: string, kind: TerminalLine['kind']) => {
    setTerminalLines((prev) => [...prev, { text, kind }]);
  }, []);

  const broadcastRun = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!channelRef.current || !hasPeerRef.current || !myInfoRef.current) return;
    channelRef.current.send({ type: 'broadcast', event, payload: { senderId: myInfoRef.current.id, ...payload } });
  }, []);

  const flushRunOut = useCallback(() => {
    if (runOutTimerRef.current) { clearTimeout(runOutTimerRef.current); runOutTimerRef.current = null; }
    if (runOutBufRef.current.length === 0) return;
    const chunks = runOutBufRef.current;
    runOutBufRef.current = [];
    broadcastRun('run:stdout', { chunks });
  }, [broadcastRun]);

  const queueRunOut = useCallback((text: string, kind: TerminalLine['kind']) => {
    runOutBufRef.current.push({ text, kind });
    if (!runOutTimerRef.current) {
      runOutTimerRef.current = setTimeout(() => { runOutTimerRef.current = null; flushRunOut(); }, 100);
    }
  }, [flushRunOut]);

  const ensureRunner = useCallback((): InteractiveRunner | null => {
    if (runnerRef.current && !runnerRef.current.isFailed) return runnerRef.current;
    if (runnerRef.current) { runnerRef.current.dispose(); runnerRef.current = null; }
    if (!isInteractiveSupported()) return null;
    try {
      runnerRef.current = new InteractiveRunner();
    } catch {
      return null;
    }
    return runnerRef.current;
  }, []);

  // 터미널에서 코드를 대화식으로 실행하고, 프로그램 종료(done) 시 누적 출력을 반환
  const executeInTerminal = useCallback((sourceCode: string, options?: {
    sampleInput?: string;
  }): Promise<{
    stdout: string;
    stderr: string;
    pythonError: PythonExecutionError | null;
    stopped: boolean;
  }> => {
    runStdoutRef.current = '';
    runStderrRef.current = '';
    runPythonErrorRef.current = null;
    manualInputQueueRef.current = [];
    setLastPythonError(null);
    setTerminalTab('terminal');
    setErrorExplainSeen(false);
    broadcastRun('run:start', {});
    const runner = ensureRunner();

    if (!runner) {
      return runFallbackOnce(sourceCode, options?.sampleInput ?? '')
        .then(({ stdout, stderr, pythonError }) => {
          if (stdout) { appendTerminal(stdout, 'out'); queueRunOut(stdout, 'out'); }
          if (stderr) { appendTerminal(stderr, 'err'); queueRunOut(stderr, 'err'); }
          if (pythonError) {
            appendTerminal(pythonError.display, 'err');
            queueRunOut(pythonError.display, 'err');
            setLastPythonError(pythonError);
          }
          if (!stdout && !stderr && !pythonError) appendTerminal('(출력 없음)\n', 'info');
          flushRunOut();
          broadcastRun('run:end', {});
          return { stdout, stderr, pythonError, stopped: false };
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : '실행 오류';
          appendTerminal(msg + '\n', 'err');
          broadcastRun('run:end', {});
          return { stdout: '', stderr: msg, pythonError: null, stopped: false };
        });
    }

    if (!runner.isReady) {
      appendTerminal('실행 환경(Python)을 불러오는 중입니다... 최초 실행은 몇 초 걸릴 수 있어요.\n', 'info');
    }

    const sampleInputQueue = options?.sampleInput === undefined
      ? null
      : createSampleInputQueue(options.sampleInput);
    let inputExhaustedNoticeShown = false;

    return new Promise((resolve) => {
      const finish = (stopped: boolean) => {
        if (runOffRef.current) { runOffRef.current(); runOffRef.current = null; }
        runFinishRef.current = null;
        manualInputQueueRef.current = [];
        setAwaitingInput(false);
        flushRunOut();
        broadcastRun('run:end', {});
        resolve({
          stdout: runStdoutRef.current,
          stderr: runStderrRef.current,
          pythonError: runPythonErrorRef.current,
          stopped,
        });
      };
      runFinishRef.current = finish;

      const off = runner.on((ev) => {
        if (ev.type === 'stdout') {
          runStdoutRef.current += ev.text;
          appendTerminal(ev.text, 'out');
          queueRunOut(ev.text, 'out');
        } else if (ev.type === 'stderr') {
          runStderrRef.current += ev.text;
          appendTerminal(ev.text, 'err');
          queueRunOut(ev.text, 'err');
        } else if (ev.type === 'pythonError') {
          runPythonErrorRef.current = ev.error;
          setLastPythonError(ev.error);
          appendTerminal(ev.error.display, 'err');
          queueRunOut(ev.error.display, 'err');
        } else if (ev.type === 'stdin') {
          flushRunOut();
          const inputLine = sampleInputQueue && sampleInputQueue.length > 0
            ? sampleInputQueue.shift()
            : manualInputQueueRef.current.shift();
          if (inputLine !== undefined) {
            appendTerminal(inputLine + '\n', 'in');
            broadcastRun('run:stdin', { text: inputLine });
            setAwaitingInput(false);
            queueMicrotask(() => runner.provideInput(inputLine));
          } else {
            if (sampleInputQueue && !inputExhaustedNoticeShown) {
              inputExhaustedNoticeShown = true;
              appendTerminal(
                '테스트 입력을 모두 사용했습니다. 필요한 입력을 직접 입력해 주세요.\n',
                'info',
              );
            }
            setAwaitingInput(true);
            broadcastRun('run:waiting', {});
          }
        } else if (ev.type === 'done') {
          finish(false);
        } else if (ev.type === 'fatal') {
          const message = ev.text || '실행 오류';
          runStderrRef.current += message;
          appendTerminal(message + '\n', 'err');
          finish(false);
        }
      });
      runOffRef.current = off;
      runner.run(sourceCode);
    });
  }, [ensureRunner, appendTerminal, broadcastRun, queueRunOut, flushRunOut]);

  const handleTerminalInput = useCallback((value: string) => {
    const inputLines = value === '' ? [''] : createSampleInputQueue(value);
    const [firstLine = '', ...remainingLines] = inputLines;
    manualInputQueueRef.current = remainingLines;
    appendTerminal(firstLine + '\n', 'in');
    broadcastRun('run:stdin', { text: firstLine });
    setAwaitingInput(false);
    runnerRef.current?.provideInput(firstLine);
  }, [appendTerminal, broadcastRun]);

  const handleStop = useCallback(() => {
    runnerRef.current?.stop();
    manualInputQueueRef.current = [];
    appendTerminal('\n[실행을 중단했습니다]\n', 'meta');
    runFinishRef.current?.(true);
    setAwaitingInput(false);
    setIsRunning(false);
    setActiveSampleIndex(null);
  }, [appendTerminal]);

  // 오류 코치의 위치 표시를 누르면 에디터의 그 자리로 커서를 옮긴다.
  const focusEditorLine = useCallback((line: number, column: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();
  }, []);

  const updateSyntaxCoaching = useCallback((
    pythonError: PythonExecutionError | null,
    executedCode: string,
  ) => {
    const editor = editorRef.current;
    if (editor) {
      syntaxErrorDecorationsRef.current = editor.deltaDecorations(
        syntaxErrorDecorationsRef.current,
        [],
      );
    }

    setSyntaxAiExplanation(null);
    setSyntaxAiError(null);

    if (!isSyntaxExecutionError(pythonError)) {
      syntaxAttemptRef.current = null;
      setSyntaxCoach(null);
      return;
    }

    const lesson = createSyntaxLesson(pythonError);
    if (!lesson) return;

    const nextAttempt = recordSyntaxAttempt(
      syntaxAttemptRef.current,
      lesson.category,
      executedCode,
    );
    syntaxAttemptRef.current = nextAttempt;
    setSyntaxCoach({
      error: pythonError,
      lesson,
      code: executedCode,
      attemptCount: nextAttempt.count,
    });
    setTerminalOpen(true);
    setTerminalTab('error');
    setErrorExplainSeen(true);

    if (editor && monacoRef.current && pythonError.line) {
      const model = editor.getModel();
      const line = Math.min(
        Math.max(pythonError.line, 1),
        model?.getLineCount() ?? pythonError.line,
      );
      syntaxErrorDecorationsRef.current = editor.deltaDecorations([], [{
        range: new monacoRef.current.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'cove-syntax-error-line',
          glyphMarginClassName: 'cove-syntax-error-glyph',
          hoverMessage: { value: lesson.title },
        },
      }]);
      editor.revealLineInCenterIfOutsideViewport(line);
    }
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning || isProblemTransitioning || !problem) return;
    setIsRunning(true);
    setActiveSampleIndex(null);
    setTerminalOpen(true);
    setTerminalLines([{ text: '$ python solution.py\n', kind: 'meta' }]);
    const result = await executeInTerminal(code);
    if (!result.stopped) updateSyntaxCoaching(result.pythonError, code);
    if (!result.stopped) appendTerminal('\n[프로그램이 종료되었습니다]\n', 'meta');
    setIsRunning(false);
  }, [isProblemTransitioning, isRunning, problem, code, executeInTerminal, updateSyntaxCoaching, appendTerminal]);

  const handleRunSample = useCallback(async (
    sampleCase: ProblemDetail['test_cases'][number],
    sampleIndex: number,
  ) => {
    if (isRunning || isProblemTransitioning || !problem) return;

    const sampleNumber = sampleIndex + 1;
    const queuedLineCount = createSampleInputQueue(sampleCase.input).length;
    setIsRunning(true);
    setActiveSampleIndex(sampleIndex);
    setTerminalOpen(true);
    setTerminalTab('terminal');
    setTerminalLines([
      { text: `$ python solution.py · 테스트 ${sampleNumber}\n`, kind: 'meta' },
      {
        text: queuedLineCount > 0
          ? `테스트 ${sampleNumber} 입력 ${queuedLineCount}줄을 자동으로 사용합니다.\n`
          : `입력이 없는 테스트 ${sampleNumber}을 실행합니다.\n`,
        kind: 'info',
      },
    ]);

    const result = await executeInTerminal(code, { sampleInput: sampleCase.input });
    if (!result.stopped) updateSyntaxCoaching(result.pythonError, code);

    if (!result.stopped && !result.pythonError && !result.stderr) {
      if (isSampleOutputMatch(result.stdout, sampleCase.expected_output)) {
        appendTerminal(`\n✓ 테스트 ${sampleNumber} 결과가 예상 출력과 일치합니다.\n`, 'meta');
      } else {
        appendTerminal(`\n✕ 테스트 ${sampleNumber} 결과가 예상 출력과 다릅니다.\n`, 'err');
        appendTerminal(
          `예상 출력:\n${sampleCase.expected_output || '(출력 없음)'}\n`,
          'info',
        );
      }
    } else if (!result.stopped) {
      appendTerminal('\n실행 오류가 있어 예제 출력 비교를 건너뜁니다.\n', 'info');
    }

    if (!result.stopped) appendTerminal('\n[프로그램이 종료되었습니다]\n', 'meta');
    setActiveSampleIndex(null);
    setIsRunning(false);
  }, [isProblemTransitioning, isRunning, problem, code, executeInTerminal, updateSyntaxCoaching, appendTerminal]);

  const handleAskSyntaxAi = useCallback(async () => {
    if (
      !problem?.use_ai_feedback
      || !syntaxCoach
      || !canAskAiForSyntaxHelp(syntaxAttemptRef.current)
      || aiFeedbackLoading
    ) return;

    setAiFeedbackLoading(true);
    setSyntaxAiError(null);
    try {
      const response = await fetch('/api/ai-feedbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_id: problem.id,
          code: syntaxCoach.code,
          error: syntaxCoach.error,
          category: syntaxCoach.lesson.category,
          local_explanation: syntaxCoach.lesson.whatHappened,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setSyntaxAiError(
          json?.error?.message
          ?? 'AI 설명을 불러오지 못했어요. 위의 오류 코치를 참고해 다시 시도해 보세요.',
        );
        return;
      }

      const feedback = json?.feedback as AiFeedbackItem | undefined;
      if (!feedback?.content) {
        setSyntaxAiError('AI 설명을 불러오지 못했어요. 잠시 후 다시 시도해 보세요.');
        return;
      }
      setSyntaxAiExplanation(feedback.content);
      setAiFeedbacks((previous) => (
        previous.some((item) => item.id === feedback.id)
          ? previous
          : [feedback, ...previous]
      ));
    } catch {
      setSyntaxAiError('AI 서버에 연결하지 못했어요. 위의 오류 코치는 계속 사용할 수 있어요.');
    } finally {
      setAiFeedbackLoading(false);
    }
  }, [aiFeedbackLoading, problem, syntaxCoach]);

  const handleSubmit = useCallback(async () => {
    if (isRunning || isProblemTransitioning || !problem) return;

    setIsRunning(true);
    setActiveSampleIndex(null);
    setModalResult(null);
    setTerminalOpen(true);
    setTerminalLines([{ text: '$ solution.py 제출\n', kind: 'meta' }, { text: '비공개 테스트를 포함한 서버 채점을 시작합니다...\n', kind: 'info' }]);

    if (sessionId) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: code }),
      }).catch(() => null);
    }

    const subRes = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ problem_id: problem.id, language: 'python', code, elapsed_sec: seconds }),
    }).catch(() => null);
    if (!subRes) {
      appendTerminal('\n채점 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.\n', 'err');
      setIsRunning(false);
      return;
    }
    const subJson = await subRes.json().catch(() => null);
    if (!subRes.ok || !subJson?.submission?.id) {
      appendTerminal(`\n${subJson?.error?.message ?? '채점을 시작하지 못했습니다.'}\n`, 'err');
      setIsRunning(false);
      return;
    }

    const submissionId = subJson.submission.id as string;
    const initialTotalCount = Number(subJson.submission.total_count) || 0;
    setModalResult({
      status: 'judging',
      score: 0,
      passedCount: 0,
      totalCount: initialTotalCount,
      runtimeMs: 0,
      elapsedSec: seconds,
      attemptNo: attemptCount + 1,
      cases: [],
    });
    let finalSubmission: {
      status: 'pass' | 'fail' | 'partial' | 'judge_error';
      score: number;
      passed_count: number;
      total_count: number;
      runtime_ms: number | null;
      cases?: SubmissionResult['cases'];
    } | null = null;

    const pollingStartedAt = Date.now();
    let reconciliationAttempted = false;
    for (let poll = 0; poll < 400; poll += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, poll === 0 ? 500 : 1500));
      const shouldReconcile = shouldReconcileSubmission({
        elapsedMs: Date.now() - pollingStartedAt,
        attempted: reconciliationAttempted,
      });
      if (shouldReconcile) reconciliationAttempted = true;
      const statusUrl = shouldReconcile
        ? `/api/submissions/${submissionId}`
        : `/api/submissions/${submissionId}?mode=status`;
      const statusRes = await fetch(statusUrl, { cache: 'no-store' }).catch(() => null);
      const statusJson = statusRes?.ok ? await statusRes.json().catch(() => null) : null;
      const next = statusJson?.submission;
      if (next && next.status !== 'judging') {
        if (shouldReconcile || next.status === 'judge_error') {
          finalSubmission = next;
        } else {
          const detailRes = await fetch(`/api/submissions/${submissionId}`, {
            cache: 'no-store',
          }).catch(() => null);
          const detailJson = detailRes?.ok
            ? await detailRes.json().catch(() => null)
            : null;
          finalSubmission = detailJson?.submission ?? next;
        }
        break;
      }
    }

    if (!finalSubmission) {
      appendTerminal('\n채점이 계속 진행 중입니다. 제출 기록에서 결과를 다시 확인해주세요.\n', 'info');
      setIsRunning(false);
      return;
    }

    const status = finalSubmission.status;
    const newAttempt = status === 'judge_error' ? attemptCount : attemptCount + 1;
    const runtimeMs = finalSubmission.runtime_ms ?? 0;
    const passedCount = finalSubmission.passed_count;
    const totalCount = finalSubmission.total_count;

    appendTerminal(
      status === 'pass'
        ? `\n채점 결과: 모든 테스트를 통과했습니다! (${runtimeMs}ms)\n`
        : status === 'judge_error'
          ? '\n채점 서비스 오류가 발생했습니다. 학생의 오답으로 기록되지 않았습니다.\n'
          : `\n채점 결과: ${passedCount}/${totalCount}개 테스트를 통과했습니다. (${runtimeMs}ms)\n`,
      status === 'pass' ? 'out' : 'err',
    );
    if (status !== 'judge_error') setAttemptCount(newAttempt);
    if (status !== 'judge_error') {
      setLearningContext((current) => current
        ? updateLearningProgress(
          current,
          problem.id,
          status === 'pass' ? 'passed' : 'attempted'
        )
        : current);
    }

    setModalResult({
      status,
      score: finalSubmission.score,
      passedCount,
      totalCount,
      runtimeMs,
      elapsedSec: seconds,
      attemptNo: newAttempt,
      cases: finalSubmission.cases ?? [],
    });
    setIsRunning(false);
  }, [isProblemTransitioning, isRunning, problem, code, appendTerminal, attemptCount, seconds, sessionId]);

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setLeftWidth(Math.max(28, Math.min(65, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }}>문제를 불러올 수 없습니다</p>
        <Link href="/problems" style={{ fontSize: '14px', color: 'var(--color-primary)' }}>목록으로 돌아가기</Link>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
        <span style={{ fontSize: '14px', color: 'var(--color-sub)' }}>문제 불러오는 중...</span>
      </div>
    );
  }

  const sampleCases = problem.test_cases
    .filter((tc) => tc.is_sample)
    .sort((a, b) => a.order_no - b.order_no);
  const listParams = new URLSearchParams();
  if (navigation?.stage_id) listParams.set('stage', navigation.stage_id);
  if (problem.chapter_id) listParams.set('chapter', problem.chapter_id);
  const problemListHref = listParams.size > 0
    ? `/problems?${listParams.toString()}`
    : '/problems';
  const returnHref = validatedReturnTo ?? lastCatalogReturn ?? problemListHref;
  const returnLabel = returnHref === '/me' || returnHref.startsWith('/me?')
    ? '풀이 기록'
    : '목록';
  const previousProblem = navigation?.previous ?? null;
  const nextProblem = navigation?.next ?? null;
  const workspaceActionsDisabled = isRunning || isProblemTransitioning;
  const failedNavigationLabel = navigationFailure?.direction === 'previous'
    ? '이전 문제'
    : navigationFailure?.direction === 'next'
      ? '다음 문제'
      : '문제';

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      aria-busy={isProblemTransitioning}
      data-problem-id={problem.id}
      data-problem-transitioning={isProblemTransitioning ? 'true' : 'false'}
      style={{ backgroundColor: 'var(--color-surface)' }}
    >
      <WholePagePointerOverlay
        ref={wholePagePointerRef}
        role="teacher"
        enabled={teacherOnline}
      />
      <header
        data-collaboration-surface="header"
        className="flex items-center px-4 gap-3 flex-shrink-0 bg-card"
        style={{ height: 48, borderBottom: '1px solid var(--color-border)', zIndex: 10 }}
      >
        <Link
          href={returnHref}
          aria-label={`${returnLabel}으로 돌아가기`}
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]"
          style={{ color: 'var(--color-sub)', fontSize: '13px' }}
        >
          <ChevronLeft size={16} /> {returnLabel}
        </Link>
        <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border)' }} />

        {learningContext && (
          <>
            <CurriculumNavigator
              mode="student"
              context={learningContext}
              displayedProblemId={problem.id}
              liveProblemId={problem.id}
              navigationDisabled={workspaceActionsDisabled}
              allSubjectsHref={returnHref}
              onOpenChange={setCurriculumOpen}
              onSelectProblem={handleCurriculumProblemSelect}
            />
            <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border)' }} />
          </>
        )}

        <div className="flex min-w-0 items-center gap-2">
          <span className="max-w-64 truncate" style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>{problem.problem_no}. {problem.title}</span>
          <span className="shrink-0 px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[problem.difficulty].bg, color: DIFF_STYLE[problem.difficulty].color }}>
            {DIFF_LABEL[problem.difficulty]}
          </span>
        </div>

        <div className="flex-1 flex justify-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <Clock size={14} style={{ color: 'var(--color-sub)' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)', fontFamily: 'monospace' }}>{timeStr}</span>
          </div>
          {attemptCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg" style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>제출 {attemptCount}회</span>
            </div>
          )}
          {teacherOnline && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--tint-accent)', border: '1px solid var(--tint-accent-line)' }}>
              <div
                className="flex items-center justify-center rounded-full text-white font-bold"
                style={{ width: 22, height: 22, fontSize: 11, backgroundColor: CURSOR_COLORS.teacher, flexShrink: 0 }}
              >
                {TEACHER_DISPLAY_NAME.charAt(0)}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: CURSOR_COLORS.teacher }}>
                {TEACHER_DISPLAY_NAME} 접속 중
              </span>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: CURSOR_COLORS.teacher }} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <nav
            aria-label="문제 이동"
            className="flex h-9 shrink-0 items-center overflow-hidden rounded-lg"
            style={{
              border: '1px solid var(--tint-accent-line)',
              backgroundColor: 'var(--color-primary-light)',
              color: 'var(--color-primary-hover)',
            }}
          >
            <button
              type="button"
              data-testid="previous-problem-button"
              aria-label="이전 문제"
              aria-busy={isProblemTransitioning && problemTransitionDirection === 'previous'}
              title={previousProblem ? `이전 문제: ${previousProblem.problem_no}. ${previousProblem.title}` : '이전 문제가 없습니다'}
              disabled={!previousProblem || workspaceActionsDisabled}
              onClick={() => handleNavigateProblem(previousProblem, 'previous')}
              className={`flex h-full items-center justify-center gap-1 px-2.5 transition-colors hover:bg-[var(--tint-fill)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed ${isProblemTransitioning && problemTransitionDirection === 'previous' ? 'bg-[var(--tint-fill)]' : ''}`}
              style={{
                fontSize: 12,
                fontWeight: 650,
                opacity: isProblemTransitioning && problemTransitionDirection === 'previous'
                  ? 1
                  : !previousProblem || workspaceActionsDisabled
                    ? 0.4
                    : 1,
              }}
            >
              {isProblemTransitioning && problemTransitionDirection === 'previous'
                ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
                : <ChevronLeft size={14} />}
              <span className="hidden xl:inline">이전</span>
            </button>
            <span aria-hidden="true" className="h-5 w-px shrink-0" style={{ backgroundColor: 'var(--tint-accent-line)' }} />
            <button
              type="button"
              data-testid="next-problem-button"
              aria-label="다음 문제"
              aria-busy={isProblemTransitioning && problemTransitionDirection === 'next'}
              title={nextProblem ? `다음 문제: ${nextProblem.problem_no}. ${nextProblem.title}` : '다음 문제가 없습니다'}
              disabled={!nextProblem || workspaceActionsDisabled}
              onClick={() => handleNavigateProblem(nextProblem, 'next')}
              className={`flex h-full items-center justify-center gap-1 px-2.5 transition-colors hover:bg-[var(--tint-fill)] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary)] disabled:cursor-not-allowed ${isProblemTransitioning && problemTransitionDirection === 'next' ? 'bg-[var(--tint-fill)]' : ''}`}
              style={{
                fontSize: 12,
                fontWeight: 650,
                opacity: isProblemTransitioning && problemTransitionDirection === 'next'
                  ? 1
                  : !nextProblem || workspaceActionsDisabled
                    ? 0.4
                    : 1,
              }}
            >
              <span className="hidden xl:inline">다음</span>
              {isProblemTransitioning && problemTransitionDirection === 'next'
                ? <LoaderCircle size={14} className="animate-spin motion-reduce:animate-none" />
                : <ChevronRight size={14} />}
            </button>
          </nav>
          {feedbacks.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setFeedbackPanelOpen(o => !o)}
                className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
                style={{ height: 32, border: `1px solid ${CURSOR_COLORS.teacher}`, backgroundColor: feedbackPanelOpen ? 'var(--tint-accent)' : 'var(--color-card)', fontSize: '13px', fontWeight: 600, color: CURSOR_COLORS.teacher }}
              >
                <MessageSquare size={14} /> 피드백
                <span className="flex items-center justify-center rounded-full text-white" style={{ width: 18, height: 18, fontSize: 10, backgroundColor: CURSOR_COLORS.teacher }}>{feedbacks.length}</span>
              </button>
              {feedbackPanelOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card rounded-2xl shadow-lg overflow-hidden" style={{ width: 340, maxHeight: 400, overflowY: 'auto', zIndex: 50, border: `1px solid var(--color-border)` }}>
                  <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, backgroundColor: 'var(--color-card)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-ink)' }}>선생님 피드백</span>
                    <button onClick={() => setFeedbackPanelOpen(false)} className="flex items-center justify-center rounded" style={{ width: 24, height: 24, color: '#BCC0C7' }}><X size={14} /></button>
                  </div>
                  {feedbacks.map((fb, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: i < feedbacks.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{ width: 22, height: 22, fontSize: 11, backgroundColor: CURSOR_COLORS.teacher }}>
                          {fb.teacherName.charAt(0)}
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: CURSOR_COLORS.teacher }}>{fb.teacherName} 선생님</span>
                        <span style={{ fontSize: '11px', color: '#BCC0C7', marginLeft: 'auto' }}>
                          {new Date(fb.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p style={{ fontSize: '13px', color: 'var(--color-ink)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>{fb.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {problem.use_ai_feedback && (
            <div className="relative">
              <button
                onClick={() => setAiFeedbackPanelOpen((o) => !o)}
                className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
                style={{ height: 32, border: '1px solid #4F46E5', backgroundColor: aiFeedbackPanelOpen ? 'var(--tint-accent)' : 'var(--color-card)', fontSize: '13px', fontWeight: 600, color: '#4F46E5' }}
              >
                <Sparkles size={14} /> AI 피드백
                {aiFeedbacks.length > 0 && (
                  <span className="flex items-center justify-center rounded-full text-white" style={{ width: 18, height: 18, fontSize: 10, backgroundColor: '#4F46E5' }}>{aiFeedbacks.length}</span>
                )}
                {aiFeedbackLoading && <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#4F46E5' }} />}
              </button>
              {aiFeedbackPanelOpen && (
                <AiFeedbackPanel feedbacks={aiFeedbacks} loading={aiFeedbackLoading} onClose={() => setAiFeedbackPanelOpen(false)} />
              )}
            </div>
          )}
          <button onClick={() => setCode(starterCode)} disabled={isProblemTransitioning} title="코드 초기화" className="flex items-center gap-1 px-2 py-1 rounded-lg transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50" style={{ fontSize: '12px', color: 'var(--color-sub)', border: '1px solid var(--color-border)', height: 32 }}>
            <RotateCcw size={12} /> 초기화
          </button>
          <button onClick={handleRun} disabled={workspaceActionsDisabled} className="flex items-center gap-1.5 px-3 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50" style={{ height: 36, border: '1px solid var(--color-border)', backgroundColor: 'var(--color-card)', fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>
            <Play size={14} /> 실행
          </button>
          <button onClick={handleSubmit} disabled={workspaceActionsDisabled} className="flex items-center gap-1.5 px-4 rounded-lg text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50" style={{ height: 36, backgroundColor: 'var(--color-primary)', fontSize: '13px', fontWeight: 600 }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'; }}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
          >
            <Send size={14} /> 제출
          </button>
        </div>
        <ThemeToggle />
      </header>

      {navigationFailure && (
        <div
          role="alert"
          className="fixed left-1/2 top-14 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl px-4 py-3 shadow-lg"
          style={{
            border: '1px solid var(--tint-danger-line)',
            backgroundColor: 'var(--color-card)',
            color: 'var(--color-ink)',
            fontSize: 13,
          }}
        >
          <span>{failedNavigationLabel}를 불러오지 못했습니다. 다시 시도해주세요.</span>
          {navigationFailure.destination && navigationFailure.direction && (
            <button
              type="button"
              onClick={() => handleNavigateProblem(
                navigationFailure.destination,
                navigationFailure.direction as ProblemTransitionDirection,
              )}
              className="shrink-0 rounded-lg px-2.5 py-1.5"
              style={{
                backgroundColor: 'var(--color-primary-light)',
                color: 'var(--color-primary-hover)',
                fontWeight: 700,
              }}
            >
              다시 시도
            </button>
          )}
          <button
            type="button"
            onClick={() => setNavigationFailure(null)}
            aria-label="오류 메시지 닫기"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-surface)]"
            style={{ color: 'var(--color-sub)' }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="flex min-w-0 flex-1 overflow-hidden transition-[margin] duration-200 ease-out xl:ml-[var(--curriculum-offset)]"
          style={{
            '--curriculum-offset': curriculumOpen && learningContext
              ? `${CURRICULUM_PANEL_DESKTOP_WIDTH}px`
              : '0px',
          } as CSSProperties}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
        <div
          data-collaboration-surface="statement"
          className="flex flex-col bg-card overflow-auto flex-shrink-0"
          style={{ width: `${leftWidth}%`, borderRight: '1px solid var(--color-border)' }}
        >
          <PublicProblemStatement problem={problem} samples={sampleCases} />
        </div>

        <div className="flex-shrink-0 cursor-col-resize" style={{ width: 5, backgroundColor: 'var(--color-border)' }} onMouseDown={handleMouseDown} />

        <div
          ref={editorPaneRef}
          data-collaboration-surface="editor"
          className="flex flex-col flex-1 overflow-hidden relative"
        >
          <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 bg-card" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-sub)', fontFamily: 'monospace' }}>Python 3</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                  className="flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                  style={{ width: 28, height: 28, fontSize: '16px', color: 'var(--color-sub)', fontWeight: 600 }}
                  title="글자 크기 줄이기"
                >−</button>
                <span style={{ fontSize: '12px', color: 'var(--color-sub)', minWidth: 28, textAlign: 'center', lineHeight: '28px', borderLeft: '1px solid var(--color-border)', borderRight: '1px solid var(--color-border)' }}>
                  {editorFontSize}
                </span>
                <button
                  onClick={() => setEditorFontSize(s => Math.min(24, s + 1))}
                  className="flex items-center justify-center transition-colors hover:bg-[var(--color-surface)]"
                  style={{ width: 28, height: 28, fontSize: '16px', color: 'var(--color-sub)', fontWeight: 600 }}
                  title="글자 크기 키우기"
                >+</button>
              </div>
              <button onClick={() => setShowHint(true)} disabled={isProblemTransitioning} className="flex items-center gap-1.5 px-3 rounded-lg transition-colors hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50" style={{ height: 32, fontSize: '13px', color: 'var(--color-sub)' }}>
                <Lightbulb size={14} /> 힌트 보기
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
            <MonacoEditor
              height="100%"
              language="python"
              theme="cove-dark"
              beforeMount={registerCoveTheme}
              onMount={handleEditorMount}
              value={code}
              onChange={(v) => handleCodeChange(v ?? '')}
              options={{ fontSize: editorFontSize, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', glyphMargin: true, padding: { top: 12, bottom: 12 }, automaticLayout: true, tabSize: 4, editContext: false, readOnly: isProblemTransitioning }}
            />
          </div>

          <div
            data-collaboration-surface="terminal"
            className="flex-shrink-0 relative"
            style={{ backgroundColor: '#1E1E1E', borderTop: '1px solid #2D2D2D', height: terminalOpen ? terminalHeight : 38 }}
          >
            {terminalOpen && (
              <div
                onMouseDown={startTerminalDrag}
                className="absolute left-0 right-0"
                style={{ top: 0, height: 7, transform: 'translateY(-3px)', cursor: 'row-resize', zIndex: 5 }}
                title="드래그하여 터미널 높이 조절"
              />
            )}
            <div className="flex items-center justify-between pr-3" style={{ height: 38, borderBottom: terminalOpen ? '1px solid #2D2D2D' : 'none' }}>
              <div className="flex min-w-0 flex-1 items-stretch h-full">
                <button
                  type="button"
                  onClick={() => {
                    setTerminalOpen(true);
                    setTerminalTab('terminal');
                  }}
                  className="flex items-center gap-1.5 px-4"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: terminalTab === 'terminal' ? '#D4D4D4' : '#8C8C8C',
                    backgroundColor: terminalTab === 'terminal' && terminalOpen ? '#1E1E1E' : 'transparent',
                    borderBottom: terminalTab === 'terminal' && terminalOpen ? '2px solid var(--color-primary)' : '2px solid transparent',
                  }}
                >
                  터미널
                  {terminalOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                </button>
                {lastPythonError && !isRunning && (
                  <button
                    type="button"
                    onClick={() => {
                      setTerminalOpen(true);
                      setTerminalTab('error');
                      setErrorExplainSeen(true);
                    }}
                    className={`flex items-center gap-1.5 px-4 motion-reduce:animate-none ${errorExplainSeen ? '' : 'animate-bounce'}`}
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: terminalTab === 'error' ? '#BFDBFE' : '#93C5FD',
                      backgroundColor: terminalTab === 'error' && terminalOpen ? '#1E1E1E' : 'transparent',
                      borderBottom: terminalTab === 'error' && terminalOpen ? '2px solid #3B82F6' : '2px solid transparent',
                      boxShadow: errorExplainSeen ? 'none' : '0 0 12px rgba(59, 130, 246, 0.55)',
                    }}
                  >
                    <CircleHelp size={13} />
                    오류해석
                  </button>
                )}
                <SampleRunControls
                  sampleCount={Math.min(sampleCases.length, 5)}
                  activeSampleIndex={activeSampleIndex}
                  disabled={workspaceActionsDisabled}
                  onRun={(sampleIndex) => {
                    const sampleCase = sampleCases[sampleIndex];
                    if (sampleCase) void handleRunSample(sampleCase, sampleIndex);
                  }}
                />
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {terminalOpen && isRunning && (
                  <button onClick={handleStop} className="flex items-center gap-1 px-2 rounded transition-colors" style={{ height: 24, backgroundColor: '#3A2020', color: '#F87171', fontSize: '11px', fontWeight: 600 }} title="실행 정지">
                    <Square size={10} /> 정지
                  </button>
                )}
                {terminalOpen && (
                  <button
                    type="button"
                    onClick={() => setTerminalOpen(false)}
                    className="flex items-center justify-center rounded"
                    style={{ width: 22, height: 22, color: '#8C8C8C' }}
                    title="닫기"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
            {terminalOpen && (
              terminalTab === 'error' && lastPythonError ? (
                <div
                  className="overflow-auto px-4 py-3"
                  style={{ height: terminalHeight - 38, backgroundColor: '#1E1E1E' }}
                >
                  {syntaxCoach ? (
                    <SyntaxErrorCoach
                      lesson={syntaxCoach.lesson}
                      error={syntaxCoach.error}
                      code={syntaxCoach.code}
                      attemptCount={syntaxCoach.attemptCount}
                      aiEnabled={problem.use_ai_feedback}
                      aiLoading={aiFeedbackLoading}
                      aiExplanation={syntaxAiExplanation}
                      aiError={syntaxAiError}
                      onAskAi={() => void handleAskSyntaxAi()}
                      onFocusLine={focusEditorLine}
                    />
                  ) : (
                    <section
                      aria-label="파이썬 오류 설명"
                      style={{ color: '#D4D4D4', fontFamily: 'Pretendard, sans-serif', fontSize: 13, lineHeight: 1.75 }}
                    >
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {lastPythonError.line && (
                          <button
                            type="button"
                            onClick={() => focusEditorLine(lastPythonError.line as number, 1)}
                            title="에디터에서 이 줄로 이동"
                            className="shrink-0 transition-colors hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
                            style={{ padding: '2px 8px', borderRadius: 4, backgroundColor: 'rgba(232, 168, 61, 0.13)', border: '1px solid rgba(232, 168, 61, 0.4)', color: '#E8A33D', fontFamily: "'Fira Code', Consolas, monospace", fontSize: 12, fontWeight: 600 }}
                          >
                            {lastPythonError.line}줄
                          </button>
                        )}
                        <h3 style={{ margin: 0, color: '#F1F3F6', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
                          {lastPythonError.type}
                        </h3>
                      </div>
                      <p
                        className="mt-3.5"
                        style={{ margin: 0, borderTop: '1px solid #2A303B', paddingTop: 14 }}
                      >
                        {explainPythonError(lastPythonError)}
                      </p>
                    </section>
                  )}
                </div>
              ) : (
                <ConsoleTerminal
                  lines={terminalLines}
                  awaitingInput={awaitingInput}
                  onSubmitInput={handleTerminalInput}
                  supported={interactiveSupported}
                  height={terminalHeight - 38}
                />
              )
            )}
          </div>
        </div>
      </div>
      </div>

      {modalResult && (
        <SubmissionResultDrawer
          result={modalResult}
          onClose={() => setModalResult(null)}
          onRetry={() => setModalResult(null)}
          onHint={() => { setModalResult(null); setShowHint(true); }}
          aiFeedbackEnabled={false}
          aiFeedbackLoading={false}
          aiFeedbackContent={null}
          nextProblem={nextProblem}
          stageId={navigation?.stage_id ?? null}
          onNextProblem={() => handleNavigateProblem(nextProblem, 'next')}
        />
      )}
      {showHint && (
        <HintPanel
          hints={problem.hints.map((h) => h.hint_text)}
          onClose={() => setShowHint(false)}
        />
      )}
    </div>
  );
}
