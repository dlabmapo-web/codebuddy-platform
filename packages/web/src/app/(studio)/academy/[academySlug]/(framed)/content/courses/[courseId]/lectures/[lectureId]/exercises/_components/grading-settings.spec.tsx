// @vitest-environment happy-dom
import * as React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { legacyGradingProfile, type ExerciseGradingProfile } from '@cove/shared';
import { GradingSettings } from './grading-settings';

vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// These controls do not participate in changing the prompt policy or score mode.
vi.mock('@/components/studio/choice-field', () => ({ ChoiceField: () => null }));
vi.mock('@/components/studio/number-field', () => ({ NumberField: () => null }));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); });

async function render(editable: boolean) {
  let current: ExerciseGradingProfile = legacyGradingProfile;
  function Form() {
    const [grading, setGrading] = React.useState(legacyGradingProfile);
    current = grading;
    return <GradingSettings editable={editable} grading={grading} testCases={[]} issues={[]} onChange={setGrading} />;
  }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Form />));
  return () => current;
}

describe('input prompt authoring', () => {
  it('retains the opt-in when switching Standard and Weighted', async () => {
    const current = await render(true);
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    await act(async () => checkbox.click());
    expect(current().inputPromptPolicy).toBe('IGNORE');
    const modes = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    await act(async () => modes[1]!.click());
    expect(current()).toMatchObject({ mode: 'ELICE_STDIO', inputPromptPolicy: 'IGNORE' });
    await act(async () => modes[0]!.click());
    expect(current()).toMatchObject({ mode: 'LEGACY_STDIO', inputPromptPolicy: 'IGNORE' });
  });
  it('disables changes in a read-only editor', async () => {
    await render(false);
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
  });
});
