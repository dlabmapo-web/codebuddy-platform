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
import { useRouter } from 'next/navigation';
import { ChevronLeft, Send, BookOpen, ChevronDown, ChevronUp, Check, Terminal, Play, Square, X, Sparkles, ArrowRight } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { registerCoveTheme } from '@/lib/monaco/theme';
import { injectCursorStyles, CURSOR_COLORS } from '@/lib/monaco/cursor';
import { applyMinimalEdit } from '@/lib/monaco/applyEdit';
import { ConsoleTerminal, type TerminalLine } from '@/components/collab/ConsoleTerminal';
import { AiFeedbackPanel, type AiFeedbackItem } from '@/components/collab/AiFeedbackPanel';
import {
  WholePagePointerOverlay,
  type WholePagePointerOverlayHandle,
} from '@/components/collab/WholePagePointerOverlay';
import { InteractiveRunner, isInteractiveSupported } from '@/lib/pyodide/interactiveRunner';
import { createSampleInputQueue } from '@/lib/pyodide/sampleRun';
import { loadPyodide as loadPyodideFallback } from '@/lib/pyodide/loader';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { OnMount } from '@monaco-editor/react';
import type { DbProblem, DbTestCase, ProblemDifficulty } from '@/lib/types/db';
import ThemeToggle from '@/components/ThemeToggle';
import { PublicProblemStatement } from '@/components/problems/PublicProblemStatement';
import {
  encodeReturnTo,
  validateReturnTo,
} from '@/lib/navigation/returnTo';
import {
  CURRICULUM_PANEL_DESKTOP_WIDTH,
  CurriculumNavigator,
} from '@/components/curriculum/CurriculumNavigator';
import type {
  LearningContext,
  LearningContextPath,
  LearningContextProblem,
} from '@/lib/curriculum/learningContext';
import {
  isStudentPointerLeave,
  parseStudentPointerMove,
} from '@/lib/collab/pointerSurfaces';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#1E1E1E' }}>
      <span style={{ fontSize: '13px', color: 'var(--color-sub)' }}>에디터 로딩 중...</span>
    </div>
  ),
});

type PresenceUser = { userId: string; name: string; role: string };

type SessionDetail = {
  id: string;
  student_id: string;
  problem_id: string | null;
  status: 'active' | 'ended';
  final_code: string | null;
  started_at: string;
  problems: {
    problem_no: number;
    title: string;
    difficulty: ProblemDifficulty;
    description: string;
    input_format: string | null;
    output_format: string | null;
    constraint_text: string | null;
    starter_code: string | null;
    time_limit_ms: number;
    use_ai_feedback: boolean;
  } | null;
  users: { id: string; name: string; username: string } | null;
  learning_context: LearningContext | null;
};

type ActiveStudentContext =
  | { active: false }
  | {
    active: true;
    session_id: string;
    problem_id: string;
    path: LearningContextPath | null;
  };

type TeacherProblemSnapshot = {
  problem: DbProblem;
  test_cases: Pick<
    DbTestCase,
    'id' | 'input' | 'expected_output' | 'is_sample' | 'order_no'
  >[];
};

