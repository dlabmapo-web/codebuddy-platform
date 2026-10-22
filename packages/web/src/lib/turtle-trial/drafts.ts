import { turtleStarterIds, turtleStarters, type TurtleStarterId } from '@cove/shared';
export const turtleDraftKey = 'cove:turtle:tab:v1';
export type TurtleDraft = { starter: TurtleStarterId; buffers: Record<TurtleStarterId, string>; font: number };
export function initialTurtleDraft(): TurtleDraft { return { starter: 'drawing', buffers: { ...turtleStarters }, font: 18 }; }
export function parseTurtleDraft(raw: string | null): TurtleDraft {
  if (!raw) return initialTurtleDraft();
  try {
    const value = JSON.parse(raw);
    if (!turtleStarterIds.includes(value.starter) || !Number.isInteger(value.font) || value.font < 14 || value.font > 28) return initialTurtleDraft();
    if (!turtleStarterIds.every(id => typeof value.buffers?.[id] === 'string' && new TextEncoder().encode(value.buffers[id]).length <= 65536)) return initialTurtleDraft();
    return { starter: value.starter, buffers: Object.fromEntries(turtleStarterIds.map(id => [id, value.buffers[id]])) as TurtleDraft['buffers'], font: value.font };
  } catch { return initialTurtleDraft(); }
}
export function turtleErrorHint(output: string, english: boolean) {
  let message = '';
  if (/IndentationError|TabError/.test(output)) message = english ? 'Indent the repeated code with four spaces.' : '반복할 코드 앞에 공백 4칸으로 들여쓰기 해 보세요.';
  else if (/SyntaxError/.test(output)) message = english ? 'Check parentheses, quotes, and the colon after for, while or if.' : '괄호와 따옴표, for·while·if 뒤의 콜론(:)을 확인해 보세요.';
  else if (/NameError/.test(output)) message = english ? 'Check command capitals, such as TForward, and restore the imports if needed.' : 'TForward처럼 대소문자를 확인하고, 필요하면 기본 코드를 복원해 보세요.';
  else if (/ReadyToRace/.test(output)) message = english ? 'Run ReadyToRace() before moving a racer.' : '경주 거북이를 움직이기 전에 ReadyToRace()를 실행해 주세요.';
  else if (/Error:/.test(output)) message = english ? 'Check the indicated line and the command arguments.' : '표시된 줄과 명령어에 넣은 값을 확인해 주세요.';
  const matches = [...output.matchAll(/File "(?:\/work\/)?main\.py", line (\d+)/g)];
  return { message, line: matches.length ? Number(matches[matches.length - 1]![1]) : null };
}
