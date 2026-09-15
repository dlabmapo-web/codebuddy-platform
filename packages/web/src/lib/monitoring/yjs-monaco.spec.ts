import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { editorDouble, MonacoModelDouble } from './monaco-model-double';
import {
  bindYTextToMonaco,
  repairSharedText,
  type MonacoCodeEditor,
} from './yjs-monaco';

function asEditor(model: MonacoModelDouble): MonacoCodeEditor {
  return editorDouble(model) as unknown as MonacoCodeEditor;
}

/**
 * Two browsers, wired the way the socket wires them: each document relays its
 * own updates and applies the other's under a `peer` origin, so neither echoes.
 */
function connect(left: Y.Doc, right: Y.Doc): void {
  const relay = (to: Y.Doc) => (update: Uint8Array, origin: unknown) => {
    if (origin === 'peer') return;
    Y.applyUpdate(to, update, 'peer');
  };
  left.on('update', relay(right));
  right.on('update', relay(left));
  Y.applyUpdate(right, Y.encodeStateAsUpdate(left), 'peer');
  Y.applyUpdate(left, Y.encodeStateAsUpdate(right), 'peer');
}

/** The exercise from the report, as the migrated curriculum stores it. */
const starterCrlf = [
  "beat1 = '덩덕'",
  "beat2 = '쿵덕'",
  'hello',
  '',
  '',
  '',
  '# ① 문자열 병합하기',
].join('\r\n');

/**
 * One student and one teacher on one exercise.
 *
 * `teacherFirst` is the ordinary production order — the teacher's editor mounts
 * and binds long before the socket answers with a document — and is the order
 * under which the reported fault appeared.
 */
function session({ teacherFirst = true }: { teacherFirst?: boolean } = {}) {
  const studentModel = new MonacoModelDouble(starterCrlf);
  const teacherModel = new MonacoModelDouble('');
  const studentDoc = new Y.Doc();
  const teacherDoc = new Y.Doc();
  connect(studentDoc, teacherDoc);

  const bindTeacher = () =>
    bindYTextToMonaco(teacherDoc.getText('code'), asEditor(teacherModel));
  const bindStudent = () =>
    bindYTextToMonaco(studentDoc.getText('code'), asEditor(studentModel), {
      seed: 'model',
    });

  const teacher = teacherFirst ? bindTeacher() : null;
  const student = bindStudent();
  return {
    studentModel,
    teacherModel,
    studentDoc,
    teacherDoc,
    student,
    teacher: teacher ?? bindTeacher(),
  };
}

/** What both editors must always be able to say together. */
function expectAgreement(
  studentModel: MonacoModelDouble,
  teacherModel: MonacoModelDouble,
): string {
  const value = studentModel.getValue();
  expect(teacherModel.getValue()).toBe(value);
  expect(value).not.toContain('\r');
  return value;
}

