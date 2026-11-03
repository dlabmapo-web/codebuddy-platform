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
    let version = -1; let fingerprint = '';
    const update = () => {
      const model = instance.getModel();
      const next = model?.getAlternativeVersionId() ?? -1;
      if (next !== version) { version = next; fingerprint = materialCodeKey(model?.getValue() ?? ''); }
      const selection = instance.getSelection();
      if (!selection || !file.current) return;
      value.current = { ...value.current, focus: 'editor', editor: { file: file.current, fingerprint,
        mouse: value.current.editor?.mouse ?? null, cursor: { line: selection.positionLineNumber,
          column: selection.positionColumn, selectionEndLine: selection.selectionStartLineNumber,
          selectionEndColumn: selection.selectionStartColumn } } };
      dirty.current = true;
    };
    const subscriptions = [instance.onDidChangeCursorSelection(update), instance.onDidFocusEditorText(update),
      instance.onMouseMove(event => { update(); if (value.current.editor) value.current.editor.mouse = event.target.position
        ? { line: event.target.position.lineNumber, column: event.target.position.column } : null; }),
      instance.onDidBlurEditorText(() => { value.current = { ...value.current, editor: null }; dirty.current = true; })];
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
      if (!resolved) { value.current = { ...value.current, pointer: null, focus: null }; dirty.current = true; return; }
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
    const visible = () => { if (document.hidden) clear(); };
    const request = () => { dirty.current = true; send(); };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('focusin', focus, true);
    document.addEventListener('input', focus, true);
    document.addEventListener('pointerleave', clear);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('blur', clear);
    const stopFrames = observeSurfaceIframes({ onLeave: clear, onPointerMove: capture });
    socket.on(observationEvents.request, request);
    const timer = setInterval(() => send(), 80);
    return () => {
      clear(); clearInterval(timer); stopFrames(); socket.off(observationEvents.request, request);
      document.removeEventListener('pointermove', move, true); document.removeEventListener('focusin', focus, true); document.removeEventListener('input', focus, true);
      document.removeEventListener('pointerleave', clear); document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('blur', clear);
    };
  }, [enabled, socket, academyId, classId, materialId]);
  return { onEditorMount };
}
