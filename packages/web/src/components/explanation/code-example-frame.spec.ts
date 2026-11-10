// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { enhanceCodeExamples } from './code-example-frame';
const labels = {
  copy: 'Copy code',
  copied: 'Copied',
  copyFailed: 'Copy failed',
  plainText: 'Plain text',
};
afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});
it('copies exact source without the label or line numbers and enhances only once', async () => {
  document.body.innerHTML =
    '<pre data-language="python"><code>for i in range(3):\n    print(i)\n</code></pre>';
  const write = vi.fn().mockResolvedValue(undefined);
  const dispose = enhanceCodeExamples(document, labels, write);
  enhanceCodeExamples(document, labels, write);
  expect(document.querySelectorAll('section')).toHaveLength(1);
  expect(document.querySelector('.cove-code-header')?.textContent).toContain(
    'Python 3',
  );
  expect(document.querySelector('.cove-code-numbers')?.textContent).toBe(
    '1\n2\n3',
  );
  document.querySelector('button')!.click();
  await vi.waitFor(() =>
    expect(document.querySelector('button')?.textContent).toBe('Copied'),
  );
  expect(write).toHaveBeenCalledExactlyOnceWith(
    'for i in range(3):\n    print(i)\n',
  );
  dispose();
  expect(document.querySelector('button')).toBeNull();
  const reattach = enhanceCodeExamples(document, labels, write);
  document.querySelector('button')!.click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  reattach();
});
it('handles legacy code, unknown languages, literal markup, and clipboard failure', async () => {
  document.body.innerHTML =
    '<pre><code class="language-cpp">&lt;script&gt;hello&lt;/script&gt;</code></pre><pre data-language="unknown">x</pre>';
  const dispose = enhanceCodeExamples(
    document,
    labels,
    vi.fn().mockRejectedValue(new Error('denied')),
  );
  expect(document.querySelector('script')).toBeNull();
  expect(document.querySelector('code')?.textContent).toBe(
    '<script>hello</script>',
  );
  expect(
    document.querySelectorAll('.cove-code-header')[0].textContent,
  ).toContain('C++');
  expect(
    document.querySelectorAll('.cove-code-header')[1].textContent,
  ).toContain('Plain text');
  document.querySelector('button')!.click();
  await vi.waitFor(() =>
    expect(document.querySelector('button')?.textContent).toBe('Copy failed'),
  );
  dispose();
});
