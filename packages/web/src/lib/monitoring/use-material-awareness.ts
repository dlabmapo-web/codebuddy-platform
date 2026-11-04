'use client';
import { useHistoryCovered } from './history-presentation';
import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { observationEvents, type ObservationAwareness } from '@cove/shared';
import { useStudentPresence } from './student-presence';
import { useSnapshotEditor } from './awareness/use-snapshot-editor';
import { captureSnapshotPointer } from './awareness/snapshot-pointer';
import { codeGeometryEvent } from './awareness/code-pointer';
import { observeSurfaceIframes, type PointerCaptureSurface, type PointerViewportPoint } from './awareness/iframe-pointer-capture';
import { pointerBoxFor, resolvePointerAnchor, resolvePointerSurface, toCanvasPosition, toSurfaceFraction } from './awareness/surfaces';

const sequences = new WeakMap<object, number>();
export function useMaterialPointerPublisher({ enabled, socket, academyId, materialId, classId, membershipId }: {
  enabled: boolean; socket: Socket | null; academyId: string | null; materialId?: string | null; classId?: string; membershipId?: string;
}) {
  const covered = useHistoryCovered();
  const value = useRef<Pick<ObservationAwareness, 'pointer' | 'focus' | 'editor'>>({ pointer: null, focus: null, editor: null });
  useEffect(() => {
    if (covered || !enabled || !socket || !academyId || !classId || !materialId) return;
    value.current = { pointer: null, focus: null, editor: null };
    let dirty = false; let lastPoint: PointerViewportPoint | null = null;
    const event = membershipId ? observationEvents.teacherAwareness : observationEvents.awareness;
    const send = (clear = false) => {
      if (!socket.connected || (!dirty && !clear)) return;
      const sequence = (sequences.get(socket) ?? 0) + 1; sequences.set(socket, sequence);
      const payload = { ...value.current, academyId, classId, materialId, sequence, ...(membershipId ? { membershipId } : {}) };
      if (clear) socket.emit(event, payload); else socket.volatile.emit(event, payload);
      dirty = false;
    };
    const clear = () => { value.current = { pointer: null, focus: null, editor: null }; dirty = true; send(true); };
    const capture = (point: PointerViewportPoint, resolved: PointerCaptureSurface | null, target: EventTarget | null = null) => {
      if (!resolved) return;
      lastPoint = point;
      const { box, space, material } = pointerBoxFor(resolved);
      const position = space === 'canvas' ? toCanvasPosition(point, box) : toSurfaceFraction(point, box);
      if (!position) return;
      const anchor = space === 'surface' ? resolvePointerAnchor(target ?? document.elementFromPoint(point.clientX, point.clientY), resolved.element, point) : null;
      value.current = { focus: resolved.surface, pointer: { surface: resolved.surface, space, material, ...position, ...(anchor ? { anchor } : {}) },
        editor: resolved.surface === 'editor' ? captureSnapshotPointer(resolved.element, point) : null };
      dirty = true;
    };
    const move = (event: PointerEvent) => capture(event, resolvePointerSurface(event.target), event.target);
    const geometry = () => {
      if (membershipId) return;
      if (!lastPoint) return;
      const target = document.elementFromPoint(lastPoint.clientX, lastPoint.clientY);
      capture(lastPoint, resolvePointerSurface(target), target);
    };
    const request = () => { dirty = true; send(); };
    document.addEventListener('pointermove', move, true);
    window.addEventListener(codeGeometryEvent, geometry);
    const stopFrames = observeSurfaceIframes({ onLeave: () => undefined, onPointerMove: capture });
    if (!membershipId) socket.on(observationEvents.request, request);
    socket.on('connect', request);
    const timer = setInterval(() => send(), 80);
    return () => {
      clear(); clearInterval(timer); stopFrames(); socket.off(observationEvents.request, request); socket.off('connect', request);
      document.removeEventListener('pointermove', move, true); window.removeEventListener(codeGeometryEvent, geometry);
    };
  }, [covered, enabled, socket, academyId, classId, materialId, membershipId]);
}
export function useMaterialAwareness(input: { enabled: boolean; materialId: string; classId?: string; activeFile?: string }) {
  const { socket, academyId } = useStudentPresence();
  const onEditorMount = useSnapshotEditor(input.activeFile);
  useMaterialPointerPublisher({ ...input, socket, academyId });
  return { onEditorMount };
}
