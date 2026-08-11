'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Send, BookOpen, ChevronDown, ChevronUp, Check, Terminal, Play, Square, X, Sparkles } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import { injectCursorStyles, CURSOR_COLORS } from '@/lib/monaco/cursor';
import { applyMinimalEdit } from '@/lib/monaco/applyEdit';
import { PointerOverlay, type RemotePointer } from '@/components/collab/PointerOverlay';
import { ConsoleTerminal, type TerminalLine } from '@/components/collab/ConsoleTerminal';
import { AiFeedbackPanel, type AiFeedbackItem } from '@/components/collab/AiFeedbackPanel';
import { withAnonymousImageCors } from '@/components/studio/rich-text-html';
import { InteractiveRunner, isInteractiveSupported } from '@/lib/pyodide/interactiveRunner';
import { loadPyodide as loadPyodideFallback } from '@/lib/pyodide/loader';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { OnMount } from '@monaco-editor/react';
import type { ProblemDifficulty } from '@/lib/types/db';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: '#1E1E1E' }}>
      <span style={{ fontSize: '13px', color: '#5A6270' }}>에디터 로딩 중...</span>
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
    starter_code: string | null;
    use_ai_feedback: boolean;
  } | null;
  users: { id: string; name: string; username: string } | null;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

export default function FeedbackClient({ sessionId, teacherId, teacherName }: { sessionId: string; teacherId: string; teacherName: string }) {
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [code, setCode] = useState('');
  const [studentOnline, setStudentOnline] = useState(false);
  const [studentName, setStudentName] = useState<string | null>(null);
  const studentNameRef = useRef<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(42);
  const [feedback, setFeedback] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [remotePointers, setRemotePointers] = useState<Record<string, RemotePointer>>({});
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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const broadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeRef = useRef('');
  const awaitingSyncRef = useRef(false);
  const lastCursorSentRef = useRef(0);
  const lastCodeSentRef = useRef(0);
  const pendingCodeRef = useRef<string | null>(null);
  const lastPointerSentRef = useRef(0);
  const editorPaneRef = useRef<HTMLDivElement>(null);
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
        setSession(json.session);
        const initial = json.session.final_code ?? json.session.problems?.starter_code ?? '';
        setCode(initial);
        codeRef.current = initial;
        setStudentName(json.session.users?.name ?? null);

        fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teacher_id: teacherId }),
        });
      })
      .catch(() => setLoadError(true));
  }, [sessionId, teacherId]);

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

    const updateRemoteCursor = (name: string, role: string, position: { lineNumber: number; column: number }) => {
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
      .on('broadcast', { event: 'pointer:move' }, ({ payload }: { payload: { senderId: string; name: string; role: string; xPct: number; yPct: number } }) => {
        if (payload.senderId === teacherId) return;
        setRemotePointers(prev => ({ ...prev, [payload.senderId]: { name: payload.name, role: payload.role, xPct: payload.xPct, yPct: payload.yPct } }));
      })
      .on('broadcast', { event: 'pointer:leave' }, ({ payload }: { payload: { senderId: string } }) => {
        setRemotePointers(prev => {
          const next = { ...prev };
          delete next[payload.senderId];
          return next;
        });
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
          await channel.track({ userId: teacherId, name: teacherName, role: 'teacher' });
          awaitingSyncRef.current = true;
          channel.send({ type: 'broadcast', event: 'sync:request', payload: { senderId: teacherId } });
          setTimeout(() => { awaitingSyncRef.current = false; }, 3000);
        }
      });

    channelRef.current = channel;
    return () => { channel.unsubscribe(); channelRef.current = null; };
  }, [session, sessionId, teacherId, teacherName, scheduleAutoSave]);

  const handleEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    injectCursorStyles();

    editor.onDidChangeCursorPosition((e: { position: { lineNumber: number; column: number } }) => {
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
    if (!channelRef.current || !hasPeerRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'pointer:leave', payload: { senderId: teacherId } });
  }, [teacherId]);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    codeRef.current = newCode;
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
    if (teacherRunning) return;
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
        setTeacherAwaiting(false);
        resolve();
      };
      runFinishRef.current = finish;
      const off = runner.on((ev) => {
        if (ev.type === 'stdout') appendTeacher(ev.text, 'out');
        else if (ev.type === 'stderr') appendTeacher(ev.text, 'err');
        else if (ev.type === 'pythonError') appendTeacher(ev.error.display, 'err');
        else if (ev.type === 'stdin') setTeacherAwaiting(true);
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
    appendTeacher(value + '\n', 'in');
    setTeacherAwaiting(false);
    runnerRef.current?.provideInput(value);
  }, [appendTeacher]);

  const handleTeacherStop = useCallback(() => {
    runnerRef.current?.stop();
    appendTeacher('\n[실행을 중단했습니다]\n', 'meta');
    runFinishRef.current?.();
    setTeacherAwaiting(false);
    setTeacherRunning(false);
  }, [appendTeacher]);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3" style={{ backgroundColor: '#F6F7F9' }}>
        <p style={{ fontSize: '16px', fontWeight: 600, color: '#16181D' }}>세션을 찾을 수 없습니다</p>
        <Link href="/students" style={{ fontSize: '14px', color: '#1B64DA' }}>학생 현황으로 돌아가기</Link>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: '#F6F7F9' }}>
        <span style={{ fontSize: '14px', color: '#5A6270' }}>세션 불러오는 중...</span>
      </div>
    );
  }

  const problem = session.problems;
  const diff = problem?.difficulty;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ backgroundColor: '#1E1E1E' }}>
      <header className="flex items-center px-4 gap-3 flex-shrink-0 bg-card" style={{ height: 48, borderBottom: '1px solid #E5E8EC', zIndex: 10 }}>
        <Link href="/students" className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-[#F6F7F9]" style={{ color: '#5A6270', fontSize: '13px' }}>
          <ChevronLeft size={16} /> 학생 현황
        </Link>
        <div style={{ width: 1, height: 20, backgroundColor: '#E5E8EC' }} />

        {problem && (
          <div className="flex items-center gap-2">
            <BookOpen size={15} style={{ color: '#5A6270' }} />
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#16181D' }}>{problem.problem_no}. {problem.title}</span>
            {diff && (
              <span className="px-2 py-0.5 rounded" style={{ fontSize: '11px', fontWeight: 600, backgroundColor: DIFF_STYLE[diff].bg, color: DIFF_STYLE[diff].color }}>
                {DIFF_LABEL[diff]}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: studentOnline ? '#EFF6FF' : '#F6F7F9', border: `1px solid ${studentOnline ? '#BFDBFE' : '#E5E8EC'}` }}>
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
            <span style={{ fontSize: '13px', fontWeight: 600, color: studentOnline ? CURSOR_COLORS.student : '#BCC0C7' }}>
              {studentName ?? '학생'} {studentOnline ? '접속 중' : '미접속'}
            </span>
            {studentOnline && <div className="w-2 h-2 rounded-full animate-pulse flex-shrink-0" style={{ backgroundColor: CURSOR_COLORS.student }} />}
          </div>
        </div>

        {problem?.use_ai_feedback && (
          <div className="relative">
            <button
              onClick={() => setAiFeedbackPanelOpen((o) => !o)}
              className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
              style={{ height: 32, border: '1px solid #4F46E5', backgroundColor: aiFeedbackPanelOpen ? '#EEF2FF' : '#FFFFFF', fontSize: '13px', fontWeight: 600, color: '#4F46E5' }}
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

        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1B64DA' }}>{teacherName} 선생님</span>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="flex flex-col bg-card overflow-auto flex-shrink-0" style={{ width: `${leftWidth}%`, borderRight: '1px solid #E5E8EC' }}>
          {problem ? (
            <div className="p-5">
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>문제</h3>
              <div
                  className="tiptap-render"
                  style={{ fontSize: '14px', color: '#16181D', lineHeight: 1.75, marginBottom: 16 }}
                  dangerouslySetInnerHTML={{
                    __html: withAnonymousImageCors(problem.description),
                  }}
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
                  <p style={{ fontSize: '13px', color: '#5A6270', lineHeight: 1.6 }}>{problem.output_format}</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p style={{ fontSize: '14px', color: '#BCC0C7' }}>문제 정보 없음</p>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 cursor-col-resize" style={{ width: 5, backgroundColor: '#2D2D2D' }} onMouseDown={handleMouseDown} />

        <div
          ref={editorPaneRef}
          className="flex flex-col flex-1 overflow-hidden relative"
          onMouseMove={handlePaneMouseMove}
          onMouseLeave={handlePaneMouseLeave}
        >
          <PointerOverlay pointers={remotePointers} />
          <div className="flex items-center px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #2D2D2D', backgroundColor: '#1E1E1E' }}>
            <span style={{ fontSize: '12px', color: '#5A6270', fontFamily: 'monospace' }}>Python 3</span>
            <span style={{ fontSize: '11px', color: '#6A9955', marginLeft: 12, flex: 1 }}>
              {studentOnline ? `${studentName ?? '학생'}의 코드를 함께 편집 중입니다` : '학생이 접속하면 실시간으로 연동됩니다'}
            </span>
            {teacherRunning ? (
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
                style={{ height: 28, backgroundColor: '#1B64DA', color: '#FFFFFF', fontSize: '12px', fontWeight: 600 }}
                title="현재 코드 직접 실행 (채점 없음)"
              >
                <Play size={12} /> 실행
              </button>
            )}
            <button
              onClick={() => setTerminalOpen(o => !o)}
              className="flex items-center gap-1.5 px-2.5 rounded-lg mr-2"
              style={{ height: 28, border: '1px solid #3D3D3D', backgroundColor: terminalOpen ? '#2D2D2D' : 'transparent', fontSize: '12px', fontWeight: 600, color: terminalOpen ? '#D4D4D4' : '#8C8C8C' }}
              title="터미널 열기/닫기"
            >
              <Terminal size={13} /> 터미널
            </button>
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
              theme="paircode-dark"
              beforeMount={registerPaircodeTheme}
              onMount={handleEditorMount}
              value={code}
              onChange={(v) => handleCodeChange(v ?? '')}
              options={{ fontSize: editorFontSize, fontFamily: "'Fira Code', Consolas, monospace", minimap: { enabled: false }, scrollBeyondLastLine: false, lineNumbers: 'on', padding: { top: 12, bottom: 12 }, automaticLayout: true, tabSize: 4 }}
            />
          </div>

          {terminalOpen && (
            <div className="flex-shrink-0" style={{ borderTop: '1px solid #2D2D2D', height: 220, backgroundColor: '#1E1E1E' }}>
              <div className="flex items-center justify-between pr-3" style={{ height: 38, borderBottom: '1px solid #2D2D2D' }}>
                <div className="flex items-stretch h-full">
                  <button
                    onClick={() => setActiveTab('teacher')}
                    className="flex items-center gap-1.5 px-4"
                    style={{ fontSize: '12px', fontWeight: 600, color: activeTab === 'teacher' ? '#D4D4D4' : '#8C8C8C', backgroundColor: activeTab === 'teacher' ? '#1E1E1E' : 'transparent', borderBottom: activeTab === 'teacher' ? '2px solid #1B64DA' : '2px solid transparent' }}
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

          <div className="flex-shrink-0 bg-card" style={{ borderTop: '1px solid #E5E8EC', height: feedbackOpen ? 180 : 44 }}>
            <button onClick={() => setFeedbackOpen(o => !o)} className="flex items-center gap-2 w-full px-4" style={{ height: 44, borderBottom: feedbackOpen ? '1px solid #E5E8EC' : 'none' }}>
              <Send size={14} style={{ color: '#1B64DA' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#16181D' }}>피드백 작성</span>
              {feedbackSent && <span className="flex items-center gap-1" style={{ fontSize: '12px', color: '#16A34A', marginLeft: 4 }}><Check size={12} /> 저장됨</span>}
              {feedbackOpen ? <ChevronDown size={13} style={{ color: '#5A6270' }} /> : <ChevronUp size={13} style={{ color: '#5A6270' }} />}
            </button>
            {feedbackOpen && (
              <div className="flex gap-2 px-4 pb-3" style={{ height: 136, paddingTop: 10 }}>
                <textarea
                  className="flex-1 rounded-xl px-3 py-2 resize-none focus:outline-none"
                  style={{ border: '1px solid #E5E8EC', fontSize: '13px', color: '#16181D', lineHeight: 1.6 }}
                  placeholder="학생에게 전달할 피드백을 작성하세요..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onFocus={(e) => (e.target.style.borderColor = '#1B64DA')}
                  onBlur={(e) => (e.target.style.borderColor = '#E5E8EC')}
                />
                <button
                  onClick={handleSaveFeedback}
                  disabled={!feedback.trim()}
                  className="flex flex-col items-center justify-center gap-1 rounded-xl px-4 text-white transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#1B64DA', fontSize: '12px', fontWeight: 600, minWidth: 72 }}
                  onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#1450B5'; }}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
                >
                  <Send size={16} />
                  전달
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
