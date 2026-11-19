import { FILE_BUNDLE_MARKER, type CollaborationPointer } from '@cove/shared';
import * as Y from 'yjs';
import type { MonacoCodeEditor } from '../yjs-monaco';

export const codeGeometryEvent = 'cove-code-geometry';
type Binding = {
  editor: MonacoCodeEditor;
  text: Y.Text;
  draftId: string;
  material: string;
  /**
   * A multi-file editor: the document is the file bundle and the editor shows
   * one file of it. Positions then translate through that file's place in the
   * bundle, and a pointer in another file is reported, not drawn.
   */
  bundle?: {
    activePath: () => string | null;
    /** The file a peer's pointer is in when it is not the one on screen; null when it is, or gone. */
    showPeerFile: (path: string | null) => void;
  };
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

/**
 * Each file's content range in a file bundle, in order: `MARKER path\n`,
 * the content, and a `\n` before the next marker (`encodeFileBundle`).
 */
function bundleRanges(text: string): Array<{ path: string; start: number; end: number }> {
  if (!text.startsWith(FILE_BUNDLE_MARKER)) return [];
  const ranges: Array<{ path: string; start: number; end: number }> = [];
  let at = 0;
  while (at >= 0) {
    const lineEnd = text.indexOf('\n', at);
    const path = text.slice(at + FILE_BUNDLE_MARKER.length, lineEnd < 0 ? text.length : lineEnd);
    const start = lineEnd < 0 ? text.length : lineEnd + 1;
    const next = text.indexOf(`\n${FILE_BUNDLE_MARKER}`, lineEnd < 0 ? text.length : lineEnd);
    ranges.push({ path, start, end: next < 0 ? text.length : next });
    at = next < 0 ? -1 : next + 1;
  }
  return ranges;
}

/** Where one file's content sits in a file bundle, or null when it is not there. */
export function bundleFileRange(text: string, path: string): { start: number; end: number } | null {
  return bundleRanges(text).find((range) => range.path === path) ?? null;
}

/** The file of a bundle whose content holds this index (its end included), or null. */
export function bundleFileAt(text: string, index: number): string | null {
  return bundleRanges(text).find((range) => index >= range.start && index <= range.end)?.path ?? null;
}

/**
 * The model and where its text starts in the document, when the two agree.
 * A single file is the whole document; a multi-file editor's model is one
 * file's slice of the bundle.
 */
function consistent(binding: Binding) {
  const model = binding.editor.getModel();
  if (!model || !binding.text.doc) return null;
  const text = binding.text.toString();
  if (text.includes('\r')) return null;
  if (!binding.bundle) return model.getValue() === text ? { model, base: 0 } : null;
  const path = binding.bundle.activePath();
  const range = path ? bundleFileRange(text, path) : null;
  return range && text.slice(range.start, range.end) === model.getValue() ? { model, base: range.start } : null;
}

export function captureCodePointer(
  element: HTMLElement, point: { clientX: number; clientY: number }, draftId: string,
): CollaborationPointer | null {
  const binding = [...bindings].find((value) => value.draftId === draftId &&
    !!value.editor.getDomNode() && element.contains(value.editor.getDomNode()));
  if (!binding) return null;
  const agreed = consistent(binding);
  if (!agreed) return null;
  const { model, base } = agreed;
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
    binding.text, base + model.getOffsetAt(target.position),
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
  const agreed = consistent(binding);
  if (!agreed || !binding.text.doc) return null;
  const { model, base } = agreed;
  try {
    const absolute = Y.createAbsolutePositionFromRelativePosition(
      Y.decodeRelativePosition(Uint8Array.from(anchor.relative)), binding.text.doc,
    );
    if (!absolute || absolute.type !== binding.text || absolute.index > binding.text.length) return null;
    if (binding.bundle) {
      // A pointer in another file is not drawn over this one: its tab says so.
      const file = bundleFileAt(binding.text.toString(), absolute.index);
      const active = binding.bundle.activePath();
      binding.bundle.showPeerFile(file && file !== active ? file : null);
      if (file !== active) return null;
    }
    const position = model.getPositionAt(absolute.index - base);
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
