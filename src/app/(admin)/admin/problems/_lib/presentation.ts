import type { ProblemDifficulty } from '@/lib/types/db';
import type { HierarchyKind } from './types';

export const DIFFICULTY_LABEL: Record<ProblemDifficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

export const DIFFICULTY_STYLE: Record<ProblemDifficulty, { bg: string; color: string }> = {
  easy: { bg: '#DCFCE7', color: '#15803D' },
  medium: { bg: '#EAF1FD', color: '#1450B5' },
  hard: { bg: '#FEE2E2', color: '#B91C1C' },
};

export const HIERARCHY_LABEL: Record<HierarchyKind, string> = {
  subject: '과목',
  stage: '단계',
  chapter: '챕터',
};

export const HIERARCHY_API: Record<HierarchyKind, string> = {
  subject: '/api/admin/subjects',
  stage: '/api/admin/stages',
  chapter: '/api/admin/chapters',
};
