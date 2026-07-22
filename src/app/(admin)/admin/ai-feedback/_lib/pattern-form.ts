import type { DbAiFeedbackPattern } from '@/lib/types/db';
import type { PatternForm } from './types';

export function createEmptyPatternForm(): PatternForm {
  return {
    pattern_type: '',
    error_category: '',
    criteria: '',
    example_code: '',
    tutor_feedback: '',
    is_active: true,
  };
}

export function patternToForm(pattern: DbAiFeedbackPattern): PatternForm {
  return {
    pattern_type: pattern.pattern_type,
    error_category: pattern.error_category,
    criteria: pattern.criteria,
    example_code: pattern.example_code ?? '',
    tutor_feedback: pattern.tutor_feedback,
    is_active: pattern.is_active,
  };
}

export function canSavePattern(form: PatternForm) {
  return Boolean(
    form.pattern_type.trim()
    && form.error_category.trim()
    && form.criteria.trim()
    && form.tutor_feedback.trim(),
  );
}
