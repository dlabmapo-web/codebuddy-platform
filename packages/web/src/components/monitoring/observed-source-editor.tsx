'use client';
import { CodeEditor } from '@/components/editor/code-editor';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { useSnapshotEditor } from '@/lib/monitoring/awareness/use-snapshot-editor';
export function ObservedSourceEditor({ code, file }: { code: string; file: string }) {
  const onMount = useSnapshotEditor(file);
  return <div {...surfaceProps('editor')} className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="student-source">
    <CodeEditor code={code} readOnly fontSize={14} onChange={() => {}} onMount={onMount} />
  </div>;
}
