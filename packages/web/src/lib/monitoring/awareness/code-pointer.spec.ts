import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { MonacoCodeEditor } from '../yjs-monaco';
import { decodeFileBundle, encodeFileBundle } from '@cove/shared';
import { bundleFileAt, bundleFileRange, captureCodePointer, projectCodePointer, registerCodePointer } from './code-pointer';

const draftId = '10000000-0000-4000-8000-000000000001';
function fixture(text: Y.Text, offset = 0) {
  const node = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
  const dispose = vi.fn();
  const event = () => ({ dispose });
  const editor = {
    getDomNode: () => node,
    getModel: () => ({ getValue: () => text.toString(), getOffsetAt: () => offset,
      getPositionAt: (index: number) => ({ lineNumber: 1, column: index + 1 }) }),
    getTargetAtClientPoint: () => ({ type: 6, position: { lineNumber: 1, column: offset + 1 } }),
    getVisibleRanges: () => [{ startLineNumber: 1, endLineNumber: 1 }],
    getScrolledVisiblePosition: (p: { column: number }) => ({ left: 40 + p.column * 8, top: 20, height: 20 }),
    getLayoutInfo: () => ({ contentLeft: 40, contentWidth: 600, height: 200 }),
    onDidScrollChange: event, onDidLayoutChange: event, onDidChangeConfiguration: event,
    onDidChangeModelContent: event, onDidChangeModel: event,
  };
  const unregister = registerCodePointer({ editor: editor as unknown as MonacoCodeEditor,
    text, draftId, material: 'problem-a' });
  return { editor, unregister, dispose, element: { contains: (target: unknown) => target === node } as unknown as HTMLElement };
}

describe('code pointer anchors', () => {
  it('tracks an emoji boundary through concurrent insertion and projects using receiver geometry', () => {
    const doc = new Y.Doc(); const text = doc.getText('code'); text.insert(0, '🎉hello');
    const sender = fixture(text, 2);
    const pointer = captureCodePointer(sender.element, { clientX: 164, clientY: 70 }, draftId)!;
    sender.unregister();
    const replica = new Y.Doc(); Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    const copy = replica.getText('code'); copy.insert(0, 'new');
    const receiver = fixture(copy);
    expect(projectCodePointer(pointer)).toEqual({ left: 188, top: 70 });
    receiver.editor.getScrolledVisiblePosition = () => ({ left: 100, top: 80, height: 20 });
    expect(projectCodePointer(pointer)).toEqual({ left: 200, top: 130 });
    receiver.unregister();
    expect(projectCodePointer(pointer)).toBeNull();
    expect(receiver.dispose).toHaveBeenCalledTimes(5);
  });

  it('suppresses wrong identity, invalid anchors, non-text and off-screen targets', () => {
    const doc = new Y.Doc(); const text = doc.getText('code'); text.insert(0, 'abc');
    const peer = fixture(text, 1);
    const pointer = captureCodePointer(peer.element, { clientX: 156, clientY: 70 }, draftId)!;
    expect(projectCodePointer({ ...pointer, material: 'other' })).toBeNull();
    expect(projectCodePointer({ ...pointer, code: { ...pointer.code!, relative: [255] } })).toBeNull();
    peer.editor.getVisibleRanges = () => [];
    expect(projectCodePointer(pointer)).toBeNull();
    peer.editor.getTargetAtClientPoint = () => ({ type: 2, position: { lineNumber: 1, column: 2 } });
    expect(captureCodePointer(peer.element, { clientX: 156, clientY: 70 }, draftId)).toBeNull();
    peer.unregister();
  });
  it('preserves text and whitespace offsets and scales them with receiver line height', () => {
    const doc = new Y.Doc(); const text = doc.getText('code'); text.insert(0, 'abc');
    const peer = fixture(text, 1);
    const pointer = captureCodePointer(peer.element, { clientX: 159, clientY: 79 }, draftId)!;
    expect(projectCodePointer(pointer)).toEqual({ left: 159, top: 79 });
    peer.editor.getTargetAtClientPoint = () => ({ type: 7, position: { lineNumber: 1, column: 2 } });
    const whitespace = captureCodePointer(peer.element, { clientX: 256, clientY: 110 }, draftId)!;
    expect(projectCodePointer(whitespace)).toEqual({ left: 256, top: 110 });
    peer.editor.getScrolledVisiblePosition = () => ({ left: 80, top: 30, height: 40 });
    expect(projectCodePointer(pointer)).toEqual({ left: 186, top: 98 });
    expect(projectCodePointer(whitespace)).toEqual({ left: 380, top: 160 });
    expect(projectCodePointer({ ...pointer, code: { ...pointer.code!, offset: undefined } }))
      .toEqual({ left: 180, top: 80 });
    expect(projectCodePointer({ ...whitespace, code: { ...whitespace.code!, offset: { x: 500, y: 0 } } }))
      .toBeNull();
    peer.unregister();
  });

});

