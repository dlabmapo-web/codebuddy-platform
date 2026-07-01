'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ChevronLeft, Send, BookOpen, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { registerPaircodeTheme } from '@/lib/monaco/theme';
import { injectCursorStyles, CURSOR_COLORS } from '@/lib/monaco/cursor';
import { applyMinimalEdit } from '@/lib/monaco/applyEdit';
import { PointerOverlay, type RemotePointer } from '@/components/collab/PointerOverlay';
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
      const className = `remote-cursor-${role}`;
      remoteCursorDecorationsRef.current = editor.deltaDecorations(remoteCursorDecorationsRef.current, [{
        range: new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, Math.max(position.column, position.column + 1)),
        options: { className, zIndex: 100 },
      }]);
      if (remoteCursorWidgetRef.current) editor.removeContentWidget(remoteCursorWidgetRef.current);
      const dom = document.createElement('div');
      dom.className = 'remote-cursor-label';
      dom.style.backgroundColor = color;
      dom.textContent = name.length > 4 ? name.slice(0, 4) : name;
      const widget = {
        getId: () => 'remote-cursor',
        getDomNode: () => dom,
        getPosition: () => ({ position, preference: [1] }),
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
          isApplyingRemoteRef.current = false;
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
      <header className="flex items-center px-4 gap-3 flex-shrink-0 bg-white" style={{ height: 48, borderBottom: '1px solid #E5E8EC', zIndex: 10 }}>
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

        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1B64DA' }}>{teacherName} 선생님</span>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="flex flex-col bg-white overflow-auto flex-shrink-0" style={{ width: `${leftWidth}%`, borderRight: '1px solid #E5E8EC' }}>
          {problem ? (
            <div className="p-5">
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#16181D', marginBottom: 8 }}>문제</h3>
              <div
                  className="tiptap-render"
                  style={{ fontSize: '14px', color: '#16181D', lineHeight: 1.75, marginBottom: 16 }}
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

          <div className="flex-shrink-0 bg-white" style={{ borderTop: '1px solid #E5E8EC', height: feedbackOpen ? 180 : 44 }}>
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
