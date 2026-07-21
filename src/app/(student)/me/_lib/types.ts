import type { ProblemDifficulty } from '@/lib/types/db';

export type SubmissionStatus = 'pass' | 'fail' | 'partial';
export type SubmissionFilter = 'all' | 'pass' | 'fail';

export type Submission = {
  id: string;
  problem_id: string;
  status: SubmissionStatus;
  score: number;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  elapsed_sec: number | null;
  submitted_at: string;
  problems: ProblemRef | ProblemRef[] | null;
};

export type SubjectRef = {
  id: string;
  title: string;
  order_no: number;
};

export type StageRef = {
  id: string;
  title: string;
  order_no: number;
  subject_id: string;
  subjects: SubjectRef | SubjectRef[] | null;
};

export type ChapterRef = {
  id: string;
  title: string;
  order_no: number;
  stage_id: string;
  stages: StageRef | StageRef[] | null;
};

export type ProblemRef = {
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  order_no: number;
  chapter_id: string | null;
  chapters: ChapterRef | ChapterRef[] | null;
};

export type CurriculumOption = {
  id: string;
  title: string;
  order_no: number;
};

export type StageOption = CurriculumOption & { subject_id: string };
export type ChapterOption = CurriculumOption & { stage_id: string };

export type CurriculumOptions = {
  subjects: CurriculumOption[];
  stages: StageOption[];
  chapters: ChapterOption[];
};
