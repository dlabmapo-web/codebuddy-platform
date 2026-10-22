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
export function turtleErrorHint(output: string) {
  let key: 'hint_indent' | 'hint_syntax' | 'hint_name' | 'hint_race' | 'hint_arguments' | null = null;
  if (/IndentationError|TabError/.test(output)) key = 'hint_indent';
  else if (/SyntaxError/.test(output)) key = 'hint_syntax';
  else if (/NameError/.test(output)) key = 'hint_name';
  else if (/ReadyToRace/.test(output)) key = 'hint_race';
  else if (/Error:/.test(output)) key = 'hint_arguments';
  const matches = [...output.matchAll(/File "(?:\/work\/)?main\.py", line (\d+)/g)];
  return { key, line: matches.length ? Number(matches[matches.length - 1]![1]) : null };
}
