import type { DbProblem, DbProblemHint, DbTestCase } from '@/lib/types/db';
import type { ProblemForm } from './types';

export function createEmptyProblemForm(chapterId = ''): ProblemForm {
  return {
    chapter_id: chapterId,
    title: '',
    difficulty: 'easy',
    description: '',
    input_format: '',
    output_format: '',
    constraint_text: '',
    starter_code: '',
    is_published: false,
    use_ai_feedback: false,
    test_cases: [{ input: '', expected_output: '', is_sample: true, is_hidden: false, order_no: 1 }],
    hints: [],
  };
}

export function normalizeProblemForm(
  problem: DbProblem,
  testCases: DbTestCase[],
  hints: DbProblemHint[],
  fallbackChapterId: string,
): ProblemForm {
  return {
    chapter_id: problem.chapter_id ?? fallbackChapterId,
    title: problem.title,
    difficulty: problem.difficulty,
    description: problem.description,
    input_format: problem.input_format ?? '',
    output_format: problem.output_format ?? '',
    constraint_text: problem.constraint_text ?? '',
    starter_code: problem.starter_code ?? '',
    is_published: problem.is_published,
    use_ai_feedback: problem.use_ai_feedback,
    test_cases: testCases.length > 0
      ? testCases.map((testCase) => ({
          input: testCase.input,
          expected_output: testCase.expected_output,
          is_sample: testCase.is_sample,
          is_hidden: testCase.is_hidden,
          order_no: testCase.order_no,
        }))
      : createEmptyProblemForm().test_cases,
    hints: hints.map((hint) => ({
      hint_text: hint.hint_text,
      trigger_pattern: hint.trigger_pattern ?? '',
      order_no: hint.order_no,
    })),
  };
}

export function validateProblemForm(form: ProblemForm) {
  if (!form.chapter_id) return '챕터를 선택해주세요.';
  if (!form.title.trim()) return '문제 제목을 입력해주세요.';
  if (!form.description.trim()) return '문제 내용을 입력해주세요.';
  if (!form.test_cases.some((testCase) => testCase.expected_output.trim())) {
    return '정답을 1개 이상 입력해주세요.';
  }
  return null;
}

export function buildProblemPayload(form: ProblemForm) {
  return {
    chapter_id: form.chapter_id,
    title: form.title,
    difficulty: form.difficulty,
    description: form.description,
    input_format: form.input_format,
    output_format: form.output_format,
    constraint_text: form.constraint_text,
    starter_code: form.starter_code,
    time_limit_ms: 3000,
    memory_limit_mb: 256,
    is_published: form.is_published,
    use_ai_feedback: form.use_ai_feedback,
    test_cases: form.test_cases.filter((testCase) => testCase.expected_output.trim()),
    hints: form.hints.filter((hint) => hint.hint_text.trim()),
  };
}
