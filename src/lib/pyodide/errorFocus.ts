/**
 * 오류가 난 그 줄과 그 글자를 짚어주기 위한 계산.
 *
 * 들여쓰기 오류는 한 줄만 봐서는 판단할 수 없다 — 위/아래 줄과 나란히 놓아야
 * 어디가 어긋났는지 보인다. 그래서 오류 줄 하나가 아니라 앞뒤를 포함한 좁은
 * 구간을 돌려준다.
 *
 * 파이썬이 알려주는 line/offset은 원본 소스 기준이라 탭이 섞이면 화면의 칸 수와
 * 어긋난다. 캐럿(^)이 정확한 글자 아래에 오도록 탭을 칸 수로 펼치고, 그 좌표계로
 * 캐럿 위치를 다시 계산한다.
 */

const TAB_WIDTH = 4;

export type ErrorFocusLine = {
  no: number;
  /** 탭을 공백으로 펼친 화면용 코드 */
  text: string;
  isError: boolean;
};

export type ErrorFocus = {
  lineNo: number;
  /** 오류 줄과 그 앞뒤 (비어 있는 줄은 넣지 않는다) */
  lines: ErrorFocusLine[];
  /** 오류 줄의 text 기준 0-based 캐럿 위치. 알 수 없으면 null */
  caretColumn: number | null;
};

/** 탭을 4칸 경계까지 채우고, 원본 인덱스 → 화면 인덱스 대응표를 함께 만든다. */
function expandTabs(raw: string): { text: string; expandedAt: number[] } {
  let text = '';
  const expandedAt: number[] = [];
  for (const character of raw) {
    expandedAt.push(text.length);
    if (character === '\t') text += ' '.repeat(TAB_WIDTH - (text.length % TAB_WIDTH));
    else text += character;
  }
  expandedAt.push(text.length);
  return { text, expandedAt };
}

export function buildErrorFocus(
  code: string,
  line: number | null | undefined,
  offset: number | null | undefined,
): ErrorFocus | null {
  if (!code || typeof line !== 'number' || !Number.isFinite(line) || line < 1) {
    return null;
  }

  const sourceLines = code.replace(/\r\n?/g, '\n').split('\n');
  const raw = sourceLines[line - 1];
  if (raw === undefined) return null;

  const errorLine = expandTabs(raw);

  let caretColumn: number | null = null;
  if (typeof offset === 'number' && Number.isFinite(offset) && offset >= 1) {
    // 파이썬 offset은 1-based이고, 줄 끝을 가리키는 경우도 있다.
    caretColumn = errorLine.expandedAt[Math.min(offset - 1, raw.length)] ?? errorLine.text.length;
  }

  const lines: ErrorFocusLine[] = [];
  const before = sourceLines[line - 2];
  if (before !== undefined && before.trim() !== '') {
    lines.push({ no: line - 1, text: expandTabs(before).text, isError: false });
  }
  lines.push({ no: line, text: errorLine.text, isError: true });
  const after = sourceLines[line];
  if (after !== undefined && after.trim() !== '') {
    lines.push({ no: line + 1, text: expandTabs(after).text, isError: false });
  }

  return { lineNo: line, lines, caretColumn };
}
