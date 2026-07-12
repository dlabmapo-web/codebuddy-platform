export type UserRole = 'student' | 'teacher' | 'admin';

export interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbUserSession {
  id: string;
  user_id: string;
  refresh_token_hash: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean;
  last_seen_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface DbTeacherStudent {
  id: string;
  teacher_id: string;
  student_id: string;
  created_at: string;
}

export type ProblemDifficulty = 'easy' | 'medium' | 'hard';

export interface DbCategory {
  id: string;
  title: string;
  description: string | null;
  order_no: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbProblem {
  id: string;
  problem_no: number;
  category_id: string | null;
  order_no: number;
  title: string;
  description: string;
  difficulty: ProblemDifficulty;
  input_format: string | null;
  output_format: string | null;
  constraint_text: string | null;
  starter_code: string | null;
  time_limit_ms: number;
  memory_limit_mb: number;
  is_published: boolean;
  use_ai_feedback: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbTestCase {
  id: string;
  problem_id: string;
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
  created_at: string;
}

export interface DbProblemHint {
  id: string;
  problem_id: string;
  trigger_pattern: string | null;
  hint_text: string;
  order_no: number;
  created_at: string;
}

export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed';

export interface DbAssignment {
  id: string;
  teacher_id: string;
  student_id: string;
  problem_id: string;
  status: AssignmentStatus;
  assigned_at: string;
  due_at: string | null;
  created_at: string;
}

export type SubmissionStatus = 'pass' | 'fail' | 'partial';

export interface DbSubmission {
  id: string;
  problem_id: string;
  user_id: string;
  language: string;
  code: string;
  status: SubmissionStatus;
  score: number;
  passed_count: number;
  total_count: number;
  runtime_ms: number | null;
  elapsed_sec: number | null;
  submitted_at: string;
}

export type CollaborationSessionStatus = 'active' | 'ended';

export interface DbCollaborationSession {
  id: string;
  problem_id: string | null;
  student_id: string;
  teacher_id: string | null;
  status: CollaborationSessionStatus;
  final_code: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface DbFeedback {
  id: string;
  session_id: string | null;
  teacher_id: string;
  student_id: string;
  problem_id: string | null;
  content: string;
  created_at: string;
}

export interface DbAiHintLog {
  id: string;
  user_id: string;
  problem_id: string | null;
  submission_id: string | null;
  matched_hint_id: string | null;
  student_code: string | null;
  error_message: string | null;
  hint_response: string | null;
  model: string;
  created_at: string;
}

export type AiFeedbackPatternType = string;

export interface DbAiFeedbackPattern {
  id: string;
  pattern_type: AiFeedbackPatternType;
  error_category: string;
  criteria: string;
  example_code: string | null;
  tutor_feedback: string;
  order_no: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbAiFeedback {
  id: string;
  submission_id: string;
  problem_id: string | null;
  student_id: string;
  matched_pattern_id: string | null;
  content: string;
  model: string;
  created_at: string;
}

export interface ViewStudentProblemStatus {
  user_id: string;
  student_name: string;
  problem_id: string;
  problem_title: string;
  best_score: number;
  attempt_count: number;
  is_solved: boolean;
  best_elapsed_sec: number | null;
  last_submitted_at: string;
}

export interface ViewProblemStats {
  problem_id: string;
  problem_no: number;
  title: string;
  difficulty: ProblemDifficulty;
  student_count: number;
  avg_score: number;
  pass_count: number;
  submission_count: number;
}
