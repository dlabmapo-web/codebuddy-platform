'use client';
import type * as React from 'react';
import { useHistoryCovered } from '@/lib/monitoring/history-presentation';
import { useCallback } from 'react';
import type { ObservationAwareness } from '@cove/shared';
import { projectSnapshotPointer } from '@/lib/monitoring/awareness/snapshot-pointer';
import { RemotePointer } from './remote-pointer';
function MaterialMousePointerContent({ awareness, materialId, name }: { awareness: Pick<ObservationAwareness, 'pointer' | 'editor' | 'materialId'>; materialId: string | null; name: string }) {
  const project = useCallback(() => projectSnapshotPointer(awareness.editor), [awareness.editor]);
  return <RemotePointer name={name} materialId={materialId} sourceMaterialId={awareness.materialId} pointer={awareness.pointer} project={awareness.pointer?.surface === 'editor' ? project : undefined} />;
}

export function MaterialMousePointer(props: React.ComponentProps<typeof MaterialMousePointerContent>) { const covered = useHistoryCovered(); return covered ? null : <MaterialMousePointerContent {...props} />; }
