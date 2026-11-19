import { decodeFileBundle, encodeFileBundle } from '@cove/shared';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { bindYTextToBundle, minimalEdit, type BundleHost } from './yjs-bundle';

/** A multi-file editor reduced to its files: what `MultiFileEditor` exposes. */
function fakeHost(initial: string) {
  let files = decodeFileBundle(initial)!;
  const listeners = new Set<() => void>();
  const host: BundleHost & { edit: (path: string, content: string) => void; add: (path: string) => void; files: () => typeof files } = {
    read: () => encodeFileBundle(files),
    apply: (bundle) => { files = decodeFileBundle(bundle) ?? []; },
    onLocalChange: (listener) => { listeners.add(listener); return { dispose: () => listeners.delete(listener) }; },
    edit: (path, content) => { files = files.map((file) => (file.path === path ? { path, content } : file)); for (const l of listeners) l(); },
    add: (path) => { files = [...files, { path, content: '' }]; for (const l of listeners) l(); },
    files: () => files,
  };
  return host;
}

/** Two Yjs documents that exchange every update, as the server relays them. */
function pair() {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(b, update, 'remote'); });
  b.on('update', (update: Uint8Array, origin: unknown) => { if (origin !== 'remote') Y.applyUpdate(a, update, 'remote'); });
  return [a.getText('code'), b.getText('code')] as const;
}

const start = encodeFileBundle([
  { path: 'main.c', content: '#include "sum.h"\nint main(void) { return sum(1, 2); }\n' },
  { path: 'sum.c', content: 'int sum(int a, int b) { return 0; }\n' },
]);

describe('minimalEdit', () => {
  it('keeps the common prefix and suffix', () => {
    expect(minimalEdit('abcdef', 'abXYef')).toEqual({ at: 2, remove: 2, insert: 'XY' });
    expect(minimalEdit('aaa', 'aaaa')).toEqual({ at: 3, remove: 0, insert: 'a' });
    expect(minimalEdit('same', 'same')).toBeNull();
  });
});

describe('bindYTextToBundle', () => {
  it('seeds the document from the student and carries edits both ways', () => {
    const [studentText, teacherText] = pair();
    const student = fakeHost(start);
    const teacher = fakeHost(encodeFileBundle([{ path: 'main.c', content: '' }]));
    const a = bindYTextToBundle(studentText, student, { seed: 'model' });
    const b = bindYTextToBundle(teacherText, teacher, { seed: 'text' });
    expect(teacher.read()).toBe(start);

    student.edit('sum.c', 'int sum(int a, int b) { return a + b; }\n');
    expect(teacher.files().find((file) => file.path === 'sum.c')?.content).toBe('int sum(int a, int b) { return a + b; }\n');

    teacher.add('extra.c');
    expect(student.files().map((file) => file.path)).toEqual(['main.c', 'sum.c', 'extra.c']);
    a.destroy();
    b.destroy();
  });

  it('merges concurrent typing in different files', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const studentText = a.getText('code');
    const teacherText = b.getText('code');
    studentText.insert(0, start);
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    const student = fakeHost(start);
    const teacher = fakeHost(start);
    bindYTextToBundle(studentText, student, { seed: 'text' });
    bindYTextToBundle(teacherText, teacher, { seed: 'text' });
    // Offline from each other: both type, then exchange.
    student.edit('main.c', '#include "sum.h"\nint main(void) { return sum(40, 2); }\n');
    teacher.edit('sum.c', 'int sum(int a, int b) { return a + b; }\n');
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
    expect(student.read()).toBe(teacher.read());
    expect(student.read()).toContain('sum(40, 2)');
    expect(student.read()).toContain('return a + b');
  });

  it('replaces the whole set on reset', () => {
    const [text] = pair();
    const host = fakeHost(start);
    const binding = bindYTextToBundle(text, host, { seed: 'model' });
    host.edit('sum.c', 'changed');
    binding.replace(start);
    expect(text.toString()).toBe(start);
    expect(host.read()).toBe(start);
  });
});
