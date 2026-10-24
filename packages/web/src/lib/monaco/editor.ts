'use client';

import Editor, { loader } from '@monaco-editor/react';
import monacoPackage from 'monaco-editor/package.json';

// Configure before any Editor mounts, including readonly solutions and live
// monitoring. A CDN worker can fail under the app's COEP policy in Safari.
// The npm version also keys the asset URL so release upgrades are cache-safe.
loader.config({ paths: { vs: `/monaco/${monacoPackage.version}/vs` } });

export default Editor;