async function loadProblemSnapshot(
  problemId: string,
  signal?: AbortSignal
): Promise<TeacherProblemSnapshot> {
  const response = await fetch(`/api/problems/${problemId}`, {
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('문제를 불러오지 못했습니다.');
  const json = await response.json();
  if (!json.problem) throw new Error('문제를 찾을 수 없습니다.');
  return {
    problem: json.problem,
    test_cases: json.test_cases ?? [],
  };
}

function findProblemPath(
  context: LearningContext | null,
  problemId: string
): LearningContextPath | null {
  if (!context) return null;
  for (const stage of context.subject.stages) {
    for (const chapter of stage.chapters) {
      const problem = chapter.problems.find((item) => item.id === problemId);
      if (problem) {
        return {
          subject: {
            id: context.subject.id,
            title: context.subject.title,
          },
          stage: { id: stage.id, title: stage.title },
          chapter: { id: chapter.id, title: chapter.title },
          problem: {
            id: problem.id,
            problemNo: problem.problemNo,
            title: problem.title,
          },
        };
      }
    }
  }
  return null;
}

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: 'var(--color-primary-light)', color: 'var(--color-primary-hover)' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

export default function FeedbackClient({
  sessionId,
  teacherId,
  teacherName,
  returnTo,
}: {
  sessionId: string;
  teacherId: string;
  teacherName: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const returnHref = validateReturnTo(returnTo, 'teacher') ?? '/students';
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(sessionId);
  const [liveProblemId, setLiveProblemId] = useState<string | null>(null);
  const [liveProblemSnapshot, setLiveProblemSnapshot] = useState<TeacherProblemSnapshot | null>(null);
  const [previewSnapshot, setPreviewSnapshot] = useState<TeacherProblemSnapshot | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [movementPath, setMovementPath] = useState<LearningContextPath | null>(null);
  const [studentHasActiveSession, setStudentHasActiveSession] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState('');
  const [studentOnline, setStudentOnline] = useState(false);
  const [studentName, setStudentName] = useState<string | null>(null);
  const studentNameRef = useRef<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(42);
  const [curriculumOpen, setCurriculumOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'teacher' | 'student'>('student');
  const [teacherLines, setTeacherLines] = useState<TerminalLine[]>([]);
  const [studentLines, setStudentLines] = useState<TerminalLine[]>([]);
  const [teacherAwaiting, setTeacherAwaiting] = useState(false);
  const [studentWaiting, setStudentWaiting] = useState(false);
  const [teacherRunning, setTeacherRunning] = useState(false);
  const [interactiveSupported, setInteractiveSupported] = useState(true);
  const [aiFeedbacks, setAiFeedbacks] = useState<AiFeedbackItem[]>([]);
  const [aiFeedbackPanelOpen, setAiFeedbackPanelOpen] = useState(false);
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  const runnerRef = useRef<InteractiveRunner | null>(null);
  const runOffRef = useRef<(() => void) | null>(null);
  const runFinishRef = useRef<(() => void) | null>(null);
  const teacherInputQueueRef = useRef<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef('');
  const liveCodeRef = useRef('');
  const previewProblemIdRef = useRef<string | null>(null);
  const previewRequestRef = useRef<AbortController | null>(null);
  const awaitingSyncRef = useRef(false);
  const lastCursorSentRef = useRef(0);
  const lastCodeSentRef = useRef(0);
  const pendingCodeRef = useRef<string | null>(null);
  const lastPointerSentRef = useRef(0);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const wholePagePointerRef = useRef<WholePagePointerOverlayHandle>(null);
  const isApplyingRemoteRef = useRef(false);
  const hasPeerRef = useRef(false);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);
  const remoteCursorDecorationsRef = useRef<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remoteCursorWidgetRef = useRef<any>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then(r => r.json())
      .then(json => {
        if (!json.session) { setLoadError(true); return; }
        previewRequestRef.current?.abort();
        previewRequestRef.current = null;
        previewProblemIdRef.current = null;
        setPreviewSnapshot(null);
        setPreviewLoading(false);
        setPreviewError(null);
        setSession(json.session);
        setLiveSessionId(json.session.status === 'active' ? json.session.id : null);
        setLiveProblemId(json.session.status === 'active' ? json.session.problem_id : null);
        setMovementPath(json.session.learning_context?.path ?? null);
        setStudentHasActiveSession(json.session.status === 'active');
        const initial = json.session.final_code ?? json.session.problems?.starter_code ?? '';
        setCode(initial);
        codeRef.current = initial;
        liveCodeRef.current = initial;
        const loadedStudentName = json.session.users?.name ?? null;
        setStudentName(loadedStudentName);
        studentNameRef.current = loadedStudentName;

        fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        });
      })
      .catch(() => setLoadError(true));
  }, [sessionId, teacherId]);

  useEffect(() => {
    if (!session?.problem_id) return;
    const controller = new AbortController();
    void loadProblemSnapshot(session.problem_id, controller.signal)
      .then(setLiveProblemSnapshot)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [session?.problem_id]);

  useEffect(() => () => {
    previewRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!session?.student_id) return;
    const controller = new AbortController();

    const loadActiveContext = async () => {
      if (document.hidden || controller.signal.aborted) return;
      try {
        const response = await fetch(
          `/api/students/${session.student_id}/active-context`,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) return;
        const json = await response.json();
        const activeContext = json.active_context as ActiveStudentContext | undefined;
        if (!activeContext || controller.signal.aborted) return;

        if (!activeContext.active) {
          setStudentHasActiveSession(false);
          setLiveSessionId(null);
          setLiveProblemId(null);
          setMovementPath(null);
          return;
        }

        setStudentHasActiveSession(true);
        setLiveSessionId(activeContext.session_id);
        setLiveProblemId(activeContext.problem_id);
        setMovementPath(
          activeContext.path
          ?? (activeContext.problem_id === session.problem_id
            ? session.learning_context?.path ?? null
            : null)
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    };

    void loadActiveContext();
    const interval = window.setInterval(loadActiveContext, 4000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [session]);

  const followLiveSession = useCallback(() => {
    if (!liveSessionId || liveSessionId === sessionId) return;
    const returnQuery = `?returnTo=${encodeReturnTo(returnHref)}`;
    router.push(`/feedback/${liveSessionId}${returnQuery}`);
  }, [liveSessionId, returnHref, router, sessionId]);

  const returnToLiveProblem = useCallback(() => {
    previewRequestRef.current?.abort();
    previewRequestRef.current = null;
    previewProblemIdRef.current = null;
    setPreviewSnapshot(null);
    setPreviewLoading(false);
    setPreviewError(null);
    wholePagePointerRef.current?.clear();

    if (liveSessionId && liveSessionId !== sessionId) {
      followLiveSession();
      return;
    }

    setCode(liveCodeRef.current);
    codeRef.current = liveCodeRef.current;
  }, [followLiveSession, liveSessionId, sessionId]);

  const handleCurriculumProblemSelect = useCallback((
    problem: LearningContextProblem
  ) => {
    if (problem.id === liveProblemId) {
      returnToLiveProblem();
      return;
    }

    previewRequestRef.current?.abort();
    const controller = new AbortController();
    previewRequestRef.current = controller;
    previewProblemIdRef.current = problem.id;
    setPreviewSnapshot(null);
    setPreviewLoading(true);
    setPreviewError(null);
    wholePagePointerRef.current?.clear();

    void loadProblemSnapshot(problem.id, controller.signal)
      .then((snapshot) => {
        if (previewProblemIdRef.current !== problem.id) return;
        setPreviewSnapshot(snapshot);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (previewProblemIdRef.current !== problem.id) return;
        previewProblemIdRef.current = null;
        setPreviewLoading(false);
        setPreviewError(error instanceof Error
          ? error.message
          : '문제를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (previewProblemIdRef.current === problem.id) {
          setPreviewLoading(false);
        }
      });
  }, [liveProblemId, returnToLiveProblem]);

  // 학생이 이 문제에서 받은 AI 피드백 이력을 선생님 화면에도 동일하게 표시
  useEffect(() => {
    if (!session?.problems?.use_ai_feedback || !session.problem_id) return;
    const loadAiFeedbacks = () => {
      if (document.hidden) return;
      setAiFeedbackLoading(true);
      fetch(`/api/ai-feedbacks?session_id=${sessionId}`)
        .then((r) => r.json())
        .then((json) => setAiFeedbacks(json.feedbacks ?? []))
        .catch(() => {})
        .finally(() => setAiFeedbackLoading(false));
    };

    loadAiFeedbacks();
    const interval = setInterval(loadAiFeedbacks, 5000);
    return () => clearInterval(interval);
  }, [session?.problems?.use_ai_feedback, session?.problem_id, sessionId]);

  // 선생님이 입력하거나 학생 코드를 받았을 때도 세션에 지속 저장 (양쪽 모두 최신 유지)
  const scheduleAutoSave = useCallback((nextCode: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_code: nextCode }),
      });
    }, 1000);
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;

    const supabase = supabaseBrowser();
    const channel = supabase.channel(`session:${sessionId}`, { config: { broadcast: { self: false } } });
    const pointerOverlay = wholePagePointerRef.current;

    const updateRemoteCursor = (name: string, role: string, position: { lineNumber: number; column: number }) => {
      if (previewProblemIdRef.current) return;
      const editor = editorRef.current;
      const monacoInstance = monacoRef.current;
      if (!editor || !monacoInstance) return;
      const color = CURSOR_COLORS[role] ?? CURSOR_COLORS.student;

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
    };

    channel
      .on('broadcast', { event: 'code:update' }, ({ payload }: { payload: { senderId: string; code: string } }) => {
        if (payload.senderId === teacherId) return;
        liveCodeRef.current = payload.code;
        codeRef.current = payload.code;
        if (previewProblemIdRef.current) {
          setCode(payload.code);
          scheduleAutoSave(payload.code);
          return;
        }
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
        if (payload.senderId === teacherId) return;
        const displayName = studentNameRef.current ?? payload.name;
        updateRemoteCursor(displayName, payload.role, payload.position);
      })
      .on('broadcast', { event: 'student:pointer:move' }, ({ payload }: { payload: unknown }) => {
        if (previewProblemIdRef.current || !session.problem_id) return;
        const pointer = parseStudentPointerMove(payload, {
          studentId: session.student_id,
          sessionId,
          problemId: session.problem_id,
        });
        if (!pointer) return;
        wholePagePointerRef.current?.show({
          ...pointer,
          name: studentNameRef.current ?? pointer.name,
        });
      })
      .on('broadcast', { event: 'student:pointer:leave' }, ({ payload }: { payload: unknown }) => {
        if (!session.problem_id) return;
        if (isStudentPointerLeave(payload, {
          studentId: session.student_id,
          sessionId,
          problemId: session.problem_id,
        })) {
          wholePagePointerRef.current?.clear();
        }
      })
      // 다른 참가자가 최신 코드를 요청하면 내 현재 코드로 응답
      .on('broadcast', { event: 'sync:request' }, ({ payload }: { payload: { senderId: string } }) => {
        if (payload.senderId === teacherId) return;
        channel.send({
          type: 'broadcast',
          event: 'sync:state',
          payload: { senderId: teacherId, targetId: payload.senderId, code: codeRef.current },
        });
      })
      // 내가 요청한 최신 코드 응답 수신 (재접속 직후 1회)
      .on('broadcast', { event: 'sync:state' }, ({ payload }: { payload: { senderId: string; targetId: string; code: string } }) => {
        if (payload.targetId !== teacherId || !awaitingSyncRef.current) return;
        awaitingSyncRef.current = false;
        if (typeof payload.code === 'string') {
          setCode(payload.code);
          codeRef.current = payload.code;
          liveCodeRef.current = payload.code;
        }
      })
      // 학생 실행 결과 미러링 (단방향: 학생 → 선생님) → 학생 탭에 표시
      .on('broadcast', { event: 'run:start' }, ({ payload }: { payload: { senderId: string } }) => {
        if (payload.senderId === teacherId) return;
        setTerminalOpen(true);
        setActiveTab('student');
        setStudentWaiting(false);
        setStudentLines([{ text: `▶ ${studentNameRef.current ?? '학생'} 실행\n`, kind: 'meta' }]);
      })
      .on('broadcast', { event: 'run:stdout' }, ({ payload }: { payload: { senderId: string; chunks: Array<{ text: string; kind: TerminalLine['kind'] }> } }) => {
        if (payload.senderId === teacherId) return;
        setStudentLines(prev => [...prev, ...payload.chunks]);
      })
      .on('broadcast', { event: 'run:stdin' }, ({ payload }: { payload: { senderId: string; text: string } }) => {
        if (payload.senderId === teacherId) return;
        setStudentWaiting(false);
        setStudentLines(prev => [...prev, { text: payload.text + '\n', kind: 'in' }]);
      })
      .on('broadcast', { event: 'run:waiting' }, ({ payload }: { payload: { senderId: string } }) => {
        if (payload.senderId === teacherId) return;
        setStudentWaiting(true);
      })
      .on('broadcast', { event: 'run:end' }, ({ payload }: { payload: { senderId: string } }) => {
        if (payload.senderId === teacherId) return;
        setStudentWaiting(false);
        setStudentLines(prev => [...prev, { text: '\n■ 실행 종료\n', kind: 'meta' }]);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresenceUser>();
        const all = Object.values(state).flat();
        const student = all.find(p => p.role === 'student');
        hasPeerRef.current = !!student;
        setStudentOnline(!!student);
        if (student && student.name) {
          setStudentName(student.name);
          studentNameRef.current = student.name;
        }
        if (!student) studentNameRef.current = null;
        if (!student) {
          wholePagePointerRef.current?.clear();
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
          await channel.track({ userId: teacherId, name: teacherName, role: 'teacher' });
          awaitingSyncRef.current = true;
          channel.send({ type: 'broadcast', event: 'sync:request', payload: { senderId: teacherId } });
          setTimeout(() => { awaitingSyncRef.current = false; }, 3000);
        }
      });

    channelRef.current = channel;
    return () => {
      pointerOverlay?.clear();
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [session, sessionId, teacherId, teacherName, scheduleAutoSave]);

  const handleEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    injectCursorStyles();

    editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
      if (previewProblemIdRef.current) return;
      if (isApplyingRemoteRef.current) return;
      if (!channelRef.current || !hasPeerRef.current) return;
      const now = Date.now();
      if (now - lastCursorSentRef.current < 250) return;
      lastCursorSentRef.current = now;
      channelRef.current.send({
        type: 'broadcast',
        event: 'cursor:move',
        payload: { senderId: teacherId, name: teacherName, role: 'teacher', position: e.position },
      });
    });
  }, [teacherId, teacherName]);

  const handlePaneMouseMove = useCallback((e: React.MouseEvent) => {
    if (previewProblemIdRef.current) return;
    if (!channelRef.current || !editorPaneRef.current || !hasPeerRef.current) return;
    const now = Date.now();
    if (now - lastPointerSentRef.current < 80) return;
    lastPointerSentRef.current = now;
    const rect = editorPaneRef.current.getBoundingClientRect();
    channelRef.current.send({
      type: 'broadcast',
      event: 'pointer:move',
      payload: {
        senderId: teacherId,
        name: teacherName,
        role: 'teacher',
        xPct: (e.clientX - rect.left) / rect.width,
        yPct: (e.clientY - rect.top) / rect.height,
      },
    });
  }, [teacherId, teacherName]);

  const handlePaneMouseLeave = useCallback(() => {
    if (previewProblemIdRef.current) return;
    if (!channelRef.current || !hasPeerRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'pointer:leave',
      payload: { senderId: teacherId, role: 'teacher' },
    });
  }, [teacherId]);

  const handleCodeChange = useCallback((newCode: string) => {
    if (previewProblemIdRef.current) return;
    setCode(newCode);
    codeRef.current = newCode;
    liveCodeRef.current = newCode;
    scheduleAutoSave(newCode);
    if (isApplyingRemoteRef.current) return;
    if (!channelRef.current || !hasPeerRef.current) return;
    pendingCodeRef.current = newCode;
    const flush = () => {
      if (pendingCodeRef.current === null) return;
      lastCodeSentRef.current = Date.now();
      channelRef.current?.send({
        type: 'broadcast',
        event: 'code:update',
        payload: { senderId: teacherId, code: pendingCodeRef.current },
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
  }, [teacherId, scheduleAutoSave]);

  const handleSaveFeedback = async () => {
    if (previewProblemIdRef.current) return;
    if (!feedback.trim() || !session) return;
    const content = feedback.trim();
    await fetch('/api/feedbacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        student_id: session.student_id,
        problem_id: session.problem_id,
        content,
      }),
    });
    setFeedbackSent(true);
    setFeedback('');
    setTimeout(() => setFeedbackSent(false), 3000);
  };

  const handleMouseDown = () => { isDragging.current = true; };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setLeftWidth(Math.max(28, Math.min(60, ((e.clientX - rect.left) / rect.width) * 100)));
  };
  const handleMouseUp = () => { isDragging.current = false; };

  useEffect(() => {
    setInteractiveSupported(isInteractiveSupported());
    return () => { runnerRef.current?.dispose(); runnerRef.current = null; };
  }, []);

  const appendTeacher = useCallback((text: string, kind: TerminalLine['kind']) => {
    setTeacherLines(prev => [...prev, { text, kind }]);
  }, []);

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

  // 선생님 직접 실행: 채점/전송 없이 순수하게 결과만 확인
  const handleTeacherRun = useCallback(async () => {
    if (previewProblemIdRef.current) return;
    if (teacherRunning) return;
    teacherInputQueueRef.current = [];
    setTerminalOpen(true);
    setActiveTab('teacher');
    setTeacherLines([{ text: '$ python solution.py   (선생님 실행)\n', kind: 'meta' }]);
    setTeacherRunning(true);

    if (!runnerRef.current?.isReady) {
      appendTeacher('실행 환경(Python)을 불러오는 중입니다... 최초 실행은 몇 초 걸릴 수 있어요.\n', 'info');
    }

    const runner = ensureRunner();
    if (!runner) {
      try {
        const pyodide = await loadPyodideFallback();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const py = pyodide as any;
        py.globals.set('_user_code', codeRef.current);
        const [stdout, pythonError] = await py.runPythonAsync(`
import sys, io, traceback, linecache
_saved = sys.stdout
_saved_in = sys.stdin
_cap = io.StringIO()
sys.stdout = _cap
sys.stdin = io.StringIO('')
_err = ''
try:
    linecache.cache['solution.py'] = (
        len(_user_code),
        None,
        _user_code.splitlines(True),
        'solution.py',
    )
    exec(compile(_user_code, 'solution.py', 'exec'), {'__name__': '__main__'})
except BaseException as exc:
    if isinstance(exc, SyntaxError):
        _err = ''.join(traceback.format_exception_only(type(exc), exc))
    else:
        frames = [frame for frame in traceback.extract_tb(exc.__traceback__) if frame.filename == 'solution.py']
        _err = (
            'Traceback (most recent call last):\\n'
            + ''.join(traceback.format_list(frames))
            + ''.join(traceback.format_exception_only(type(exc), exc))
        )
finally:
    sys.stdout = _saved
    sys.stdin = _saved_in
(_cap.getvalue(), _err)
`) as [string, string];
        if (stdout) appendTeacher(stdout, 'out');
        if (pythonError) appendTeacher(pythonError, 'err');
        if (!stdout && !pythonError) appendTeacher('(출력 없음)\n', 'info');
      } catch (e) {
        appendTeacher((e instanceof Error ? e.message : '실행 오류') + '\n', 'err');
      }
      appendTeacher('\n[프로그램이 종료되었습니다]\n', 'meta');
      setTeacherRunning(false);
      return;
    }

    await new Promise<void>((resolve) => {
      const finish = () => {
        if (runOffRef.current) { runOffRef.current(); runOffRef.current = null; }
        runFinishRef.current = null;
        teacherInputQueueRef.current = [];
        setTeacherAwaiting(false);
        resolve();
      };
      runFinishRef.current = finish;
      const off = runner.on((ev) => {
        if (ev.type === 'stdout') appendTeacher(ev.text, 'out');
        else if (ev.type === 'stderr') appendTeacher(ev.text, 'err');
        else if (ev.type === 'pythonError') appendTeacher(ev.error.display, 'err');
        else if (ev.type === 'stdin') {
          const inputLine = teacherInputQueueRef.current.shift();
          if (inputLine !== undefined) {
            appendTeacher(inputLine + '\n', 'in');
            setTeacherAwaiting(false);
            queueMicrotask(() => runner.provideInput(inputLine));
          } else {
            setTeacherAwaiting(true);
          }
        }
        else if (ev.type === 'done') finish();
        else if (ev.type === 'fatal') { appendTeacher((ev.text || '실행 오류') + '\n', 'err'); finish(); }
      });
      runOffRef.current = off;
      runner.run(codeRef.current);
    });
    appendTeacher('\n[프로그램이 종료되었습니다]\n', 'meta');
    setTeacherRunning(false);
  }, [teacherRunning, ensureRunner, appendTeacher]);

  const handleTeacherInput = useCallback((value: string) => {
    const inputLines = value === '' ? [''] : createSampleInputQueue(value);
    const [firstLine = '', ...remainingLines] = inputLines;
    teacherInputQueueRef.current = remainingLines;
    appendTeacher(firstLine + '\n', 'in');
    setTeacherAwaiting(false);
    runnerRef.current?.provideInput(firstLine);
  }, [appendTeacher]);

  const handleTeacherStop = useCallback(() => {
    runnerRef.current?.stop();
    teacherInputQueueRef.current = [];
    appendTeacher('\n[실행을 중단했습니다]\n', 'meta');
    runFinishRef.current?.();
    setTeacherAwaiting(false);
    setTeacherRunning(false);
  }, [appendTeacher]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ backgroundColor: 'var(--color-surface)' }}>
        <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-ink)' }}>세션을 찾을 수 없습니다</p>
        <Link href={returnHref} style={{ fontSize: '14px', color: 'var(--color-primary)' }}>학생 현황으로 돌아가기</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: 'var(--color-surface)' }}>
        <span style={{ fontSize: '14px', color: 'var(--color-sub)' }}>세션 불러오는 중...</span>
      </div>
    );
  }

  const currentLiveSnapshot = liveProblemSnapshot?.problem.id === session.problem_id
    ? liveProblemSnapshot
    : null;
  const liveProblem = currentLiveSnapshot?.problem ?? session.problems;
  const problem = previewSnapshot?.problem ?? liveProblem;
  const isPreview = previewSnapshot !== null || previewLoading;
  const displayedProblemId = previewSnapshot?.problem.id
    ?? session.problem_id
    ?? '';
  const displayedPath = findProblemPath(
    session.learning_context,
    displayedProblemId
  ) ?? session.learning_context?.path ?? null;
  const displayedSamples = previewSnapshot?.test_cases
    ?? currentLiveSnapshot?.test_cases
    ?? [];
  const editorValue = previewSnapshot
    ? previewSnapshot.problem.starter_code ?? ''
    : code;
  const liveProblemLabel = movementPath?.problem
    ? `${movementPath.problem.problemNo}. ${movementPath.problem.title}`
    : liveProblem
      ? `${liveProblem.problem_no}. ${liveProblem.title}`
      : '현재 문제';
  const isMonitoringLiveProblem = !isPreview
    && studentOnline
    && liveSessionId === sessionId
    && liveProblemId === session.problem_id;
  const diff = problem?.difficulty;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
      <WholePagePointerOverlay
        ref={wholePagePointerRef}
        enabled={isMonitoringLiveProblem}
      />
      <header
        data-collaboration-surface="header"
        className="flex items-center px-4 gap-3 flex-shrink-0 bg-card"
        style={{ height: 48, borderBottom: '1px solid var(--color-border)', zIndex: 10 }}
      >
        <Link href={returnHref} aria-label="학생 현황으로 돌아가기" className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-[var(--color-surface)]" style={{ color: 'var(--color-sub)', fontSize: '13px' }}>
          <ChevronLeft size={16} /> 학생 현황
        </Link>
        <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border)' }} />

        {session.learning_context && (
          <>
            <CurriculumNavigator
              mode="teacher"
              context={session.learning_context}
              displayedPath={displayedPath ?? session.learning_context.path}
              displayedProblemId={displayedProblemId}
              liveProblemId={liveProblemId}
              allSubjectsHref={returnHref}
              onOpenChange={setCurriculumOpen}
              onSelectProblem={handleCurriculumProblemSelect}
            />
            <div style={{ width: 1, height: 20, backgroundColor: 'var(--color-border)' }} />
          </>
        )}

        {problem && (
          <div className="flex items-center gap-2">
            <BookOpen size={15} style={{ color: 'var(--color-sub)' }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ink)' }}>{problem.problem_no}. {problem.title}</span>
            {diff && (
              <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[diff].bg, color: DIFF_STYLE[diff].color }}>
                {DIFF_LABEL[diff]}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 flex justify-center">
          <div
            className="flex min-w-0 max-w-[420px] items-center gap-2 rounded-lg px-3 py-1.5"
            style={{ backgroundColor: studentOnline ? 'var(--tint-soft)' : 'var(--color-surface)', border: `1px solid ${studentOnline ? 'var(--tint-line)' : 'var(--color-border)'}` }}
            title={studentOnline ? `${studentName ?? '학생'} 접속 중` : undefined}
          >
            {studentOnline ? (
              <div
                className="flex items-center justify-center rounded-full text-white font-bold flex-shrink-0"
                style={{ width: 22, height: 22, fontSize: 11, backgroundColor: CURSOR_COLORS.student }}
              >
                {(studentName ?? '학').charAt(0)}
              </div>
            ) : (
              <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: '#BCC0C7' }} />
            )}
            <span className="min-w-0 truncate" style={{ fontSize: '13px', fontWeight: 600, color: studentOnline ? CURSOR_COLORS.student : '#BCC0C7' }}>
              {studentName ?? '학생'} {studentOnline ? '접속 중' : '미접속'}
            </span>
            {studentOnline && <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: CURSOR_COLORS.student }} />}
          </div>
        </div>

        {!isPreview && problem?.use_ai_feedback && (
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
              {aiFeedbackLoading && aiFeedbacks.length === 0 && <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#4F46E5' }} />}
            </button>
            {aiFeedbackPanelOpen && (
              <AiFeedbackPanel feedbacks={aiFeedbacks} loading={aiFeedbackLoading && aiFeedbacks.length === 0} onClose={() => setAiFeedbackPanelOpen(false)} />
            )}
          </div>
        )}

        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)' }}>{teacherName} 선생님</span>
        <ThemeToggle />
      </header>

      {isPreview && problem && (
        <div
          role="status"
          aria-live="polite"
          className="flex h-11 shrink-0 items-center gap-3 px-4"
          style={{
            backgroundColor: 'var(--color-primary-light)',
            borderBottom: '1px solid var(--tint-accent-line)',
            color: 'var(--color-primary-hover)',
          }}
          data-testid="teacher-problem-preview-banner"
        >
          <BookOpen size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12, fontWeight: 650 }}>
            미리보기: {problem.problem_no}. {problem.title}
            <span style={{ color: 'var(--color-sub)', fontWeight: 500 }}>
              {' '}· 학생 LIVE: {liveProblemLabel}
            </span>
          </span>
          <button
            type="button"
            onClick={returnToLiveProblem}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-white transition-colors hover:brightness-95"
            style={{ backgroundColor: 'var(--color-primary)', fontSize: 12, fontWeight: 700 }}
          >
            LIVE 문제로 돌아가기 <ArrowRight size={13} />
          </button>
        </div>
      )}

      {previewLoading && (
        <div
          role="status"
          className="flex h-9 shrink-0 items-center justify-center px-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            color: 'var(--color-sub)',
            fontSize: 12,
          }}
        >
          선택한 문제를 불러오는 중입니다...
        </div>
      )}

      {previewError && (
        <div
          role="alert"
          className="flex h-10 shrink-0 items-center gap-3 px-4"
          style={{
            backgroundColor: 'var(--tint-danger)',
            borderBottom: '1px solid var(--tint-danger-line)',
            color: 'var(--color-danger)',
            fontSize: 12,
          }}
        >
          <span className="flex-1">{previewError}</span>
          <button type="button" onClick={() => setPreviewError(null)} aria-label="오류 닫기">
            <X size={14} />
          </button>
        </div>
      )}

      {!studentHasActiveSession && (
        <div
          role="status"
          className="flex h-9 shrink-0 items-center justify-center px-4"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderBottom: '1px solid var(--color-border)',
            color: 'var(--color-sub)',
            fontSize: 12,
          }}
        >
          학생이 현재 문제를 풀고 있지 않습니다. 마지막 세션을 검토하고 있습니다.
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="flex min-w-0 flex-1 overflow-hidden transition-[margin] duration-200 ease-out xl:ml-[var(--curriculum-offset)]"
          style={{
            '--curriculum-offset': curriculumOpen && session.learning_context
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
          {problem ? (
            <PublicProblemStatement problem={problem} samples={displayedSamples} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p style={{ fontSize: '14px', color: '#BCC0C7' }}>문제 정보 없음</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 cursor-col-resize" style={{ width: 5, backgroundColor: '#2D2D2D' }} onMouseDown={handleMouseDown} />

        <div
          ref={editorPaneRef}
          data-collaboration-surface="editor"
          className="flex flex-col flex-1 overflow-hidden relative"
          onMouseMove={handlePaneMouseMove}
          onMouseLeave={handlePaneMouseLeave}
        >
          <div className="flex items-center px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #2D2D2D', backgroundColor: '#1E1E1E' }}>
            <span style={{ fontSize: '12px', color: 'var(--color-sub)', fontFamily: 'monospace' }}>Python 3</span>
            <span style={{ fontSize: '11px', color: '#6A9955', marginLeft: 12, flex: 1 }}>
              {isPreview
                ? '초기 코드 미리보기 · 읽기 전용'
                : studentOnline
                  ? `${studentName ?? '학생'}의 코드를 함께 편집 중입니다`
                  : '학생이 접속하면 실시간으로 연동됩니다'}
            </span>
            {!isPreview && (teacherRunning ? (
              <button
                onClick={handleTeacherStop}
                className="flex items-center gap-1.5 px-3 rounded-lg mr-2"
                style={{ height: 28, backgroundColor: '#3A2020', color: '#F87171', fontSize: '12px', fontWeight: 600 }}
                title="실행 정지"
              >
                <Square size={12} /> 정지
              </button>
            ) : (
              <button
                onClick={handleTeacherRun}
                className="flex items-center gap-1.5 px-3 rounded-lg mr-2"
                style={{ height: 28, backgroundColor: 'var(--color-primary)', color: 'var(--color-card)', fontSize: '12px', fontWeight: 600 }}
                title="현재 코드 직접 실행 (채점 없음)"
              >
                <Play size={12} /> 실행
              </button>
            ))}
            {!isPreview && <button
              onClick={() => setTerminalOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 rounded-lg mr-2"
              style={{ height: 28, border: '1px solid #3D3D3D', backgroundColor: terminalOpen ? '#2D2D2D' : 'transparent', fontSize: '12px', fontWeight: 600, color: terminalOpen ? '#D4D4D4' : '#8C8C8C' }}
              title="터미널 열기/닫기"
            >
              <Terminal size={13} /> 터미널
            </button>}
            <div className="flex items-center gap-0.5 rounded-lg overflow-hidden" style={{ border: '1px solid #3D3D3D' }}>
              <button
                onClick={() => setEditorFontSize(s => Math.max(10, s - 1))}
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, fontSize: '16px', color: '#8C8C8C', fontWeight: 600, backgroundColor: 'transparent' }}
                title="글자 크기 줄이기"
              >−</button>
              <span style={{ fontSize: '12px', color: '#8C8C8C', minWidth: 28, textAlign: 'center', lineHeight: '28px', borderLeft: '1px solid #3D3D3D', borderRight: '1px solid #3D3D3D' }}>
                {editorFontSize}
              </span>
              <button
                onClick={() => setEditorFontSize(s => Math.min(24, s + 1))}
                className="flex items-center justify-center"
                style={{ width: 28, height: 28, fontSize: '16px', color: '#8C8C8C', fontWeight: 600, backgroundColor: 'transparent' }}
                title="글자 크기 키우기"
              >+</button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            <MonacoEditor
              height="100%"
              language="python"
              theme="cove-dark"
              beforeMount={registerCoveTheme}
              onMount={handleEditorMount}
              value={editorValue}
              onChange={(v) => handleCodeChange(v ?? '')}
              options={{ readOnly: isPreview, domReadOnly: isPreview, fontSize: editorFontSize, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 12, bottom: 12 }, automaticLayout: true, tabSize: 4 }}
            />
          </div>

          {!isPreview && terminalOpen && (
            <div
              data-collaboration-surface="terminal"
              className="flex-shrink-0"
              style={{ borderTop: '1px solid #2D2D2D', height: 220, backgroundColor: '#1E1E1E' }}
            >
              <div className="flex items-center justify-between pr-3" style={{ height: 38, borderBottom: '1px solid #2D2D2D' }}>
                <div className="flex items-stretch h-full">
                  <button
                    onClick={() => setActiveTab('teacher')}
                    className="flex items-center gap-1.5 px-4"
                    style={{ fontSize: '12px', fontWeight: 600, color: activeTab === 'teacher' ? '#D4D4D4' : '#8C8C8C', backgroundColor: activeTab === 'teacher' ? '#1E1E1E' : 'transparent', borderBottom: activeTab === 'teacher' ? '2px solid var(--color-primary)' : '2px solid transparent' }}
                  >
                    선생님
                    {teacherRunning && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#4ADE80' }} />}
                  </button>
                  <button
                    onClick={() => setActiveTab('student')}
                    className="flex items-center gap-1.5 px-4"
                    style={{ fontSize: '12px', fontWeight: 600, color: activeTab === 'student' ? '#D4D4D4' : '#8C8C8C', backgroundColor: activeTab === 'student' ? '#1E1E1E' : 'transparent', borderBottom: activeTab === 'student' ? `2px solid ${CURSOR_COLORS.student}` : '2px solid transparent' }}
                  >
                    {studentName ?? '학생'}
                    {studentWaiting && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: CURSOR_COLORS.student }} />}
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  {activeTab === 'teacher' && (
                    teacherRunning ? (
                      <button onClick={handleTeacherStop} className="flex items-center gap-1 px-2 rounded" style={{ height: 24, backgroundColor: '#3A2020', color: '#F87171', fontSize: '11px', fontWeight: 600 }} title="실행 정지">
                        <Square size={10} /> 정지
                      </button>
                    ) : (
                      <button onClick={handleTeacherRun} className="flex items-center gap-1 px-2 rounded" style={{ height: 24, backgroundColor: '#1B3A2A', color: '#4ADE80', fontSize: '11px', fontWeight: 600 }} title="선생님 직접 실행 (채점 없음)">
                        <Play size={10} /> 실행
                      </button>
                    )
                  )}
                  <button onClick={() => setTerminalOpen(false)} className="flex items-center justify-center rounded" style={{ width: 22, height: 22, color: '#8C8C8C' }} title="닫기">
                    <X size={13} />
                  </button>
                </div>
              </div>
              {activeTab === 'teacher' ? (
                <ConsoleTerminal
                  lines={teacherLines}
                  awaitingInput={teacherAwaiting}
                  onSubmitInput={handleTeacherInput}
                  mode="interactive"
                  supported={interactiveSupported}
                  emptyHint="오른쪽 위 실행 버튼을 눌러 현재 코드를 직접 실행할 수 있어요. (채점 없음)"
                  height={182}
                />
              ) : (
                <ConsoleTerminal
                  lines={studentLines}
                  awaitingInput={studentWaiting}
                  mode="mirror"
                  supported={interactiveSupported}
                  emptyHint="학생이 코드를 실행하면 여기에 실시간으로 표시됩니다."
                  height={182}
                />
              )}
            </div>
          )}

          {isPreview ? (
            <div
              className="flex h-11 shrink-0 items-center justify-between gap-3 bg-card px-4"
              style={{ borderTop: '1px solid var(--color-border)' }}
            >
              <span style={{ color: 'var(--color-sub)', fontSize: 12 }}>
                미리보기에서는 실행, 코드 편집, 피드백 전송을 사용할 수 없습니다.
              </span>
              <button
                type="button"
                onClick={returnToLiveProblem}
                className="shrink-0 rounded-lg px-3 py-1.5"
                style={{
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary-hover)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                LIVE 문제로 돌아가기
              </button>
            </div>
          ) : <div className="flex-shrink-0 bg-card" style={{ borderTop: '1px solid var(--color-border)', height: feedbackOpen ? 180 : 44 }}>
            <button onClick={() => setFeedbackOpen(o => !o)} className="flex items-center gap-2 w-full px-4" style={{ height: 44, borderBottom: feedbackOpen ? '1px solid var(--color-border)' : 'none' }}>
              <Send size={14} style={{ color: 'var(--color-primary)' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-ink)' }}>피드백 작성</span>
              {feedbackSent && <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#16A34A', marginLeft: 4 }}><Check size={12} /> 저장됨</span>}
              {feedbackOpen ? <ChevronDown size={13} style={{ color: 'var(--color-sub)' }} /> : <ChevronUp size={13} style={{ color: 'var(--color-sub)' }} />}
            </button>
            {feedbackOpen && (
              <div className="flex gap-2 px-4 pb-3" style={{ height: 136, paddingTop: 10 }}>
                <textarea
                  className="flex-1 rounded-xl px-3 py-2 resize-none focus:outline-none"
                  style={{ border: '1px solid var(--color-border)', fontSize: '13px', color: 'var(--color-ink)', lineHeight: 1.6 }}
                  placeholder="학생에게 전달할 피드백을 작성하세요..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-primary)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                />
                <button
                  onClick={handleSaveFeedback}
                  disabled={!feedback.trim()}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl px-4 text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, minWidth: 72 }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
                >
                  <Send size={16} />
                  전달
                </button>
              </div>
            )}
          </div>}
        </div>
      </div>
      </div>
    </div>
  );
}
