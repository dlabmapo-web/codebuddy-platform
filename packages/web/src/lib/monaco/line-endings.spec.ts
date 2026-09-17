import type { Monaco } from '@monaco-editor/react';
import { describe, expect, it, vi } from 'vitest';

import {
  editorDouble,
  MonacoModelDouble,
} from '@/lib/monitoring/monaco-model-double';

import { pinLfOnMount } from './line-endings';

type MountEditor = Parameters<ReturnType<typeof pinLfOnMount>>[0];

const monaco = {
  editor: { EndOfLineSequence: { LF: 0, CRLF: 1 } },
} as unknown as Monaco;

describe('pinLfOnMount', () => {
  it('turns a Windows CRLF model into LF before delegating', () => {
    const model = new MonacoModelDouble('print(1)\r\nprint(2)');
    const editor = editorDouble(model) as unknown as MountEditor;
    const onMount = vi.fn(() => {
      expect(model.getEOL()).toBe('\n');
    });

    pinLfOnMount(onMount)(editor, monaco);

    expect(onMount).toHaveBeenCalledWith(editor, monaco);
    expect(model.getValue()).toBe('print(1)\nprint(2)');
  });

  it('keeps a typed Enter LF, so the model equals the LF draft state', () => {
    const model = new MonacoModelDouble('a\r\nb');
    pinLfOnMount()(editorDouble(model) as unknown as MountEditor, monaco);

    // What a Windows Enter inserts at the end of line 2.
    model.applyEdits([
      {
        range: { startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 2 },
        text: '\r\nc',
      },
    ]);

    expect(model.getValue()).toBe('a\nb\nc');
  });
});