describe('bindYTextToMonaco line endings', () => {
  it('puts the student typing on line 4 on the teacher line 4', () => {
    // The reported fault exactly: `hi` reached the teacher three characters
    // late — one per line above the caret — and appeared on line 7.
    const { studentModel, teacherModel } = session();

    studentModel.typeAt({ lineNumber: 4, column: 1 }, 'hi');

    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n')[3]).toBe('hi');
    expect(value.split('\n')[6]).toBe('# ① 문자열 병합하기');
  });

  it('agrees whichever side binds first', () => {
    const late = session({ teacherFirst: false });
    late.studentModel.typeAt({ lineNumber: 4, column: 1 }, 'hi');
    expect(expectAgreement(late.studentModel, late.teacherModel).split('\n')[3]).toBe(
      'hi',
    );
  });

  it('pins both models to LF and keeps the document canonical', () => {
    const { studentModel, teacherModel, studentDoc } = session();
    expect(studentModel.getEOL()).toBe('\n');
    expect(teacherModel.getEOL()).toBe('\n');
    expect(studentDoc.getText('code').toString()).not.toContain('\r');
  });

  it('keeps agreeing as the edit moves further down the file', () => {
    // The drift grew by one character per line above the caret, so an edit
    // deep in the file is where a partial fix would still show.
    const { studentModel, teacherModel } = session();
    studentModel.typeAt({ lineNumber: 7, column: 1 }, 'deep ');
    expectAgreement(studentModel, teacherModel);
    expect(studentModel.getValue().split('\n')[6]).toBe('deep # ① 문자열 병합하기');
  });

  it('carries a delete spanning a line break', () => {
    const { studentModel, teacherModel } = session();
    studentModel.deleteBetween(
      { lineNumber: 2, column: 13 },
      { lineNumber: 3, column: 6 },
    );
    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n')[1]).toBe("beat2 = '쿵덕'");
  });

  it('carries a multiline paste', () => {
    const { studentModel, teacherModel } = session();
    studentModel.typeAt({ lineNumber: 4, column: 1 }, 'one\ntwo\nthree');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n').slice(3, 6)).toEqual(['one', 'two', 'three']);
  });

  it('carries a teacher edit back to the student at the same position', () => {
    const { studentModel, teacherModel } = session();
    teacherModel.typeAt({ lineNumber: 3, column: 6 }, '!');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n')[2]).toBe('hello!');
  });

  it('converges on concurrent edits from both sides', () => {
    const { studentModel, teacherModel } = session();
    studentModel.typeAt({ lineNumber: 1, column: 1 }, 'S');
    teacherModel.typeAt({ lineNumber: 7, column: 1 }, 'T');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n')[0]).toBe("Sbeat1 = '덩덕'");
    expect(value.split('\n')[6]).toBe('T# ① 문자열 병합하기');
  });

  it('handles surrogate pairs on both sides of an edit', () => {
    const studentModel = new MonacoModelDouble('🙂🙃\r\nsecond');
    const teacherModel = new MonacoModelDouble('');
    const studentDoc = new Y.Doc();
    const teacherDoc = new Y.Doc();
    connect(studentDoc, teacherDoc);
    bindYTextToMonaco(teacherDoc.getText('code'), asEditor(teacherModel));
    bindYTextToMonaco(studentDoc.getText('code'), asEditor(studentModel), {
      seed: 'model',
    });

    studentModel.typeAt({ lineNumber: 2, column: 1 }, '🎉');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value).toBe('🙂🙃\n🎉second');
  });

  it.each([
    ['LF', 'a\nb\nc'],
    ['CRLF', 'a\r\nb\r\nc'],
    ['lone CR', 'a\rb\rc'],
    ['mixed', 'a\r\nb\rc\nd'],
    ['trailing blank lines', 'a\r\n\r\n\r\n'],
    ['empty', ''],
    ['no line break', 'print()'],
  ])('reaches agreement seeded from %s text', (_label, source) => {
    const studentModel = new MonacoModelDouble(source);
    const teacherModel = new MonacoModelDouble('');
    const studentDoc = new Y.Doc();
    const teacherDoc = new Y.Doc();
    connect(studentDoc, teacherDoc);
    bindYTextToMonaco(teacherDoc.getText('code'), asEditor(teacherModel));
    bindYTextToMonaco(studentDoc.getText('code'), asEditor(studentModel), {
      seed: 'model',
    });

    studentModel.typeAt({ lineNumber: 1, column: 1 }, 'x');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value).toBe(`x${source.replace(/\r\n?/g, '\n')}`);
  });
});

describe('bindYTextToMonaco repairing a stored document', () => {
  it('normalizes a document that already holds CRLF, and shows the repair', () => {
    // What a teacher joining a draft written before the rule actually finds.
    const doc = new Y.Doc();
    doc.getText('code').insert(0, 'a\r\nb\r\nc');
    const model = new MonacoModelDouble('');

    bindYTextToMonaco(doc.getText('code'), asEditor(model));

    expect(doc.getText('code').toString()).toBe('a\nb\nc');
    expect(model.getValue()).toBe('a\nb\nc');
    expect(model.getEOL()).toBe('\n');
  });

  it('never leaves the rendered text and the document disagreeing', () => {
    const doc = new Y.Doc();
    doc.getText('code').insert(0, 'x\ry\r\nz');
    const model = new MonacoModelDouble('');
    bindYTextToMonaco(doc.getText('code'), asEditor(model));
    expect(model.getValue()).toBe(doc.getText('code').toString());
  });
});

