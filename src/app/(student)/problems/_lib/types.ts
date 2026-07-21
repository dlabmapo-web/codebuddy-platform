import type { ProblemDifficulty } from '@/lib/types/db';

export type SolveStatus = 'unsolved' | 'tried' | 'solved';

export type StageItem = {
  id: string;
  subject_id: string;
  title: string;
  description: string | null;
  order_no: number;
  chapter_count: number;
  problem_count: number;
  solved_count: number;
};

export type SubjectItem = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  stages: StageItem[];
};

export type StudentProblem = {
  id: string;
  problem_no: number;
  chapter_id: string;
  order_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  solve_status: SolveStatus;
};

export type ChapterItem = {
  id: string;
  stage_id: string;
  title: string;
  description: string | null;
  order_no: number;
  problems: StudentProblem[];
};

export type CurriculumMeta = {
  id: string;
  title: string;
  description?: string | null;
  order_no: number;
  subject_id?: string;
};

export type DraftSession = {
  id: string;
  problem_id: string;
  final_code: string;
  problems: {
    problem_no: number;
    title: string;
    difficulty: ProblemDifficulty;
  } | null;
};
