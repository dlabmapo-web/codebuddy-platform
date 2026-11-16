import { describe, expect, it } from 'vitest';
import { courseLanguageSchema, exerciseLanguagesFor, defaultExerciseLanguage } from './language.js';
describe('course languages', () => {
  it('supports web courses without an executable language', () => { expect(courseLanguageSchema.parse('WEB')).toBe('WEB'); expect(exerciseLanguagesFor('WEB')).toEqual([]); });
  it('preserves programming families and their defaults', () => { expect(exerciseLanguagesFor('PYTHON')).toEqual(['PYTHON']); expect(exerciseLanguagesFor('C_CPP')).toEqual(['C','CPP']); expect(defaultExerciseLanguage('PYTHON')).toBe('PYTHON'); expect(defaultExerciseLanguage('C_CPP')).toBe('C'); });
});