describe('bindYTextToMonaco bookkeeping', () => {
  it('gives each binding its own origin, so two on one document still track', () => {
    // A shared module-wide marker makes each binding ignore the other's
    // transactions, and the two models silently stop following each other.
    const doc = new Y.Doc();
    const left = new MonacoModelDouble('start\n');
    const right = new MonacoModelDouble('');
    bindYTextToMonaco(doc.getText('code'), asEditor(left), { seed: 'model' });
    bindYTextToMonaco(doc.getText('code'), asEditor(right));

    left.typeAt({ lineNumber: 1, column: 1 }, 'L');
    expect(right.getValue()).toBe('Lstart\n');

    right.typeAt({ lineNumber: 2, column: 1 }, 'R');
    expect(left.getValue()).toBe('Lstart\nR');
  });

  it('does not report an EOL-only change as an edit', () => {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble('a\r\nb');
    let localChanges = 0;
    bindYTextToMonaco(doc.getText('code'), asEditor(model), {
      seed: 'model',
      onLocalChange: () => {
        localChanges += 1;
      },
    });
    const before = doc.getText('code').toString();

    model.setEOL(1);
    model.setEOL(0);

    expect(localChanges).toBe(0);
    expect(doc.getText('code').toString()).toBe(before);
  });

  it('rebinding with the document as the seed does not republish the model', () => {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble('first\n');
    const first = bindYTextToMonaco(doc.getText('code'), asEditor(model), {
      seed: 'model',
    });
    first.destroy();
    // The peer moved on while this client was unbound.
    doc.getText('code').insert(0, 'peer ');

    bindYTextToMonaco(doc.getText('code'), asEditor(model));

    expect(model.getValue()).toBe('peer first\n');
    expect(doc.getText('code').toString()).toBe('peer first\n');
  });

  it('stops writing to the document once destroyed', () => {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble('keep\n');
    const binding = bindYTextToMonaco(doc.getText('code'), asEditor(model), {
      seed: 'model',
    });
    binding.destroy();

    model.typeAt({ lineNumber: 1, column: 1 }, 'ignored ');

    expect(doc.getText('code').toString()).toBe('keep\n');
  });

  it('replaces the whole document for Reset, on both peers', () => {
    const { studentModel, teacherModel, student } = session();
    student.replace('print()\r\n');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value).toBe('print()\n');
  });
});

describe('bindYTextToMonaco against a whole-model write', () => {
  it('re-pins and republishes rather than mapping offsets into a rebuilt buffer', () => {
    // `setValue` rebuilds the buffer and re-derives its line ending, so the
    // model can leave the document's offset space between one edit and the
    // next. Nothing in the workspace writes to a bound model this way; this is
    // what holds the invariant if anything does.
    const { studentModel, teacherModel } = session();

    studentModel.setValue("first = '덩덕'\r\nsecond\r\n\r\npasted");

    expect(studentModel.getEOL()).toBe('\n');
    const value = expectAgreement(studentModel, teacherModel);
    expect(value).toBe("first = '덩덕'\nsecond\n\npasted");
  });

  it('still tracks ordinary edits after one', () => {
    const { studentModel, teacherModel } = session();
    studentModel.setValue('one\r\ntwo\r\nthree\r\nfour');

    studentModel.typeAt({ lineNumber: 4, column: 1 }, 'hi');

    const value = expectAgreement(studentModel, teacherModel);
    expect(value.split('\n')[3]).toBe('hifour');
  });
});

