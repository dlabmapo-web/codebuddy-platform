/**
 * An authored statement as plain text.
 *
 * Descriptions are HTML written in an editor. A reader that takes text — the
 * AI assistant — gets the words, list markers, table cells and code line by
 * line, and the place of each picture. This is a reduction for reading, not a
 * sanitizer: its output is never rendered as HTML.
 */
export function statementText(html: string): string {
  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, "")
    // A picture says where it is, with its description when it has one.
    .replace(/<img\b[^>]*>/gi, (tag) => {
      const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
      const label = (alt?.[1] ?? alt?.[2] ?? "").trim();
      return label ? ` [image: ${label}] ` : " [image] ";
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/(?:td|th)\s*>/gi, " | ")
    .replace(/<\/(?:p|div|li|ul|ol|tr|table|pre|blockquote|section|h[1-6])\s*>/gi, "\n")
    .replace(/<(?:p|div|tr|table|pre|blockquote|section|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+$/u, "").replace(/ \|$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const named: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", ndash: "–", mdash: "—",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", times: "×", divide: "÷", le: "≤", ge: "≥", ne: "≠", middot: "·",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] !== "#") return named[body.toLowerCase()] ?? entity;
    const code = body[1]?.toLowerCase() === "x" ? parseInt(body.slice(2), 16) : Number(body.slice(1));
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : entity;
  });
}
