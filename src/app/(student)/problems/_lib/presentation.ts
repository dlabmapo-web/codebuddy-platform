import {
  Blocks,
  BookOpenCheck,
  Braces,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  Cpu,
  Database,
  Terminal,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { ProblemDifficulty } from '@/lib/types/db';
import type { SolveStatus } from './types';

export const STAGE_VISUALS: Array<{
  Icon: LucideIcon;
  background: string;
  color: string;
  accent: string;
}> = [
  { Icon: Code2, background: '#EEF4FF', color: '#1B64DA', accent: '#BFD3F5' },
  { Icon: Braces, background: '#F0FDF4', color: '#15803D', accent: '#BBE5C8' },
  { Icon: Workflow, background: '#FFF7ED', color: '#C2410C', accent: '#FED7AA' },
  { Icon: Database, background: '#F5F3FF', color: '#7C3AED', accent: '#DDD6FE' },
  { Icon: Cpu, background: '#FFF1F2', color: '#BE123C', accent: '#FECDD3' },
  { Icon: Terminal, background: '#F0FDFA', color: '#0F766E', accent: '#99F6E4' },
  { Icon: Blocks, background: '#FDF4FF', color: '#A21CAF', accent: '#F5D0FE' },
  { Icon: BookOpenCheck, background: '#FFFBEB', color: '#B45309', accent: '#FDE68A' },
];

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

export const STATUS: Record<SolveStatus, {
  label: string;
  color: string;
  bg: string;
  Icon: LucideIcon;
}> = {
  unsolved: { label: '미풀이', color: '#8A8F98', bg: '#F6F7F9', Icon: Circle },
  tried: { label: '도전 중', color: '#D97706', bg: '#FEF3C7', Icon: Clock3 },
  solved: { label: '완료', color: '#15803D', bg: '#DCFCE7', Icon: CheckCircle2 },
};

export function stageVisual(orderNo: number) {
  return STAGE_VISUALS[(Math.max(orderNo, 1) - 1) % STAGE_VISUALS.length];
}