describe('bindYTextToMonaco against a peer that still sends CRLF', () => {
  /**
   * One browser, one document, and the server in between.
   *
   * The server normalizes every update it accepts and broadcasts the repair,
   * so `repair()` here stands in for exactly that. The client never repairs on
   * its own: two clients each editing out the same carriage return is how a
   * lone one becomes two line breaks.
   */
  function room(initial = '') {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble(initial);
    const binding = bindYTextToMonaco(doc.getText('code'), asEditor(model), {
      seed: initial === '' ? 'text' : 'model',
    });
    return {
      doc,
      model,
      binding,
      /** An older client's edit, arriving through the room. */
      receive(write: (text: Y.Text) => void) {
        const peer = new Y.Doc();
        Y.applyUpdate(peer, Y.encodeStateAsUpdate(doc));
        write(peer.getText('code'));
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer), 'peer');
      },
      /** What the server sends back once it has normalized the document. */
      repair() {
        const server = new Y.Doc();
        Y.applyUpdate(server, Y.encodeStateAsUpdate(doc));
        repairSharedText(server.getText('code'), 'server');
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(server), 'peer');
      },
    };
  }

  it('never lets the model misrepresent the document', () => {
    const { doc, model, receive } = room();
    receive((text) => text.insert(0, 'a\r\nb'));
    // The model cannot hold the carriage return, so it shows what the document
    // means rather than a string one character short of it.
    expect(doc.getText('code').toString()).toBe('a\r\nb');
    expect(model.getValue()).toBe('a\nb');
    expect(model.getEOL()).toBe('\n');
  });

  it('does not delete the wrong character when the repair arrives', () => {
    // The reported failure: Y.Text "a\nb" against Monaco "ab".
    const { doc, model, receive, repair } = room();
    receive((text) => text.insert(0, 'a\r\nb'));
    repair();
    expect(doc.getText('code').toString()).toBe('a\nb');
    expect(model.getValue()).toBe('a\nb');
    expect(model.getValue()).not.toBe('ab');
  });

  it('handles a lone carriage return the same way', () => {
    const { doc, model, receive, repair } = room();
    receive((text) => text.insert(0, 'x\ry'));
    expect(model.getValue()).toBe('x\ny');
    repair();
    expect(doc.getText('code').toString()).toBe('x\ny');
    expect(model.getValue()).toBe('x\ny');
  });

  it('resumes applying deltas incrementally once the document is canonical', () => {
    const { doc, model, receive, repair } = room();
    receive((text) => text.insert(0, 'one\r\ntwo'));
    repair();
    receive((text) => text.insert(text.length, '\nthree'));
    expect(model.getValue()).toBe(doc.getText('code').toString());
    expect(model.getValue()).toBe('one\ntwo\nthree');
  });

  it('keeps a local edit and the document describing the same string', () => {
    const { doc, model, receive, repair } = room('base\n');
    receive((text) => text.insert(0, 'old\r\n'));
    repair();
    expect(model.getValue()).toBe('old\nbase\n');

    model.typeAt({ lineNumber: 2, column: 1 }, 'next ');
    expect(doc.getText('code').toString()).toBe('old\nnext base\n');
    expect(model.getValue()).toBe(doc.getText('code').toString());
  });

  it('leaves two bound editors in agreement after the repair', () => {
    const studentModel = new MonacoModelDouble('base\n');
    const teacherModel = new MonacoModelDouble('');
    const studentDoc = new Y.Doc();
    const teacherDoc = new Y.Doc();
    connect(studentDoc, teacherDoc);
    bindYTextToMonaco(teacherDoc.getText('code'), asEditor(teacherModel));
    bindYTextToMonaco(studentDoc.getText('code'), asEditor(studentModel), {
      seed: 'model',
    });

    // An older build writes into the shared document. Not under the `peer`
    // origin the harness relays with, so it travels on as a real one would.
    const old = new Y.Doc();
    Y.applyUpdate(old, Y.encodeStateAsUpdate(studentDoc));
    old.getText('code').insert(0, 'old\r\n');
    Y.applyUpdate(studentDoc, Y.encodeStateAsUpdate(old), 'old-client');

    // Both editors render the document's meaning while it is not canonical.
    expect(studentModel.getValue()).toBe('old\nbase\n');
    expect(teacherModel.getValue()).toBe('old\nbase\n');

    // The server repairs once, for everyone.
    const server = new Y.Doc();
    Y.applyUpdate(server, Y.encodeStateAsUpdate(studentDoc));
    repairSharedText(server.getText('code'), 'server');
    Y.applyUpdate(studentDoc, Y.encodeStateAsUpdate(server), 'server');

    expect(studentDoc.getText('code').toString()).toBe('old\nbase\n');
    expectAgreement(studentModel, teacherModel);

    studentModel.typeAt({ lineNumber: 2, column: 1 }, 'next ');
    expect(expectAgreement(studentModel, teacherModel)).toBe('old\nnext base\n');
  });
});


describe('local input while a server CR repair is pending', () => {
  it('keeps a typed character after the intended character', () => {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble('');
    const binding = bindYTextToMonaco(doc.getText('code'), asEditor(model));
    doc.getText('code').insert(0, 'a\r\nb');
    model.typeAt({ lineNumber: 2, column: 2 }, 'X');
    repairSharedText(doc.getText('code'), 'server');
    expect(doc.getText('code').toString()).toBe('a\nbX');
    expect(model.getValue()).toBe('a\nbX');
    binding.destroy();
  });

  it('maps both ends of a deletion across pending CRLF', () => {
    const doc = new Y.Doc();
    const model = new MonacoModelDouble('');
    const binding = bindYTextToMonaco(doc.getText('code'), asEditor(model));
    doc.getText('code').insert(0, 'ab\r\ncd\r\nef');
    model.deleteBetween({ lineNumber: 1, column: 2 }, { lineNumber: 3, column: 2 });
    repairSharedText(doc.getText('code'), 'server');
    expect(doc.getText('code').toString()).toBe('af');
    expect(model.getValue()).toBe('af');
    binding.destroy();
  });
});
