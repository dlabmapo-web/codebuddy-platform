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
  // Monaco CONTENT_TEXT and CONTENT_EMPTY both supply a nearby code position.
  // Keep the displacement too, including whitespace after/below the code.
  if (!target || (target.type !== 6 && target.type !== 7) || !target.position) return null;
  const pixel = binding.editor.getScrolledVisiblePosition(target.position);
  const box = binding.editor.getDomNode()?.getBoundingClientRect();
  if (!pixel || !box || pixel.height <= 0) return null;
  const offset = {
    x: (point.clientX - box.left - pixel.left) / pixel.height,
    y: (point.clientY - box.top - pixel.top) / pixel.height,
  };
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y) ||
      Math.abs(offset.x) > 100_000 || Math.abs(offset.y) > 100_000) return null;
  const relative = Array.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(
    binding.text, model.getOffsetAt(target.position),
  )));
  if (relative.length > 256) return null;
  return {
    surface: 'editor', space: 'surface', material: binding.material, x: 0, y: 0,
    code: { kind: 'yjs', draftId, line: target.position.lineNumber,
      column: target.position.column, relative, offset },
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
    const left = pixel.left + (anchor.offset?.x ?? 0) * pixel.height;
    const top = pixel.top + (anchor.offset?.y ?? 0) * pixel.height;
    if (!Number.isFinite(left) || !Number.isFinite(top) ||
        left < layout.contentLeft || left >= layout.contentLeft + layout.contentWidth ||
        top < 0 || top >= layout.height) return null;
    return { left: box.left + left, top: box.top + top };
  } catch {
    return null;
  }
}
