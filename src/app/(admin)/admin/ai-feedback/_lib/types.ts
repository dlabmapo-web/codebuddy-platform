import type { AiFeedbackPatternType } from '@/lib/types/db';

export type PatternForm = {
  pattern_type: AiFeedbackPatternType;
  error_category: string;
  criteria: string;
  example_code: string;
  tutor_feedback: string;
  is_active: boolean;
};

export type PatternModalState = {
  mode: 'create' | 'edit';
  id?: string;
  data: PatternForm;
};

export type PatternTypeFilter = 'all' | AiFeedbackPatternType;
export type ToastMessage = { message: string; type: 'ok' | 'err' };
