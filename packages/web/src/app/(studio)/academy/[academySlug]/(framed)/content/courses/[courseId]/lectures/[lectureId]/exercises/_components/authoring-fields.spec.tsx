import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({ t: (key: string) => key }),
}));

const { Field, TextAreaField, lineCount, testFileText } = await import('./authoring-fields');

describe('Field', () => {
  it('wraps a form control in a label', () => {
    const html = renderToStaticMarkup(
      <Field label="Title">
        <input readOnly value="" />
      </Field>,
    );

    expect(html).toContain('<label');
  });

  /*
   * A rich text editor is a contenteditable region, not a labelable control.
   * Inside a `<label>` the browser redirects the click to the control the
   * label names, so the editor never takes focus and typing does nothing.
   */
  it('wraps a non-control in a labelled group, never a label', () => {
    const html = renderToStaticMarkup(
      <Field as="group" label="Problem description" required>
        <div contentEditable suppressContentEditableWarning />
      </Field>,
    );

    expect(html).not.toContain('<label');
    expect(html).toContain('role="group"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
  });
});

describe('TextAreaField for test data', () => {
  const file = { load: 'Load', size: (characters: number, lines: number) => `${characters} chars, ${lines} lines` };

  // A large hidden test: 100,000 numbers, near 600 KB. The field once stopped at 100,000 characters.
  it('takes a test of any length, whole, and says how big it is', () => {
    const value = `100000\n${Array.from({ length: 100_000 }, (_, index) => String(index % 100_000 + 1)).join('\n')}\n`;
    const html = renderToStaticMarkup(<TextAreaField dark={false} disabled={false} file={file} label="Input" onChange={() => undefined} value={value} />);
    expect(html).not.toContain('maxlength');
    expect(value.length).toBeGreaterThan(500_000);
    expect(html).toContain(`${value.length} chars, 100001 lines`);
    expect(html).toContain('type="file"');
  });

  it('loads a test file as the grader reads it', () => {
    expect(testFileText('\uFEFF3\r\n1 2 3\r\n')).toBe('3\n1 2 3\n');
    expect(testFileText('a\rb')).toBe('a\nb');
  });

  it('counts lines as a person does', () => {
    expect([lineCount(''), lineCount('5'), lineCount('5\n'), lineCount('5\n1 2')]).toEqual([0, 1, 1, 2]);
  });
});
