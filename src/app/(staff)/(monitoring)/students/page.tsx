'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, MessageSquare, RefreshCw, Circle, Search, Wifi, X } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';
import {
  currentInternalRoute,
  withReturnTo,
} from '@/lib/navigation/returnTo';
import { routeWithQuery } from '@/lib/navigation/queryState';
import {
  readScrollPosition,
  saveScrollPosition,
  scrollRestorationKey,
} from '@/lib/navigation/scrollRestoration';

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
  medium: { bg: 'var(--tint-soft)', color: '#1D4ED8' },
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedQuery = searchParams.get('q') ?? '';
  const requestedStatus = searchParams.get('status');
  const status = requestedStatus === 'online'
    || requestedStatus === 'solving'
    || requestedStatus === 'offline'
    ? requestedStatus
    : 'all';
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [query, setQuery] = useState(requestedQuery);
  const initializedRef = useRef(false);
  const queryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnRoute = currentInternalRoute({
    pathname,
    search: searchParams.toString(),
  });
  const scrollKey = scrollRestorationKey(pathname, returnRoute);

  const saveView = () => {
    const scrollContainer = document.querySelector('main');
    saveScrollPosition(sessionStorage, scrollKey, scrollContainer?.scrollTop ?? window.scrollY);
  };

  const replaceQuery = useCallback((updates: Record<string, string | null>) => {
    router.replace(routeWithQuery(pathname, searchParams, updates), {
      scroll: false,
    });
  }, [pathname, router, searchParams]);

  const updateSearch = useCallback((value: string) => {
    setQuery(value);
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current);
    queryTimerRef.current = setTimeout(() => {
      replaceQuery({ q: value.trim() || null });
    }, 250);
  }, [replaceQuery]);

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
  useEffect(() => setQuery(requestedQuery), [requestedQuery]);
  useEffect(() => () => {
    if (queryTimerRef.current) clearTimeout(queryTimerRef.current);
  }, []);
  useEffect(() => {
    if (loading) return;
    const position = readScrollPosition(sessionStorage, scrollKey);
    if (position == null) return;
    requestAnimationFrame(() => {
      const scrollContainer = document.querySelector('main');
      if (scrollContainer) scrollContainer.scrollTop = position;
      else window.scrollTo({ top: position });
    });
  }, [loading, scrollKey]);

  const onlineCount = students.filter(s => isOnline(s.last_active_at)).length;
  const solvingCount = students.filter(s => s.activeSession && isOnline(s.last_active_at)).length;
  const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR');
  const visibleStudents = students.filter((student) => {
    const online = isOnline(student.last_active_at);
    const solving = online && Boolean(student.activeSession);
    if (status === 'online' && !online) return false;
    if (status === 'solving' && !solving) return false;
    if (status === 'offline' && online) return false;
    if (!normalizedQuery) return true;
    return student.name.toLocaleLowerCase('ko-KR').includes(normalizedQuery)
      || student.username.toLocaleLowerCase('ko-KR').includes(normalizedQuery);
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-ink)' }}>학생 현황</h1>
          <p style={{ fontSize: '13px', color: 'var(--color-sub)', marginTop: 2 }}>담당 학생의 접속 및 학습 현황을 확인하세요.</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 rounded-lg transition-colors"
          style={{
            height: 34,
            border: '1px solid var(--color-border)',
            fontSize: '13px',
            color: refreshing ? '#BCC0C7' : 'var(--color-sub)',
            backgroundColor: 'var(--color-card)',
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

      <div className="flex items-center gap-6 px-5 py-3 bg-card rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
        <div>
          <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>전체</span>
          <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-ink)', marginLeft: 8 }}>{students.length}</span>
          <span style={{ fontSize: '13px', color: 'var(--color-sub)' }}>명</span>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border)' }} />
        <div className="flex items-center gap-2">
          <Wifi size={14} style={{ color: '#16A34A' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>접속 중</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: '#16A34A' }}>{onlineCount}</span>
        </div>
        <div style={{ width: 1, height: 28, backgroundColor: 'var(--color-border)' }} />
        <div className="flex items-center gap-2">
          <BookOpen size={14} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>풀이 중</span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>{solvingCount}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-card p-3 sm:flex-row sm:items-center sm:justify-between" style={{ border: '1px solid var(--color-border)' }}>
        <div className="flex flex-wrap gap-1.5">
          {([
            ['all', '전체'],
            ['online', '접속 중'],
            ['solving', '풀이 중'],
            ['offline', '오프라인'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => replaceQuery({
                status: value === 'all' ? null : value,
              })}
              className="rounded-lg px-3 py-2"
              style={{
                backgroundColor: status === value ? 'var(--color-primary-light)' : 'transparent',
                color: status === value ? 'var(--color-primary)' : 'var(--color-sub)',
                fontSize: 12,
                fontWeight: status === value ? 700 : 500,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-lg px-3 sm:w-64" style={{ border: '1px solid var(--color-border)' }}>
          <Search size={14} style={{ color: 'var(--color-sub)' }} />
          <input
            value={query}
            onChange={(event) => updateSearch(event.target.value)}
            placeholder="학생 이름 또는 아이디"
            className="min-w-0 flex-1 bg-transparent outline-none"
            style={{ fontSize: 12, color: 'var(--color-ink)' }}
          />
          {query && (
            <button type="button" onClick={() => updateSearch('')} aria-label="검색어 지우기">
              <X size={13} style={{ color: 'var(--color-sub)' }} />
            </button>
          )}
        </label>
      </div>

      <div className="bg-card rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-border)' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse" style={{ height: 64, borderBottom: i < 4 ? '1px solid var(--color-muted)' : 'none', margin: '0 20px' }} />
          ))
        ) : visibleStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <p style={{ fontSize: '14px', color: '#BCC0C7' }}>등록된 학생이 없습니다</p>
          </div>
        ) : (
          visibleStudents.map((s, idx) => {
            const online = isOnline(s.last_active_at);
            const session = online ? s.activeSession : null;
            const diff = session?.problems?.difficulty;

            return (
              <div
                key={s.id}
                className="flex items-center gap-4 px-5"
                style={{
                  height: 64,
                  borderBottom: idx < visibleStudents.length - 1 ? '1px solid var(--color-muted)' : 'none',
                  borderLeft: session ? '3px solid var(--color-primary)' : online ? '3px solid #16A34A' : '3px solid transparent',
                }}
              >
                <div className="relative shrink-0">
                  <div
                    className="rounded-full flex items-center justify-center font-semibold"
                    style={{
                      width: 36,
                      height: 36,
                      backgroundColor: online ? 'var(--tint-soft)' : 'var(--color-surface)',
                      color: online ? 'var(--color-primary)' : '#BCC0C7',
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
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-ink)' }}>{s.name}</span>
                    <span style={{ fontSize: '12px', color: '#BCC0C7' }}>@{s.username}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {session?.problems ? (
                      <>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)' }}>풀이 중</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-sub)' }}>
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
                    href={withReturnTo(`/feedback/${session.id}`, returnRoute)}
                    onClick={saveView}
                    className="flex items-center gap-1.5 px-3 rounded-lg transition-colors shrink-0"
                    style={{ height: 34, backgroundColor: 'var(--color-primary)', fontSize: '12px', fontWeight: 600, color: 'white' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-primary)')}
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
