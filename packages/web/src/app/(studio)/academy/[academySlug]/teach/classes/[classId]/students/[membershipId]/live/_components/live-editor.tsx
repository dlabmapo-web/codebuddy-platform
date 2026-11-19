'use client';
import type { ExerciseLanguage } from '@cove/shared';
import { monacoLanguageFor } from '@/lib/workspace/exercise-language';

import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type * as Y from 'yjs';

import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import {
  bindYTextToMonaco,
  type MonacoCodeEditor,
} from '@/lib/monitoring/yjs-monaco';
import { bindYTextToBundle, type BundleHost } from '@/lib/monitoring/yjs-bundle';
import { MultiFileEditor } from '@/components/editor/multi-file-editor';

const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), {
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
  pointerIdentity,
  fontSize,
  language,
  readOnly,
  text,
  multiFile = false,
}: {
  pointerIdentity?: { draftId: string; material: string };
  fontSize: number;
  language?: ExerciseLanguage;
  readOnly: boolean;
  text: Y.Text;
  /** A multi-file C/C++ exercise: the document is its file bundle. */
  multiFile?: boolean;
}) {
  const pointerDraftId = pointerIdentity?.draftId;
  const pointerMaterial = pointerIdentity?.material;
  const [editor, setEditor] = React.useState<MonacoCodeEditor | null>(null);
  // `onMount` cannot clean up after itself — it is a notification, not an
  // effect — so it does nothing but hand the editor over, and everything with
  // a lifetime is built and torn down below.
  const [host, setHost] = React.useState<BundleHost | null>(null);
  React.useEffect(() => {
    if (!multiFile || !host) return;
    const binding = bindYTextToBundle(text, host, { seed: 'text' });
    return () => binding.destroy();
  }, [host, multiFile, text]);
  React.useEffect(() => {
    if (!editor || multiFile) return;
    const binding = bindYTextToMonaco(text, editor, {
      pointerIdentity: pointerDraftId && pointerMaterial ? { draftId: pointerDraftId, material: pointerMaterial } : undefined,
    });
    return () => binding.destroy();
  }, [editor, multiFile, text, pointerDraftId, pointerMaterial]);

  if (multiFile && (language === 'C' || language === 'CPP')) {
    return (
      <MultiFileEditor
        key={text.doc?.guid}
        code={text.toString()}
        documentManaged
        fontSize={fontSize}
        language={language}
        onChange={() => undefined}
        onMount={(_editor, bundleHost) => setHost(bundleHost)}
        readOnly={readOnly}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        height="100%"
        language={monacoLanguageFor(language)}
        onMount={setEditor}
        options={{
          automaticLayout: true,
          fontFamily: EDITOR_FONT_FAMILY,
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
