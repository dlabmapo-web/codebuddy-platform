import { CheckCircle2, MinusCircle, XCircle, type LucideIcon } from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';
import type { SubmissionStatus } from './types';

export const DIFF_LABEL: Record<ProblemDifficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

export const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

export const STATUS_INFO: Record<SubmissionStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: LucideIcon;
}> = {
  pass: { label: '정답', color: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
  partial: { label: '일부 통과', color: '#D97706', bg: '#FEF3C7', Icon: MinusCircle },
  fail: { label: '오답', color: '#DC2626', bg: '#FEE2E2', Icon: XCircle },
};

export function formatElapsed(sec: number | null) {
  if (!sec) return '-';
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return minutes > 0 ? `${minutes}분 ${seconds}초` : `${seconds}초`;
}

export function formatDate(iso: string) {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}.${month}.${day} ${hours}:${minutes}`;
}
