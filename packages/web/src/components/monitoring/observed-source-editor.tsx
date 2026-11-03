'use client';
import { useEffect, useMemo, useState } from 'react';
import type { editor } from 'monaco-editor';
import type { ObservationAwarenessEvent } from '@cove/shared';
import { materialCodeKey } from '@/lib/monitoring/awareness/material-code';
import { CodeEditor } from '@/components/editor/code-editor';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import { RemotePointer } from './remote-pointer';
import styles from './observed-source-editor.module.css';

export function ObservedSourceEditor({ code, file, awareness, peerName }: {
  code: string; file: string; awareness: ObservationAwarenessEvent | null; peerName: string;
}) {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [mouse, setMouse] = useState<{ top: number; left: number } | null>(null);
  const fingerprint = useMemo(() => materialCodeKey(code), [code]);
  const remote = awareness?.editor?.file === file && awareness.editor.fingerprint === fingerprint ? awareness.editor : null;
  useEffect(() => {
    if (!instance) return;
    const decorations = instance.createDecorationsCollection();
    const model = instance.getModel();
    if (remote && model && remote.cursor.line <= model.getLineCount()) {
      const line = remote.cursor.line; const column = Math.min(remote.cursor.column, model.getLineMaxColumn(line));
      const endLine = Math.min(remote.cursor.selectionEndLine ?? line, model.getLineCount());
      const endColumn = Math.min(remote.cursor.selectionEndColumn ?? column, model.getLineMaxColumn(endLine));
      decorations.set([{ range: { startLineNumber: line, startColumn: column, endLineNumber: line, endColumn: column },
        options: { beforeContentClassName: styles.caret } },
        { range: { startLineNumber: Math.min(line, endLine), startColumn: line < endLine ? column : line > endLine ? endColumn : Math.min(column, endColumn),
          endLineNumber: Math.max(line, endLine), endColumn: line < endLine ? endColumn : line > endLine ? column : Math.max(column, endColumn) }, options: { inlineClassName: styles.selection } }]);
    }
    const place = () => {
      const position = remote?.mouse && model && remote.mouse.line <= model.getLineCount()
        ? instance.getScrolledVisiblePosition({ lineNumber: remote.mouse.line, column: Math.min(remote.mouse.column, model.getLineMaxColumn(remote.mouse.line)) }) : null;
      const box = instance.getDomNode()?.getBoundingClientRect();
      const layout = instance.getLayoutInfo();
      const left = position ? position.left + (remote?.mouse?.offset?.x ?? 0) * position.height : -1;
      const top = position ? position.top + (remote?.mouse?.offset?.y ?? 0) * position.height : -1;
      setMouse(box && top >= 0 && top < layout.height && left >= layout.contentLeft && left < layout.contentLeft + layout.contentWidth
        ? { left: box.left + left, top: box.top + top } : null);
    };
    place(); const scroll = instance.onDidScrollChange(place); const layout = instance.onDidLayoutChange(place);
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    return () => { decorations.clear(); scroll.dispose(); layout.dispose(); window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [instance, remote, code]);
  return <div {...surfaceProps('editor')} className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="student-source">
    <CodeEditor code={code} readOnly fontSize={14} onChange={() => {}} onMount={instance => setInstance(instance)} />
    {remote?.mouse && awareness?.pointer?.surface === 'editor' ? <RemotePointer name={peerName} pointer={awareness.pointer} position={mouse} /> : null}
  </div>;
}
