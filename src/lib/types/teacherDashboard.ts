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
  pathLabel: string;
  subjectId: string | null;
  subjectTitle: string | null;
  stageId: string | null;
  stageTitle: string | null;
  chapterId: string | null;
  chapterTitle: string | null;
  chapterOrderNo: number | null;
  attemptedStudents: number;
  solvedStudents: number;
  solveRate: number;
  submissionCount: number;
  wrongAnswerCount: number;
}

export interface ChapterPerformancePoint {
  chapterId: string;
  label: string;
  subjectTitle: string;
  stageTitle: string;
  chapterTitle: string;
  attemptedStudents: number;
  solvedStudents: number;
  solveRate: number;
  submissionCount: number;
  wrongAnswerCount: number;
  problemCount: number;
}

export interface CurriculumFilterOption {
  id: string;
  title: string;
  order_no: number;
  subject_id?: string;
  stage_id?: string;
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
  filters: {
    subjectId: string | null;
    stageId: string | null;
    chapterId: string | null;
  };
  curriculum: {
    subjects: CurriculumFilterOption[];
    stages: CurriculumFilterOption[];
    chapters: CurriculumFilterOption[];
  };
  summary: TeacherDashboardSummary;
  submissionTrend: SubmissionTrendPoint[];
  problemPerformance: ProblemPerformancePoint[];
  chapterPerformance: ChapterPerformancePoint[];
  studentActivity: StudentActivityPoint[];
  aiErrorCategories: AiErrorCategoryPoint[];
  studentsNeedingHelp: StudentNeedingHelp[];
}
