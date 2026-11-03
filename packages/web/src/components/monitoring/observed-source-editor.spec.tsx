// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { editor } from 'monaco-editor';
import { captureSnapshotPointer, projectSnapshotPointer, registerSnapshotPointer } from '@/lib/monitoring/awareness/snapshot-pointer';
it('maps the actual mouse displacement and fences the file and content snapshot', () => {
  let code = 'import turtle\nturtle.done()'; let version = 1;
  const node = document.createElement('div'); document.body.append(node);
  node.getBoundingClientRect = () => ({ left: 100, top: 200, width: 800, height: 300 } as DOMRect);
  node.getClientRects = () => [node.getBoundingClientRect()] as unknown as DOMRectList;
  const subscription = () => ({ dispose() {} });
  const model = { getValue: () => code, getAlternativeVersionId: () => version, getLineCount: () => 3, getLineMaxColumn: () => 80 };
  const instance = { getDomNode: () => node, getModel: () => model, getTargetAtClientPoint: () => ({ type: 6, position: { lineNumber: 2, column: 5 } }),
    getScrolledVisiblePosition: () => ({ top: 40, left: 90, height: 20 }), getLayoutInfo: () => ({ height: 300, contentLeft: 48, contentWidth: 752 }),
    onDidScrollChange: subscription, onDidLayoutChange: subscription, onDidChangeModelContent: subscription, onDidChangeModel: subscription } as unknown as editor.IStandaloneCodeEditor;
  const unregister = registerSnapshotPointer(instance, 'main.py');
  try {
    const remote = captureSnapshotPointer(node, { clientX: 198, clientY: 245 });
    expect(projectSnapshotPointer(remote)).toEqual({ left: 198, top: 245 });
    expect(projectSnapshotPointer(remote && { ...remote, file: 'other.py' })).toBeNull();
    code += '\n# changed'; version++;
    expect(projectSnapshotPointer(remote)).toBeNull();
  } finally { unregister(); node.remove(); }
});
