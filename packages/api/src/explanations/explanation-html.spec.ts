import { describe, expect, it } from "vitest";
import { hasExplanationContent, saveExplanationSchema } from "@cove/shared";
import { sanitizeExplanation } from "./explanation-html.js";
const id = "11111111-1111-4111-8111-111111111111";
describe("explanation document validation", () => {
  it("preserves teaching content, table structure, formatting and private image sizing", () => {
    const body = sanitizeExplanation(`<h2>Loops</h2><p style="text-align:center;color:#1B64DA">Repeat <strong>three times</strong></p><table><tbody><tr><td colspan="2">Example</td></tr></tbody></table><pre><code>for i in range(3):</code></pre><img src="cove-asset:${id}" alt="Animated diagram" width="400">`);
    expect(body).toContain('<table>'); expect(body).toContain('colspan="2"'); expect(body).toContain('width="400"'); expect(body).toContain('color:#1B64DA');
  });
  it.each(['', '<p><br></p>', '<p>&nbsp; &#160;</p>', '<script>alert(1)</script>', '<img src="https://foreign.test/x.png">'])("refuses an empty sanitized document: %s", body => {
    expect(() => sanitizeExplanation(body)).toThrow();
  });
  it("accepts a private image without text and strips active markup/styles/links", () => {
    const body = sanitizeExplanation(`<img src="cove-asset:${id}" alt="Diagram" onerror="steal()"><iframe src="x"></iframe><p style="position:fixed;background-image:url(https://evil.test)">Safe</p><a href="javascript:steal()">Link</a>`);
    expect(body).not.toMatch(/onerror|iframe|javascript|position:|background-image/); expect(hasExplanationContent(body)).toBe(true);
  });
  it("rejects exercise inputs and edits without the saved revision", () => {
    const target = { academyId: id, courseId: id, lectureId: id, title: 'Loops', body: '<p>Repeat</p>' };
    expect(saveExplanationSchema.safeParse(target).success).toBe(true);
    expect(saveExplanationSchema.safeParse({ ...target, testCases: [] }).success).toBe(false);
    expect(saveExplanationSchema.safeParse({ ...target, materialId: id }).success).toBe(false);
  });
});

it('preserves code languages, indentation and literal markup without active elements', () => {
  const code = 'for i in range(3):\n    print(&quot;&lt;script&gt;&quot;)\n';
  const body = sanitizeExplanation(`<pre data-language="python" onclick="steal()"><code class="language-python">${code}</code></pre>`);
  expect(body).toContain('data-language="python"'); expect(body).toContain('class="language-python"');
  expect(body).toContain('    print('); expect(body).toContain('&lt;script&gt;'); expect(body).not.toMatch(/onclick|<script>/);
  expect(sanitizeExplanation('<pre data-language="untrusted"><code class="evil">x</code></pre>')).toContain('data-language="plaintext"');
});

it('keeps legacy code-only language metadata readable', () => {
  const body = sanitizeExplanation('<pre><code class="language-cpp">int x = 10;</code></pre>');
  expect(body).toBe('<pre><code class="language-cpp">int x = 10;</code></pre>');
});
