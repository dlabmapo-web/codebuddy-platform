import type { ProblemDifficulty } from '@/lib/types/db';

export type StudentSession = {
  id: string;
  student_id: string;
  problem_id: string | null;
  status: 'active' | 'ended';
  started_at: string;
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
  users: { id: string; name: string; username: string } | null;
};

export type StudentResponseRow = {
  id: string;
  username: string;
  name: string;
  is_active: boolean;
  last_active_at: string | null;
};

export type StudentRow = StudentResponseRow & {
  activeSession: StudentSession | null;
};
