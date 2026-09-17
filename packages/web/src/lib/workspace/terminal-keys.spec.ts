import { describe, expect, it } from 'vitest';

import {
  isEndOfInputKey,
  isImeComposing,
  isSubmitLineKey,
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
