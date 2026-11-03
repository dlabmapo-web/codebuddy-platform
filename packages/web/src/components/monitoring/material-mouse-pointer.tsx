'use client';
import { useCallback } from 'react';
import type { ObservationAwareness } from '@cove/shared';
import { projectSnapshotPointer } from '@/lib/monitoring/awareness/snapshot-pointer';
import { RemotePointer } from './remote-pointer';
export function MaterialMousePointer({ awareness, name }: { awareness: Pick<ObservationAwareness, 'pointer' | 'editor'>; name: string }) {
  const project = useCallback(() => projectSnapshotPointer(awareness.editor), [awareness.editor]);
  return <RemotePointer name={name} pointer={awareness.pointer} project={awareness.pointer?.surface === 'editor' ? project : undefined} />;
}
