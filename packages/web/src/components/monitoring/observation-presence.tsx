'use client';
import type { ObservationAwarenessEvent } from '@cove/shared';
import { MaterialMousePointer } from './material-mouse-pointer';
export function ObservationPresence({ awareness, materialId, name }: { awareness: ObservationAwarenessEvent | null; materialId: string | null; name: string }) {
  return awareness?.materialId === materialId ? <MaterialMousePointer awareness={awareness} name={name} /> : null;
}
