import { CheckCircle2, MinusCircle, XCircle, type LucideIcon } from 'lucide-react';
import type { Submission } from './types';

export const STATUS_CONFIG: Record<Submission['status'], {
  label: string;
  color: string;
  bg: string;
  Icon: LucideIcon;
}> = {
  pass: { label: '정답', color: '#15803D', bg: '#F0FDF4', Icon: CheckCircle2 },
  partial: { label: '일부 통과', color: '#D97706', bg: '#FFFBEB', Icon: MinusCircle },
  fail: { label: '오답', color: '#DC2626', bg: '#FFF1F2', Icon: XCircle },
};

export function formatElapsed(seconds: number | null) {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
