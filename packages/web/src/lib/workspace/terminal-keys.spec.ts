import { describe, expect, it } from 'vitest';

import {
  isEndOfInputKey,
  isImeComposing,
  isSubmitLineKey,
  splitPastedInput,
} from './terminal-keys';

describe('isSubmitLineKey', () => {
  it('submits on a plain Enter', () => {
    expect(isSubmitLineKey({ key: 'Enter', keyCode: 13, isComposing: false })).toBe(true);
  });

  it('ignores the Enter that commits a Hangul syllable in Chromium', () => {
    expect(isSubmitLineKey({ key: 'Enter', keyCode: 229, isComposing: true })).toBe(false);
  });

  it('ignores it in Safari, where composition has already ended', () => {
    expect(isSubmitLineKey({ key: 'Enter', keyCode: 229, isComposing: false })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(isSubmitLineKey({ key: 'a', keyCode: 65 })).toBe(false);
  });
});

describe('isImeComposing', () => {
  it('is false for ordinary typing', () => {
    expect(isImeComposing({ key: 'a', keyCode: 65, isComposing: false })).toBe(false);
  });
});

describe('isEndOfInputKey', () => {
  it('accepts Ctrl+D in either case', () => {
    expect(isEndOfInputKey({ key: 'd', ctrlKey: true })).toBe(true);
    expect(isEndOfInputKey({ key: 'D', ctrlKey: true })).toBe(true);
  });

  it('leaves Cmd+D and modified variants to the browser', () => {
    expect(isEndOfInputKey({ key: 'd', metaKey: true })).toBe(false);
    expect(isEndOfInputKey({ key: 'd', ctrlKey: true, metaKey: true })).toBe(false);
    expect(isEndOfInputKey({ key: 'd', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(isEndOfInputKey({ key: 'd' })).toBe(false);
  });
});

describe('splitPastedInput', () => {
  const empty = { value: '', selectionStart: 0, selectionEnd: 0 };

  it('sends every complete line and keeps the last one for Enter', () => {
    expect(splitPastedInput({ ...empty, pasted: '4 6\n101111\n101010\n101011\n111011' }))
      .toEqual({ lines: ['4 6', '101111', '101010', '101011'], remainder: '111011' });
  });

  it('keeps the last line for Enter even when the copy ends with a line break', () => {
    expect(splitPastedInput({ ...empty, pasted: '2\n3 4\n' })).toEqual({ lines: ['2'], remainder: '3 4' });
    expect(splitPastedInput({ ...empty, pasted: '5 6\r\n1 1 0\r\n' })).toEqual({ lines: ['5 6'], remainder: '1 1 0' });
  });

  it('puts a single copied line in the field without sending it', () => {
    expect(splitPastedInput({ ...empty, pasted: '42\n' })).toEqual({ lines: [], remainder: '42' });
  });

  it('reads Windows and old Mac line breaks as line breaks', () => {
    expect(splitPastedInput({ ...empty, pasted: '1\r\n2\r3' })).toEqual({ lines: ['1', '2'], remainder: '3' });
  });

  it('keeps blank lines, which a program may read', () => {
    expect(splitPastedInput({ ...empty, pasted: 'a\n\nb' })).toEqual({ lines: ['a', ''], remainder: 'b' });
  });

  it('pastes at the caret, into what was already typed', () => {
    expect(splitPastedInput({ value: '8 ab', selectionStart: 2, selectionEnd: 2, pasted: 'x\ny\nz' }))
      .toEqual({ lines: ['8 x', 'y'], remainder: 'zab' });
  });

  it('replaces a selection', () => {
    expect(splitPastedInput({ value: 'old text', selectionStart: 0, selectionEnd: 8, pasted: '1\n2' }))
      .toEqual({ lines: ['1'], remainder: '2' });
  });

  it('leaves a paste without a line break to the browser', () => {
    expect(splitPastedInput({ ...empty, pasted: '1 2 3' })).toBeNull();
  });
});
