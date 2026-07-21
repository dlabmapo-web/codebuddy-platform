import type { ProblemDifficulty } from '@/lib/types/db';

export const DIFF_LABEL: Record<ProblemDifficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

export const DIFF_COLOR: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#F0FDF4', color: '#15803D' },
  medium: { bg: '#EFF6FF', color: '#1D4ED8' },
  hard: { bg: '#FFF1F2', color: '#BE123C' },
};
