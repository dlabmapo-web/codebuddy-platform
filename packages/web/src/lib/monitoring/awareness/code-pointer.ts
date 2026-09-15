import type { CollaborationPointer } from '@cove/shared';
import * as Y from 'yjs';
import type { MonacoCodeEditor } from '../yjs-monaco';

export const codeGeometryEvent = 'cove-code-geometry';
type Binding = {
  editor: MonacoCodeEditor;
  text: Y.Text;
  draftId: string;
  material: string;
};
const bindings = new Set<Binding>();
const changed = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(codeGeometryEvent));
};

export function registerCodePointer(binding: Binding): () => void {
  bindings.add(binding);
  const { editor } = binding;
  const subscriptions = [
    editor.onDidScrollChange(changed), editor.onDidLayoutChange(changed),
    editor.onDidChangeConfiguration(changed), editor.onDidChangeModelContent(changed),
    editor.onDidChangeModel(changed),
  ];
  changed();
  return () => {
    bindings.delete(binding);
    subscriptions.forEach((subscription) => subscription.dispose());
    changed();
  };
}

function consistent(binding: Binding) {
  const model = binding.editor.getModel();
  return model && binding.text.doc && model.getValue() === binding.text.toString()
    && !binding.text.toString().includes('\r') ? model : null;
}

export function captureCodePointer(
  element: HTMLElement, point: { clientX: number; clientY: number }, draftId: string,
): CollaborationPointer | null {
  const binding = [...bindings].find((value) => value.draftId === draftId &&
    !!value.editor.getDomNode() && element.contains(value.editor.getDomNode()));
  if (!binding) return null;
  const model = consistent(binding);
  if (!model) return null;
  const target = binding.editor.getTargetAtClientPoint(point.clientX, point.clientY);
  // Monaco MouseTargetType.CONTENT_TEXT. Whitespace/gutter/minimap are not code.
  if (target?.type !== 6 || !target.position) return null;
  const relative = Array.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(
    binding.text, model.getOffsetAt(target.position),
  )));
  if (relative.length > 256) return null;
  return {
    surface: 'editor', space: 'surface', material: binding.material, x: 0, y: 0,
    code: { kind: 'yjs', draftId, line: target.position.lineNumber,
      column: target.position.column, relative },
  };
}

export function projectCodePointer(pointer: CollaborationPointer): { left: number; top: number } | null {
  const anchor = pointer.code;
  if (!anchor) return null;
  const binding = [...bindings].find((value) => value.draftId === anchor.draftId &&
    value.material === pointer.material);
  if (!binding) return null;
  const model = consistent(binding);
  if (!model || !binding.text.doc) return null;
  try {
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.decodeRelativePosition(Uint8Array.from(anchor.relative)), binding.text.doc,
    );
    if (!absolute || absolute.type !== binding.text || absolute.index > binding.text.length) return null;
    const position = model.getPositionAt(absolute.index);
    if (!binding.editor.getVisibleRanges().some((range) =>
      position.lineNumber >= range.startLineNumber && position.lineNumber <= range.endLineNumber)) return null;
    const pixel = binding.editor.getScrolledVisiblePosition(position);
    const box = binding.editor.getDomNode()?.getBoundingClientRect();
    if (!pixel || !box) return null;
    const layout = binding.editor.getLayoutInfo();
    if (pixel.left < layout.contentLeft || pixel.left >= layout.contentLeft + layout.contentWidth ||
        pixel.top < 0 || pixel.top >= layout.height) return null;
    return { left: box.left + pixel.left, top: box.top + pixel.top };
  } catch {
    return null;
  }
}
