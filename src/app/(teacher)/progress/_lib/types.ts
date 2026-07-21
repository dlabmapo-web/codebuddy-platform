import type { ProblemDifficulty } from '@/lib/types/db';

export type ProgressTab = 'student' | 'problem';
export type Student = { id: string; name: string; username: string };

export type Submission = {
  id: string;
  problem_id: string;
  code: string;
  status: 'pass' | 'fail' | 'partial';
  passed_count: number;
  total_count: number;
  elapsed_sec: number | null;
  submitted_at: string;
  problems: { problem_no: number; title: string; difficulty: ProblemDifficulty } | null;
};

export type ProblemStat = {
  id: string;
  problem_no: number;
  order_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  student_count: number;
  submission_count: number;
  pass_count: number;
  pass_rate: number;
  avg_elapsed_sec: number | null;
  chapter_id: string;
  chapter_title: string;
  chapter_order_no: number;
  stage_id: string;
  stage_title: string;
  stage_order_no: number;
  subject_id: string;
  subject_title: string;
  subject_order_no: number;
};

export type ChapterNode = { id: string; title: string; order_no: number; problems: ProblemStat[] };
export type StageNode = { id: string; title: string; order_no: number; chapters: ChapterNode[] };
export type SubjectNode = { id: string; title: string; order_no: number; stages: StageNode[] };
export type FilterOption = { id: string; title: string; order_no: number };

export type ChapterGroup = {
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  stageTitle: string;
  subjectTitle: string;
  problems: ProblemStat[];
};

export type CodeModal = { submission: Submission; studentName: string };
