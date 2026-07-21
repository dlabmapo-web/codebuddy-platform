import type { StudentResponseRow, StudentRow, StudentSession } from './types';

export function isOnline(iso: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 20 * 1000;
}

export function formatRelative(iso: string | null) {
  if (!iso) return '기록 없음';
  const difference = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function mergeStudentSessions(users: StudentResponseRow[], sessions: StudentSession[]) {
  const activeSessions = sessions.filter((session) => session.status === 'active');
  const sessionMap: Record<string, StudentSession> = {};
  for (const session of activeSessions) sessionMap[session.student_id] = session;

  const rows: StudentRow[] = users.map((user) => ({
    ...user,
    activeSession: sessionMap[user.id] ?? null,
  }));

  rows.sort((a, b) => {
    const aOnline = isOnline(a.last_active_at);
    const bOnline = isOnline(b.last_active_at);
    const aSolving = aOnline && Boolean(a.activeSession);
    const bSolving = bOnline && Boolean(b.activeSession);
    if (aSolving && !bSolving) return -1;
    if (!aSolving && bSolving) return 1;
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return 0;
  });

  return rows;
}
