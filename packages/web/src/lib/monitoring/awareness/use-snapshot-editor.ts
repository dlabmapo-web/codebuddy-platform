'use client';
import { useEffect, useState } from 'react';
import type { editor } from 'monaco-editor';
import { registerSnapshotPointer } from './snapshot-pointer';
export function useSnapshotEditor(file?: string) {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  useEffect(() => { if (instance && file) return registerSnapshotPointer(instance, file); }, [instance, file]);
  return setInstance;
}
