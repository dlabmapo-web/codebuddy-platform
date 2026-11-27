/**
 * What an AI text may not contain, whoever wrote the prompt.
 *
 * These are mechanical. They cannot catch an answer given in words; the second
 * review of a library and the evaluation do.
 */
export type TextProblem = "SIZE" | "LANGUAGE" | "CODE" | "SOLUTION" | "LINK";

const hangul = /[가-힣]/;
const squash = (text: string) => text.replace(/\s+/g, "");
/** Shorter lines are shared by every program, so matching one proves nothing. */
const SOLUTION_LINE_MIN = 8;

/** A line that reads as a Python statement rather than a sentence. */
const statement = /^\s*(?:print\(|(?:if|elif|for|while|def|return)\b.*[:)]\s*$|else:|import\s|[A-Za-z_]\w*\s*[-+*/]?=(?!=)\s*\S)/;

/** The lines that would give a solution away, without those already visible. */
export function solutionLines(solutions: readonly string[], visible: string): string[] {
  const shown = squash(visible);
  return [...new Set(solutions.flatMap((code) => code.split("\n")).map(squash))]
    .filter((line) => line.length >= SOLUTION_LINE_MIN && !shown.includes(line));
}

/** Checks one reply to a student. `visible` is what the student already sees: their code and the problem. */
export function checkReply(input: {
  text: string;
  locale: "ko" | "en";
  max: number;
  solutions: readonly string[];
  visible: string;
}): TextProblem | null {
  const { text, locale } = input;
  if (!text.trim() || text.length > input.max) return "SIZE";
  if (/https?:\/\/|www\./i.test(text)) return "LINK";
  if (locale === "ko" && !hangul.test(text)) return "LANGUAGE";
  if (locale === "en" && (text.match(/[가-힣]+/g) ?? []).some((word) => !input.visible.includes(word))) return "LANGUAGE";
  if (text.includes("```")) return "CODE";
  if (text.split("\n").filter((line) => statement.test(line)).length >= 2) return "CODE";
  const squashed = squash(text);
  if (solutionLines(input.solutions, input.visible).some((line) => squashed.includes(line))) return "SOLUTION";
  return null;
}

/**
 * Code inside prose. A library text never needs any, so any is refused.
 *
 * A call with arguments, a comparison, floor division or power, arithmetic or
 * a remainder between values, an index or slice, repeated text, membership in
 * quoted text, or an assignment.
 */
export const codeLike =
  /\w\([^)]*[\w"'][^)]*\)|==|!=|\/\/|\*\*|\w%\w|\w\[[^\]]*\]|["'][^"']*["']\s*\*|\bin\s+["']|\w\s=\s\w|\w\s[*/%]\s\w/;
const analysisCode = new RegExp(`${codeLike.source}|\\w\\.\\w+\\(`, "g");

/**
 * What a student reads is plain text, so an inline code mark around a name
 * (`n`) would show as two stray marks. Fences stay, and `checkReply` refuses them.
 */
export function plainText(text: string): string {
  return text.replaceAll("\u0000", "").replace(/(?<!`)`([^`\n]{1,40})`(?!`)/g, "$1").trim();
}

/**
 * The words a student reads in an analysis, with the answer's two marks kept
 * for the page to draw: `code` quotes their own program and **words** are what
 * to notice (help prompt v6). The page draws them from text, never as markup.
 */
export function answerText(text: string): string {
  return text.replaceAll("\u0000", "").trim();
}

/**
 * A highlight, as the page draws it: two asterisks on each side of up to 80
 * characters on one line, not touching a letter or another asterisk outside,
 * so `n**2` stays a power and is still read as code.
 */
const emphasis = /(?<![\w*])\*\*(?=\S)([^*\n]{1,80}?)(?<=\S)\*\*(?![\w*])/g;

/** The words without highlight marks, which every check reads: a mark is formatting, not code. */
export function unmarked(text: string): string {
  return text.replace(emphasis, "$1");
}

/**
 * Code in an analysis that the student does not already have.
 *
 * Pointing at the student's own code is how an analysis explains a mistake,
 * so a piece of code found in what the student sees is allowed, quoted or not.
 * Any other piece of code is a corrected line or expression the student
 * should write. A piece is read whole: from the start of its word to the end
 * of its word, not past a Korean particle. Backticks are formatting only.
 *
 * Two kinds of text look like code and are not: a value given to a name the
 * program reads from input, or does not use at all ("For N = 5, …"), and the
 * word "in" before a quoted value the student already wrote. A method call on
 * a value (`s.lower()`) is code even with nothing between its brackets.
 */
export function newCode(text: string, visible: string, code: string): boolean {
  const seen = squash(visible);
  const prose = text.replaceAll("`", "");
  const edge = /[\s가-힣]/;
  for (const match of prose.matchAll(analysisCode)) {
    let start = match.index;
    let end = start + match[0].length;
    while (start > 0 && !edge.test(prose[start - 1]!)) start--;
    while (end < prose.length && !edge.test(prose[end]!)) end++;
    const value = /([A-Za-z_]\w*)\s=\s-?\d+(?:\.\d+)?(?![\w.])/.exec(prose.slice(start));
    if (/\w\s=\s\w/.test(match[0]) && value && describesValue(value[1]!, code)) continue;
    const piece = squash(prose.slice(start, end).replace(/[.,;:!?'"]+$/u, ""));
    if (piece && !seen.includes(piece.replace(/^in(?=["'])/, ""))) return true;
  }
  return false;
}

/** `N = 5` describes a value when the program reads that name from input, or never uses it. */
function describesValue(name: string, code: string): boolean {
  const escaped = name.replace(/[$]/g, "\\$");
  if (!new RegExp(`\\b${escaped}\\b`).test(code)) return true;
  return new RegExp(`\\b${escaped}\\s*=\\s*[^\\n]*\\binput\\(`).test(code);
}

/**
 * A hidden test's input or expected output, word for word. The model never
 * read one, so this finds a guess that happens to match as well as a leak.
 * Short values ("15", "no") are too common in prose to tell anything.
 */
export function hiddenValueIn(text: string, hiddenValues: readonly string[]): boolean {
  return hiddenValues.some((value) => value.length >= 3 && text.includes(value));
}

/** The lines of hidden inputs and outputs that the student cannot already see. */
export function hiddenValues(hidden: readonly string[], visible: string): string[] {
  return [...new Set(hidden.flatMap((value) => value.split("\n")).map((line) => line.trim()))]
    .filter((line) => line.length >= 3 && !visible.includes(line));
}

/** Checks one library text, in one language. */
export function checkLibraryText(input: {
  text: string;
  locale: "ko" | "en";
  max: number;
  solutions: readonly string[];
}): TextProblem | null {
  const problem = checkReply({ ...input, visible: "" });
  if (problem) return problem;
  return codeLike.test(input.text) ? "CODE" : null;
}
