'use client';
import { useEffect, useMemo, useState } from 'react';
import type { editor } from 'monaco-editor';
import type { ObservationAwarenessEvent } from '@cove/shared';
import { materialCodeKey } from '@/lib/monitoring/awareness/material-code';
import { CodeEditor } from '@/components/editor/code-editor';
import { surfaceProps } from '@/lib/monitoring/awareness/surfaces';
import styles from './observed-source-editor.module.css';

export function ObservedSourceEditor({ code, file, awareness }: {
  code: string; file: string; awareness: ObservationAwarenessEvent | null;
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
        ? instance.getScrolledVisiblePosition({ lineNumber: remote.mouse.line, column: remote.mouse.column }) : null;
      setMouse(position && position.top >= 0 && position.top < instance.getLayoutInfo().height && position.left >= instance.getLayoutInfo().contentLeft && position.left < instance.getLayoutInfo().width
        ? { left: position.left, top: position.top } : null);
    };
    place(); const scroll = instance.onDidScrollChange(place); const layout = instance.onDidLayoutChange(place);
    return () => { decorations.clear(); scroll.dispose(); layout.dispose(); };
  }, [instance, remote, code]);
  return <div {...surfaceProps('editor')} className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-testid="student-source">
    <CodeEditor code={code} readOnly fontSize={14} onChange={() => {}} onMount={instance => setInstance(instance)} />
    {mouse ? <span data-testid="observation-editor-pointer" aria-hidden className="pointer-events-none absolute z-20 text-peer" style={{ left: mouse.left, top: mouse.top }}>
      <svg width="18" height="22" viewBox="0 0 18 22" fill="currentColor"><path d="M1 1v17l5-5 4 8 3-2-4-7h7Z" /></svg>
    </span> : null}
  </div>;
}
