/* eslint-disable @typescript-eslint/no-explicit-any */

export function applyMinimalEdit(editor: any, monaco: any, newText: string): boolean {
  const model = editor?.getModel?.();
  if (!model || !monaco) return false;

  const oldText = model.getValue();
  if (oldText === newText) return true;

  // 로컬 커서/선택 영역을 저장해 두고 편집 후 복원
  // (executeEdits는 편집 위치로 커서를 이동시키기 때문)
  const savedSelections = editor.getSelections();

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

  editor.executeEdits('remote', [{ range, text: newText.slice(start, endNew), forceMoveMarkers: false }]);

  if (savedSelections?.length) {
    editor.setSelections(savedSelections);
  }

  return true;
}