describe('code pointers in a multi-file bundle', () => {
  const bundle = encodeFileBundle([
    { path: 'main.c', content: 'int main(void) {}\n' },
    { path: 'empty.h', content: '' },
    { path: 'sum.c', content: 'int sum(int a, int b) { return a + b; }' },
  ]);

  it('finds every file, empty and last ones included', () => {
    for (const file of decodeFileBundle(bundle)!) {
      const range = bundleFileRange(bundle, file.path)!;
      expect(bundle.slice(range.start, range.end)).toBe(file.content);
      expect(bundleFileAt(bundle, range.start)).toBe(file.path);
    }
    expect(bundleFileRange(bundle, 'missing.c')).toBeNull();
  });

  /** A multi-file editor showing one file of the shared bundle. */
  function fileFixture(text: Y.Text, path: () => string, offset = 0) {
    const node = { getBoundingClientRect: () => ({ left: 100, top: 50 }) };
    const event = () => ({ dispose: vi.fn() });
    const content = () => { const range = bundleFileRange(text.toString(), path())!; return text.toString().slice(range.start, range.end); };
    const editor = {
      getDomNode: () => node,
      getModel: () => ({ getValue: content, getOffsetAt: () => offset,
        getPositionAt: (index: number) => ({ lineNumber: 1, column: index + 1 }) }),
      getTargetAtClientPoint: () => ({ type: 6, position: { lineNumber: 1, column: offset + 1 } }),
      getVisibleRanges: () => [{ startLineNumber: 1, endLineNumber: 1 }],
      getScrolledVisiblePosition: (p: { column: number }) => ({ left: 40 + p.column * 8, top: 20, height: 20 }),
      getLayoutInfo: () => ({ contentLeft: 40, contentWidth: 600, height: 200 }),
      onDidScrollChange: event, onDidLayoutChange: event, onDidChangeConfiguration: event,
      onDidChangeModelContent: event, onDidChangeModel: event,
    };
    const peerFile = vi.fn();
    const unregister = registerCodePointer({ editor: editor as unknown as MonacoCodeEditor, text, draftId, material: 'problem-a',
      bundle: { activePath: path, showPeerFile: peerFile } });
    return { unregister, peerFile, element: { contains: (target: unknown) => target === node } as unknown as HTMLElement };
  }

  it('anchors a pointer inside the student\'s file and draws it only over the same file', () => {
    const doc = new Y.Doc(); const text = doc.getText('code'); text.insert(0, bundle);
    // The student points at column 5 of sum.c.
    const student = fileFixture(text, () => 'sum.c', 4);
    const pointer = captureCodePointer(student.element, { clientX: 180, clientY: 70 }, draftId)!;
    student.unregister();
    expect(pointer.code).toMatchObject({ kind: 'yjs', line: 1, column: 5 });

    // The teacher's copy, with main.c edited meanwhile: the anchor moves with it.
    const replica = new Y.Doc(); Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
    const copy = replica.getText('code'); copy.insert(bundle.indexOf('int main') , '// note\n');
    let shown = 'main.c';
    const teacher = fileFixture(copy, () => shown);
    expect(projectCodePointer(pointer)).toBeNull();
    expect(teacher.peerFile).toHaveBeenLastCalledWith('sum.c');
    shown = 'sum.c';
    expect(projectCodePointer(pointer)).toEqual({ left: 100 + 40 + 5 * 8, top: 50 + 20 });
    expect(teacher.peerFile).toHaveBeenLastCalledWith(null);
    teacher.unregister();
  });
});
