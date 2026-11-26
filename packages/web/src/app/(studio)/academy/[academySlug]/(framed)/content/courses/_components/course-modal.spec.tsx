// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { CoursesManagerState } from '../_hooks/use-courses-manager';
import { CourseModal } from './course-modal';

vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/i18n/client/use-error-text', () => ({ useErrorText: () => () => '' }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

let host: HTMLElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

const manager = (over: Partial<CoursesManagerState> = {}) => ({
  formOpen: true, editingId: null, title: 'Python 1', description: '', language: 'PYTHON', languageLocked: false,
  submitPending: false, submitError: null, aiTeacherAvailable: true, aiTeacher: false,
  setTitle: vi.fn(), setDescription: vi.fn(), setLanguage: vi.fn(), setAiTeacher: vi.fn(), closeForm: vi.fn(), submit: vi.fn(),
  ...over,
}) as unknown as CoursesManagerState;
const radios = () => [...document.querySelectorAll<HTMLInputElement>('input[name="ai-teacher"]')];

it('offers the AI teacher on a Python course in an academy that has it, not included by default (the campus courses design, §4)', async () => {
  const state = manager();
  await act(() => root.render(<CourseModal manager={state} />));
  expect(document.body.textContent).toContain('create.ai_label');
  expect(radios().map((input) => input.checked)).toEqual([true, false]);
  await act(async () => { radios()[1]!.click(); });
  expect(state.setAiTeacher).toHaveBeenCalledWith(true);
});

it('does not offer it where it cannot be on', async () => {
  await act(() => root.render(<CourseModal manager={manager({ aiTeacherAvailable: false })} />));
  expect(radios()).toEqual([]);
  expect(document.body.textContent).not.toContain('create.ai_label');
});
