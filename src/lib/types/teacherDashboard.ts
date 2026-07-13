export type DashboardRange = '7d' | '30d' | 'all';

export interface TeacherDashboardSummary {
  totalStudents: number;
  totalSubmissions: number;
  totalWrongAnswers: number;
  solvedProblemPairs: number;
  solveRate: number;
}

export interface SubmissionTrendPoint {
  period: string;
  label: string;
  pass: number;
  fail: number;
}

export interface ProblemPerformancePoint {
  problemId: string;
  label: string;
  title: string;
  attemptedStudents: number;
  solvedStudents: number;
  solveRate: number;
  submissionCount: number;
  wrongAnswerCount: number;
}

export interface StudentActivityPoint {
  studentId: string;
  name: string;
  username: string;
  submissionCount: number;
  solvedCount: number;
  wrongAnswerCount: number;
  solveRate: number;
}

export interface AiErrorCategoryPoint {
  category: string;
  count: number;
}

export interface StudentNeedingHelp {
  studentId: string;
  name: string;
  username: string;
  submissionCount: number;
  wrongAnswerCount: number;
  solvedCount: number;
  solveRate: number;
}

export interface TeacherDashboardData {
  range: DashboardRange;
  summary: TeacherDashboardSummary;
  submissionTrend: SubmissionTrendPoint[];
  problemPerformance: ProblemPerformancePoint[];
  studentActivity: StudentActivityPoint[];
  aiErrorCategories: AiErrorCategoryPoint[];
  studentsNeedingHelp: StudentNeedingHelp[];
}
