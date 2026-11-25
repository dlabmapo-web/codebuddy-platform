import { describe, expect, it } from "vitest";

import { statementText } from "./statement-text.js";

describe("statementText", () => {
  it.each([
    ["plain words", "plain words"],
    ["<p>Read <strong>n</strong>.</p><p>Print it.</p>", "Read n.\n\nPrint it."],
    ["a<br>b<br/>c", "a\nb\nc"],
    ["<ul><li>one</li><li>two</li></ul>", "- one\n\n- two"],
    ["<table><tr><td>1</td><td>2</td></tr></table>", "1 | 2"],
    ["<pre>if a &lt; b:\n    print(a)</pre>", "if a < b:\n    print(a)"],
    ["a &amp; b &#39;c&#x27; &ge; d &unknown;", "a & b 'c' ≥ d &unknown;"],
    ['see <img src="x.png" alt="a tree"> here', "see  [image: a tree]  here"],
    ["see <img src='x.png'>", "see  [image]"],
    ["<style>p{}</style><script>alert(1)</script>ok<!-- no -->", "ok"],
    ["3 < 5 and 7 > 2", "3 < 5 and 7 > 2"],
    ["", ""],
  ])("%j", (html, text) => {
    expect(statementText(html)).toBe(text);
  });

  it("keeps an invalid character reference as written", () => {
    expect(statementText("&#xD800; &#0; &#99999999;")).toBe("&#xD800; &#0; &#99999999;");
  });
});
