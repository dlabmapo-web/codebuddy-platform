'use client';

import type { CollaborationCursor } from '@cove/shared';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';

import { registerPaircodeTheme } from '@/lib/monaco/theme';
import {
  attachRemoteCursor,
  readCursor,
} from '@/lib/monitoring/awareness/remote-cursor';
import {
  bindYTextToMonaco,
  type MonacoCodeEditor,
} from '@/lib/monitoring/yjs-monaco';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <EditorFallback />,
});

function EditorFallback() {
  const { t } = useTranslation('monitoring');
  return (
    <div className="flex flex-1 items-center justify-center bg-editor-bg">
      <span className="text-[13px] text-white/50">{t('workspace.loading')}</span>
    </div>
  );
}

/**
 * The shared editor.
 *
 * The document, not the editor, is the source of truth: the binding writes
 * every keystroke into the CRDT and every remote change back into the model as
 * a minimal edit, so the two people typing never overwrite each other and
 * neither one's scroll position jumps when the other types.
 */
export function LiveEditor({
  fontSize,
  onCursor,
  peerName,
  readOnly,
  remoteCursor,
  text,
}: {
  fontSize: number;
  onCursor: (cursor: CollaborationCursor | null) => void;
  /** Whose caret the label names — the student, by name. */
  peerName: string;
  readOnly: boolean;
  remoteCursor: CollaborationCursor | null;
  text: Y.Text;
}) {
  const [editor, setEditor] = React.useState<MonacoCodeEditor | null>(null);
  const cursorRef = React.useRef<ReturnType<typeof attachRemoteCursor> | null>(
    null,
  );

  // `onMount` cannot clean up after itself — it is a notification, not an
  // effect — so it does nothing but hand the editor over, and everything with
  // a lifetime is built and torn down below.
  React.useEffect(() => {
    if (!editor) return;
    const binding = bindYTextToMonaco(text, editor);
    return () => binding.destroy();
  }, [editor, text]);

  React.useEffect(() => {
    if (!editor) return;
    const listener = editor.onDidChangeCursorSelection((event) => {
      onCursor(readCursor(event.selection));
    });
    return () => listener.dispose();
  }, [editor, onCursor]);

  // The label is rebuilt with the editor and with the name, and torn down with
  // either — a widget left behind would outlive the editor that owns it.
  React.useEffect(() => {
    if (!editor) return;
    const cursor = attachRemoteCursor(editor, peerName);
    cursorRef.current = cursor;
    return () => {
      cursor.dispose();
      cursorRef.current = null;
    };
  }, [editor, peerName]);

  React.useEffect(() => {
    cursorRef.current?.update(remoteCursor);
  }, [remoteCursor]);

  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        height="100%"
        language="python"
        onMount={setEditor}
        options={{
          automaticLayout: true,
          fontFamily: "'Fira Code', Consolas, monospace",
          fontSize,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { bottom: 12, top: 12 },
          // Read-only until the watch and the first sync are both confirmed:
          // an edit typed before then would have nowhere to go.
          readOnly,
          scrollBeyondLastLine: false,
          tabSize: 4,
          wordWrap: 'off',
        }}
        theme="paircode-dark"
      />
    </div>
  );
}
