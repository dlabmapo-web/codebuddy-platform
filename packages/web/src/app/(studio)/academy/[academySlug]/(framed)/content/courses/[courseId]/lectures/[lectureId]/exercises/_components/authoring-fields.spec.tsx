import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({ t: (key: string) => key }),
}));

const { Field } = await import('./authoring-fields');

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
