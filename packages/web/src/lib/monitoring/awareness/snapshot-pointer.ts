import type { editor } from 'monaco-editor';
import type { ObservationAwareness } from '@cove/shared';
import { codeGeometryEvent } from './code-pointer';
import { materialCodeKey } from './material-code';

type Binding = { editor: editor.IStandaloneCodeEditor; file: string; model?: editor.ITextModel | null; version?: number; fingerprint?: string };
const bindings = new Set<Binding>();
const changed = () => window.dispatchEvent(new Event(codeGeometryEvent));
function fingerprint(binding: Binding) {
  const model = binding.editor.getModel();
  if (!model) return null;
  if (model !== binding.model || model.getAlternativeVersionId() !== binding.version) {
    binding.model = model; binding.version = model.getAlternativeVersionId(); binding.fingerprint = materialCodeKey(model.getValue());
  }
  return binding.fingerprint;
}
export function registerSnapshotPointer(instance: editor.IStandaloneCodeEditor, file: string) {
  const binding: Binding = { editor: instance, file }; bindings.add(binding);
  const subscriptions = [instance.onDidScrollChange(changed), instance.onDidLayoutChange(changed), instance.onDidChangeModelContent(changed), instance.onDidChangeModel(changed)];
  changed();
  return () => { bindings.delete(binding); subscriptions.forEach(item => item.dispose()); changed(); };
}
export function captureSnapshotPointer(element: HTMLElement, point: { clientX: number; clientY: number }): ObservationAwareness['editor'] {
  const binding = [...bindings].find(item => item.editor.getDomNode() && element.contains(item.editor.getDomNode()));
  if (!binding) return null;
  const target = binding.editor.getTargetAtClientPoint(point.clientX, point.clientY);
  if (!target?.position || (target.type !== 6 && target.type !== 7)) return null;
  const pixel = binding.editor.getScrolledVisiblePosition(target.position); const box = binding.editor.getDomNode()?.getBoundingClientRect();
  const key = fingerprint(binding);
  if (!pixel || !box || pixel.height <= 0 || !key) return null;
  return { file: binding.file, fingerprint: key, cursor: { line: target.position.lineNumber, column: target.position.column, selectionEndLine: null, selectionEndColumn: null },
    mouse: { line: target.position.lineNumber, column: target.position.column, offset: {
      x: (point.clientX - box.left - pixel.left) / pixel.height, y: (point.clientY - box.top - pixel.top) / pixel.height,
    } } };
}
export function projectSnapshotPointer(remote: ObservationAwareness['editor']) {
  if (!remote?.mouse) return null;
  const binding = [...bindings].find(item => item.file === remote.file && fingerprint(item) === remote.fingerprint && item.editor.getDomNode()?.getClientRects().length);
  if (!binding) return null;
  const model = binding.editor.getModel(); const position = remote.mouse;
  if (!model || position.line > model.getLineCount()) return null;
  const pixel = binding.editor.getScrolledVisiblePosition({ lineNumber: position.line, column: Math.min(position.column, model.getLineMaxColumn(position.line)) });
  const box = binding.editor.getDomNode()?.getBoundingClientRect(); const layout = binding.editor.getLayoutInfo();
  if (!pixel || !box) return null;
  const left = pixel.left + (position.offset?.x ?? 0) * pixel.height; const top = pixel.top + (position.offset?.y ?? 0) * pixel.height;
  return left >= layout.contentLeft && left < layout.contentLeft + layout.contentWidth && top >= 0 && top < layout.height
    ? { left: box.left + left, top: box.top + top } : null;
}
