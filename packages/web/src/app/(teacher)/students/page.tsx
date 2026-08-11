'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { BookOpen, MessageSquare, RefreshCw, Circle, Wifi } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';

type StudentSession = {
  id: string;
  student_id: string;
  problem_id: string | null;
  status: 'active' | 'ended';
  started_at: string;
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
  users: { id: string; name: string; username: string } | null;
};

type StudentRow = {
  id: string;
  username: string;
  name: string;
  is_active: boolean;
  last_active_at: string | null;
  activeSession: StudentSession | null;
};

const DIFF_LABEL: Record<ProblemDifficulty, string> = { easy: '쉬움', medium: '보통', hard: '어려움' };
const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#F0FDF4', color: '#15803D' },
  medium: { bg: '#EFF6FF', color: '#1D4ED8' },
  hard: { bg: '#FFF1F2', color: '#BE123C' },
};

function isOnline(iso: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 20 * 1000;
}

function formatRelative(iso: string | null) {
  if (!iso) return '기록 없음';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const initializedRef = useRef(false);

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    const [usersRes, sessionsRes] = await Promise.all([
      fetch('/api/students'),
      fetch('/api/sessions'),
    ]);
    const usersJson = await usersRes.json();
    const sessionsJson = await sessionsRes.json();

    const activeSessions: StudentSession[] = (sessionsJson.sessions ?? []).filter(
      (s: StudentSession) => s.status === 'active'
    );
    const sessionMap: Record<string, StudentSession> = {};
    for (const s of activeSessions) sessionMap[s.student_id] = s;

    const rows: StudentRow[] = (usersJson.users ?? []).map((u: { id: string; username: string; name: string; is_active: boolean; last_active_at: string | null }) => ({
      ...u,
      activeSession: sessionMap[u.id] ?? null,
    }));

    rows.sort((a, b) => {
      const aOnline = isOnline(a.last_active_at);
      const bOnline = isOnline(b.last_active_at);
      const aSolving = aOnline && !!a.activeSession;
      const bSolving = bOnline && !!b.activeSession;
      if (aSolving && !bSolving) return -1;
      if (!aSolving && bSolving) return 1;
      if (aOnline && !bOnline) return -1;
      if (!aOnline && bOnline) return 1;
      return 0;
    });

    setStudents(rows);
    setLastUpdated(new Date());
    if (!initializedRef.current) {
      initializedRef.current = true;
      setLoading(false);
    }
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const interval = setInterval(() => load(false), 15000);
    return () => clearInterval(interval);
  }, [load]);

  const onlineCount = students.filter(s => isOnline(s.last_active_at)).length;
  const solvingCount = students.filter(s => s.activeSession && isOnline(s.last_active_at)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#16181D' }}>학생 현황</h1>
          <p style={{ fontSize: '13px', color: '#8A8F98', marginTop: 2 }}>담당 학생의 접속 및 학습 현황을 확인하세요.</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
          style={{
            height: 34,
            border: '1px solid #E5E8EC',
            fontSize: '13px',
            color: refreshing ? '#BCC0C7' : '#5A6270',
            backgroundColor: '#FFFFFF',
            cursor: refreshing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? '갱신 중' : '새로고침'}
          {!refreshing && (
            <span style={{ fontSize: '11px', color: '#BCC0C7' }}>
              {lastUpdated.getHours().toString().padStart(2, '0')}:{lastUpdated.getMinutes().toString().padStart(2, '0')}
            </span>
          )}
        </button>
      </div>

      <div className="flex items-center gap-6 px-5 py-3 bg-card rounded-xl" style={{ border: '1px solid #E5E8EC' }}>
        <div>
          <span style={{ fontSize: '12px', color: '#8A8F98' }}>전체</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#16181D', marginLeft: 8 }}>{students.length}</span>
          <span style={{ fontSize: '13px', color: '#8A8F98' }}>명</span>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: '#E5E8EC' }} />
        <div className="flex items-center gap-2">
          <Wifi size={14} style={{ color: '#16A34A' }} />
          <span style={{ fontSize: '12px', color: '#8A8F98' }}>접속 중</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#16A34A' }}>{onlineCount}</span>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: '#E5E8EC' }} />
        <div className="flex items-center gap-2">
          <BookOpen size={14} style={{ color: '#1B64DA' }} />
          <span style={{ fontSize: '12px', color: '#8A8F98' }}>풀이 중</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#1B64DA' }}>{solvingCount}</span>
        </div>
      </div>

      <div className="bg-card rounded-xl overflow-hidden" style={{ border: '1px solid #E5E8EC' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 64, borderBottom: i < 4 ? '1px solid #F3F4F6' : 'none', margin: '0 20px' }} />
          ))
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p style={{ fontSize: '14px', color: '#BCC0C7' }}>등록된 학생이 없습니다</p>
          </div>
        ) : (
          students.map((s, idx) => {
            const online = isOnline(s.last_active_at);
            const session = online ? s.activeSession : null;
            const diff = session?.problems?.difficulty;

            return (
              <div
                key={s.id}
                className="flex items-center gap-4 px-5"
                style={{
                  height: 64,
                  borderBottom: idx < students.length - 1 ? '1px solid #F3F4F6' : 'none',
                  borderLeft: session ? '3px solid #1B64DA' : online ? '3px solid #16A34A' : '3px solid transparent',
                }}
              >
                <div className="relative shrink-0">
                  <div
                    className="rounded-full flex items-center justify-center font-semibold"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: online ? '#EFF6FF' : '#F6F7F9',
                      color: online ? '#1B64DA' : '#BCC0C7',
                      fontSize: '14px',
                    }}
                  >
                    {s.name.charAt(0)}
                  </div>
                  <Circle
                    size={9}
                    className="absolute"
                    style={{
                      bottom: 0,
                      right: 0,
                      fill: online ? '#16A34A' : '#D1D5DB',
                      color: online ? '#16A34A' : '#D1D5DB',
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#16181D' }}>{s.name}</span>
                    <span style={{ fontSize: '12px', color: '#BCC0C7' }}>@{s.username}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {session?.problems ? (
                      <>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#1B64DA' }}>풀이 중</span>
                        <span style={{ fontSize: '12px', color: '#5A6270' }}>
                          {session.problems.problem_no}. {session.problems.title}
                        </span>
                        {diff && (
                          <span className="px-1.5 py-px rounded" style={{ fontSize: '10px', fontWeight: 600, backgroundColor: DIFF_COLOR[diff].bg, color: DIFF_COLOR[diff].color }}>
                            {DIFF_LABEL[diff]}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', color: online ? '#16A34A' : '#BCC0C7' }}>
                        {online ? '접속 중' : `마지막 접속 ${formatRelative(s.last_active_at)}`}
                      </span>
                    )}
                  </div>
                </div>

                {session && (
                  <Link
                    href={`/feedback/${session.id}`}
                    className="flex items-center gap-1.5 px-3 rounded-lg transition-colors shrink-0"
                    style={{ height: 34, backgroundColor: '#1B64DA', fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1450B5')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1B64DA')}
                  >
                    <MessageSquare size={13} /> 함께 풀기
                  </Link>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
