import * as React from 'react';

/**
 * The model's words with its two marks drawn (help prompt v6): **words** to
 * notice, highlighted in the amber that means "look here" across the
 * workspace, and `code` quoted from the student's own program. Built from
 * text into elements, so nothing an answer says can become markup; a mark
 * that is not closed stays as written.
 */
export function AiText({ text, tone = 'dark' }: { text: string; /** The workspace's dark output, or a light page such as a teacher's review. */ tone?: 'dark' | 'light' }) {
  return <>{withMarks(text, tones[tone])}</>;
}

const tones = {
  dark: {
    mark: 'rounded-[4px] bg-[#facc15]/[0.16] px-1 font-semibold text-[#fde68a] [box-decoration-break:clone]',
    code: 'rounded bg-black/35 px-1.5 py-px font-mono text-[12px] text-[#bae6fd]',
  },
  light: {
    mark: 'rounded-[4px] bg-[#fde68a]/70 px-1 font-semibold text-inherit [box-decoration-break:clone]',
    code: 'rounded bg-black/[0.06] px-1.5 py-px font-mono text-[12.5px]',
  },
};
type Tone = (typeof tones)['dark'];

function withMarks(text: string, tone: Tone): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /`([^`\n]{1,200})`|\*\*([^*\n]{1,80}?)\*\*/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index;
    const end = start + match[0].length;
    // Not a highlight (`n**2`): its closing marks may still open a real one.
    if (match[1] === undefined && !isHighlight(text, start, end, match[2]!)) { pattern.lastIndex = start + 2; continue; }
    if (start > last) parts.push(text.slice(last, start));
    parts.push(match[1] !== undefined
      ? <code className={tone.code} key={start}>{match[1]}</code>
      : <mark className={tone.mark} key={start}>{codeOnly(match[2]!, start, tone)}</mark>);
    last = end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** As the server reads a mark: not touching a letter or an asterisk outside, nor a space inside, so `n**2**` is not one. */
function isHighlight(text: string, start: number, end: number, inner: string): boolean {
  const outside = /[A-Za-z0-9_*]/;
  return !outside.test(text[start - 1] ?? '') && !outside.test(text[end] ?? '') && inner.trim() === inner;
}

/** Code quoted inside a highlight. */
function codeOnly(text: string, offset: number, tone: Tone): React.ReactNode[] {
  return text.split(/(`[^`\n]{1,200}`)/).map((piece, index) => /^`[^`]+`$/.test(piece)
    ? <code className={tone.code} key={`${offset}:${index}`}>{piece.slice(1, -1)}</code>
    : piece);
}
