/** Only unwrap plain paragraphs/line breaks. Other HTML stays in the rich editor. */
export function simpleChoiceText(html: string): string | null {
  if (/<(?!\/?p\s*>|br\s*\/?>)[^>]+>/i.test(html)) return null;
  if (/&(?!(?:amp|lt|gt|quot|nbsp|#39|#160);)[^;\s]+;/i.test(html)) return null;
  return html.replace(/<\/p>\s*<p>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<\/?p\s*>/gi, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39|#160);/gi, (_, entity: string) => ({ amp: "&", lt: "<", gt: ">", quot: '\"', nbsp: " ", '#39': "'", '#160': " " })[entity.toLowerCase()]!);
}
export function choiceTextHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
export function choiceMaterialTitle(title: string, question: string): string {
  return title.trim() || question.trim().slice(0, 128);
}
