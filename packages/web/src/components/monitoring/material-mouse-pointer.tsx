'use client';
import type * as React from 'react';
import { useHistoryCovered } from '@/lib/monitoring/history-presentation';
import { useCallback } from 'react';
import type { ObservationAwareness } from '@cove/shared';
import { projectSnapshotPointer } from '@/lib/monitoring/awareness/snapshot-pointer';
import { RemotePointer } from './remote-pointer';
function MaterialMousePointerContent({ awareness, name }: { awareness: Pick<ObservationAwareness, 'pointer' | 'editor'>; name: string }) {
  const project = useCallback(() => projectSnapshotPointer(awareness.editor), [awareness.editor]);
  return <RemotePointer name={name} pointer={awareness.pointer} project={awareness.pointer?.surface === 'editor' ? project : undefined} />;
}

export function MaterialMousePointer(props: React.ComponentProps<typeof MaterialMousePointerContent>) { const covered = useHistoryCovered(); return covered ? null : <MaterialMousePointerContent {...props} />; }
