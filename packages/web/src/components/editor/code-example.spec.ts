// @vitest-environment happy-dom
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { CodeExample } from './code-example';

it('round-trips multiple code examples as ordinary escaped pre/code HTML', () => {
  const body =
    '<p>Check the condition.</p><pre data-language="python"><code class="language-python">for i in range(3):\n    print(i)</code></pre><p>Then compare:</p><pre data-language="cpp"><code class="language-cpp">if (x &lt; 10) {\n\tcout &lt;&lt; x;\n}</code></pre>';
  const editor = new Editor({
    extensions: [StarterKit.configure({ codeBlock: false }), CodeExample],
    content: body,
  });
  expect(editor.getHTML()).toBe(body);
  expect(editor.getHTML()).not.toMatch(/Copy|select|button|code-example/);
  expect(
    editor
      .getJSON()
      .content?.filter((node) => node.type === 'codeBlock')
      .map((node) => node.attrs?.language),
  ).toEqual(['python', 'cpp']);
  editor.destroy();
});
