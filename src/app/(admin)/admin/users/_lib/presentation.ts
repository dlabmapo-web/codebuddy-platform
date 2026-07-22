import type { RoleFilter, StatusFilter } from './types';

export const ROLE_LABEL: Record<string, string> = {
  student: '학생',
  teacher: '선생님',
  admin: '관리자',
};

export const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  student: { bg: '#EAF1FD', color: '#1450B5' },
  teacher: { bg: '#F3E8FF', color: '#7C3AED' },
  admin: { bg: '#FEF3C7', color: '#B45309' },
};

export const ROLE_TABS: Array<{ key: RoleFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'student', label: '학생' },
  { key: 'teacher', label: '선생님' },
];

export const STATUS_TABS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'active', label: '활성' },
  { key: 'inactive', label: '비활성' },
];

export function formatRelative(iso: string | null) {
  if (!iso) return '접속 기록 없음';
  const difference = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(difference / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(iso);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

export function isOnline(iso: string | null) {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < 5 * 60 * 1000;
}
