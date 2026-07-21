import type { DbProblem, ProblemDifficulty } from '@/lib/types/db';

export type ProblemRow = Pick<
  DbProblem,
  'id' | 'problem_no' | 'chapter_id' | 'order_no' | 'title' | 'difficulty' | 'is_published' | 'use_ai_feedback' | 'created_at'
>;

export type HierarchyRow = {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  is_published: boolean;
  child_count?: number;
};

export type TestCaseForm = {
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
};

export type HintForm = {
  hint_text: string;
  trigger_pattern: string;
  order_no: number;
};

export type ProblemForm = {
  chapter_id: string;
  title: string;
  difficulty: ProblemDifficulty;
  description: string;
  input_format: string;
  output_format: string;
  constraint_text: string;
  starter_code: string;
  is_published: boolean;
  use_ai_feedback: boolean;
  test_cases: TestCaseForm[];
  hints: HintForm[];
};

export type NavLevel = 'subjects' | 'stages' | 'chapters' | 'problems';
export type HierarchyKind = 'subject' | 'stage' | 'chapter';
export type PanelMode = 'closed' | 'create' | 'edit';
export type EditorSection = 'basic' | 'starter' | 'testcases' | 'hints';
export type MessageType = 'ok' | 'err';
export type ShowMessage = (message: string, type: MessageType) => void;

export type HierarchyModalState = {
  kind: HierarchyKind;
  mode: 'create' | 'edit';
  id?: string;
  title: string;
  description: string;
  is_published: boolean;
  order_no: number;
};

export type ImportTestCase = {
  order_no: number;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
};

export type ImportHint = {
  order_no: number;
  hint_text: string;
  trigger_pattern: string;
};

export type ImportRow = {
  key: string;
  subject: { order_no: number; title: string; description: string };
  stage: { order_no: number; title: string; description: string };
  chapter: { order_no: number; title: string; description: string };
  problem: {
    order_no: number;
    title: string;
    difficulty: ProblemDifficulty;
    description: string;
    input_format: string;
    output_format: string;
    constraint_text: string;
    starter_code: string;
    is_published: boolean;
    use_ai_feedback: boolean;
  };
  test_cases: ImportTestCase[];
  hints: ImportHint[];
};

export type RawImportRow = Record<string, unknown>;
