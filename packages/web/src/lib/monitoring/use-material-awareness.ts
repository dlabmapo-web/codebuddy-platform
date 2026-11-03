'use client';
import { useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { observationEvents, type ObservationAwareness, type CollaborationSurface } from '@cove/shared';
import { materialCodeKey } from './awareness/material-code';
import { useStudentPresence } from './student-presence';
import { observeSurfaceIframes, type PointerCaptureSurface, type PointerViewportPoint } from './awareness/iframe-pointer-capture';
import { pointerBoxFor, resolvePointerAnchor, resolvePointerSurface, toCanvasPosition, toSurfaceFraction } from './awareness/surfaces';

const sequences = new WeakMap<object, number>();
export function useMaterialAwareness({ enabled, materialId, classId, activeFile }: {
  enabled: boolean; materialId: string; classId?: string; activeFile?: string;
}) {
  const { socket, academyId } = useStudentPresence();
  const file = useRef(activeFile);
  useEffect(() => { file.current = activeFile; }, [activeFile]);
  const value = useRef<Pick<ObservationAwareness, 'pointer' | 'focus' | 'editor'>>({ pointer: null, focus: null, editor: null });
  const dirty = useRef(false);
  const onEditorMount = useCallback((instance: editor.IStandaloneCodeEditor) => {
    let version = -1; let fingerprint = ''; let previousModel: editor.ITextModel | null = null;
    const update = () => {
      const model = instance.getModel();
      const next = model?.getAlternativeVersionId() ?? -1;
      if (next !== version || model !== previousModel) { version = next; previousModel = model; fingerprint = materialCodeKey(model?.getValue() ?? ''); }
      const selection = instance.getSelection();
      if (!selection || !file.current) return;
      value.current = { ...value.current, focus: 'editor', editor: { file: file.current, fingerprint,
        mouse: value.current.editor?.mouse ?? null, cursor: { line: selection.positionLineNumber,
          column: selection.positionColumn, selectionEndLine: selection.selectionStartLineNumber,
          selectionEndColumn: selection.selectionStartColumn } } };
      dirty.current = true;
    };
    const subscriptions = [instance.onDidChangeCursorSelection(update), instance.onDidFocusEditorText(update),
      instance.onMouseMove(event => {
        update();
        if (!value.current.editor) return;
        const position = event.target.position;
        const pixel = position && instance.getScrolledVisiblePosition(position);
        const box = instance.getDomNode()?.getBoundingClientRect();
        const point = event.event.browserEvent;
        value.current.editor.mouse = position && pixel && pixel.height > 0 && box && (event.target.type === 6 || event.target.type === 7)
          ? { line: position.lineNumber, column: position.column, offset: {
            x: (point.clientX - box.left - pixel.left) / pixel.height,
            y: (point.clientY - box.top - pixel.top) / pixel.height,
          } } : null;
      })];
    instance.onDidDispose(() => subscriptions.forEach(item => item.dispose()));
  }, []);
  useEffect(() => {
    if (!enabled || !socket || !academyId || !classId) return;
    value.current = { pointer: null, focus: null, editor: null };
    const send = (clear = false) => {
      if (!socket.connected || (!dirty.current && !clear)) return;
      const sequence = (sequences.get(socket) ?? 0) + 1; sequences.set(socket, sequence);
      const payload = { ...value.current, academyId, classId, materialId, sequence };
      if (clear) socket.emit(observationEvents.awareness, payload);
      else socket.volatile.emit(observationEvents.awareness, payload);
      dirty.current = false;
    };
    const clear = () => { value.current = { pointer: null, focus: null, editor: null }; dirty.current = true; send(true); };
    const capture = (point: PointerViewportPoint, resolved: PointerCaptureSurface | null, target: EventTarget | null = null) => {
      // Match coding: keep the last representable location when crossing a
      // gap, browser chrome or a window boundary. Session changes clear it.
      if (!resolved) return;
      const { box, space, material } = pointerBoxFor(resolved);
      const position = space === 'canvas' ? toCanvasPosition(point, box) : toSurfaceFraction(point, box);
      if (!position) return;
      const anchor = space === 'surface' ? resolvePointerAnchor(target ?? document.elementFromPoint(point.clientX, point.clientY), resolved.element, point) : null;
      value.current = { ...value.current, focus: resolved.surface, pointer: { surface: resolved.surface, space,
        material, ...position, ...(anchor ? { anchor } : {}) } };
      dirty.current = true;
    };
    const move = (event: PointerEvent) => capture(event, resolvePointerSurface(event.target), event.target);
    const focus = (event: Event) => {
      const resolved = resolvePointerSurface(event.target);
      value.current = { ...value.current, focus: resolved?.surface as CollaborationSurface ?? null };
      dirty.current = true;
    };
    const request = () => { dirty.current = true; send(); };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('input', focus, true);
    const stopFrames = observeSurfaceIframes({ onLeave: () => undefined, onPointerMove: capture });
    socket.on(observationEvents.request, request);
    socket.on('connect', request);
    const timer = setInterval(() => send(), 80);
    return () => {
      clear(); clearInterval(timer); stopFrames(); socket.off(observationEvents.request, request); socket.off('connect', request);
      document.removeEventListener('pointermove', move, true); document.removeEventListener('focusin', focus, true); document.removeEventListener('input', focus, true);
    };
  }, [enabled, socket, academyId, classId, materialId]);
  return { onEditorMount };
}
