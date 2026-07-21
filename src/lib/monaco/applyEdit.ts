/* eslint-disable @typescript-eslint/no-explicit-any */

export function applyMinimalEdit(editor: any, monaco: any, newText: string): boolean {
  const model = editor?.getModel?.();
  if (!model || !monaco) return false;

  const oldText = model.getValue();
  if (oldText === newText) return true;

  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) start++;

  let endOld = oldText.length;
  let endNew = newText.length;
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--;
    endNew--;
  }

  const startPos = model.getPositionAt(start);
  const endPos = model.getPositionAt(endOld);
  const range = new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column);

  // pushEditOperations: 포커스를 빼앗지 않고 편집 적용
  // cursorStateComputer 콜백에서 현재 선택 영역을 그대로 반환 → 커서 이동 없음
  const currentSelections = editor.getSelections();
  model.pushEditOperations(
    currentSelections,
    [{ range, text: newText.slice(start, endNew) }],
    () => currentSelections,
  );

  return true;
}
