import { describe, expect, it } from 'vitest';
import { buildErrorFocus } from './errorFocus';

const CODE = [
  'Id = \'dlab\'',
  'if Id == userId:',
  'print("hi")',
].join('\n');

describe('buildErrorFocus', () => {
  it('points at the reported character on the reported line', () => {
    const focus = buildErrorFocus(CODE, 3, 1);
    expect(focus?.lineNo).toBe(3);
    expect(focus?.caretColumn).toBe(0);
    expect(buildErrorFocus(CODE, 2, 4)?.caretColumn).toBe(3);
  });

  it('shows the neighbouring lines so indentation can be compared', () => {
    expect(buildErrorFocus(CODE, 2, 1)?.lines).toEqual([
      { no: 1, text: 'Id = \'dlab\'', isError: false },
      { no: 2, text: 'if Id == userId:', isError: true },
      { no: 3, text: 'print("hi")', isError: false },
    ]);
  });

  it('omits blank neighbours instead of padding with empty rows', () => {
    const focus = buildErrorFocus('if x:\n\nprint(1)', 1, 1);
    expect(focus?.lines).toEqual([{ no: 1, text: 'if x:', isError: true }]);
  });

  it('keeps the window inside the file at the first and last line', () => {
    expect(buildErrorFocus(CODE, 1, 1)?.lines.map((item) => item.no)).toEqual([1, 2]);
    expect(buildErrorFocus(CODE, 3, 1)?.lines.map((item) => item.no)).toEqual([2, 3]);
  });

  it('keeps the caret under the right character when the line uses tabs', () => {
    // 탭 하나는 4칸으로 펼쳐지므로 원본 2번째 글자는 화면상 5번째 칸이다.
    const focus = buildErrorFocus('\tprint(1)', 1, 2);
    expect(focus?.lines[0].text).toBe('    print(1)');
    expect(focus?.caretColumn).toBe(4);
  });

  it('lines the caret up after a mix of tabs and spaces', () => {
    const focus = buildErrorFocus('  \tif x:', 1, 4);
    expect(focus?.lines[0].text).toBe('    if x:');
    expect(focus?.caretColumn).toBe(4);
  });

  it('expands tabs on the neighbouring lines too', () => {
    const focus = buildErrorFocus('if x:\n\tprint(1)', 2, 1);
    expect(focus?.lines[1].text).toBe('    print(1)');
  });

  it('clamps an offset that points past the end of the line', () => {
    expect(buildErrorFocus(CODE, 1, 99)?.caretColumn).toBe('Id = \'dlab\''.length);
  });

  it('returns the line without a caret when python reports no column', () => {
    expect(buildErrorFocus(CODE, 2, null)?.caretColumn).toBeNull();
    expect(buildErrorFocus(CODE, 2, 0)?.caretColumn).toBeNull();
  });

  it('gives up when there is no usable location', () => {
    expect(buildErrorFocus(CODE, null, 1)).toBeNull();
    expect(buildErrorFocus(CODE, 0, 1)).toBeNull();
    expect(buildErrorFocus(CODE, 99, 1)).toBeNull();
    expect(buildErrorFocus('', 1, 1)).toBeNull();
  });

  it('normalizes CRLF so the reported line number still matches', () => {
    expect(buildErrorFocus('a = 1\r\nb = 2', 2, 1)?.lines[1].text).toBe('b = 2');
  });
});
