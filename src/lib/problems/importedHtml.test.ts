import { describe, expect, it } from 'vitest';
import { stripThemeLockedStyles } from './importedHtml';

describe('stripThemeLockedStyles', () => {
  it('drops the imported code block colors but keeps its layout', () => {
    const input = '<pre style="margin:0 0 16px;padding:14px;background:#f6f7f9;border:1px solid #e5e8ec;border-radius:6px;overflow-x:auto;white-space:pre;"><code>num = 100</code></pre>';

    expect(stripThemeLockedStyles(input)).toBe(
      '<pre style="margin:0 0 16px;padding:14px;border-radius:6px;overflow-x:auto;white-space:pre"><code>num = 100</code></pre>',
    );
  });

  it('drops blockquote background and rule colour', () => {
    const input = '<blockquote style="margin:14px 0;padding:10px 14px;border-left:4px solid #d7dce2;background:#f6f7f9;"><p>본문</p></blockquote>';

    expect(stripThemeLockedStyles(input)).toBe(
      '<blockquote style="margin:14px 0;padding:10px 14px"><p>본문</p></blockquote>',
    );
  });

  it('removes the wrapper text colour without losing typography', () => {
    const input = '<div style="font-size:14px;line-height:1.75;color:#16181d;">본문</div>';

    expect(stripThemeLockedStyles(input)).toBe(
      '<div style="font-size:14px;line-height:1.75">본문</div>',
    );
  });

  it('removes the style attribute entirely when nothing is left', () => {
    expect(stripThemeLockedStyles('<hr style="border:0;border-top:1px solid #e5e8ec;">'))
      .toBe('<hr>');
    expect(stripThemeLockedStyles('<hr style="border:0;border-top:1px solid #e5e8ec;margin:28px 0;">'))
      .toBe('<hr style="margin:28px 0">');
  });

  it('keeps colours an author chose on inline elements', () => {
    const input = '<p><span style="color:#DC2626">주의</span> <a href="/x" style="color:var(--color-primary)">링크</a></p>';
    expect(stripThemeLockedStyles(input)).toBe(input);
  });

  it('leaves markup without theme-locked styles untouched', () => {
    const input = '<pre><code>print(1)</code></pre><p style="text-align: center;">가운데</p>';
    expect(stripThemeLockedStyles(input)).toBe(input);
  });

  it('preserves other attributes on the element it cleans', () => {
    const input = '<div class="note" style="color:#16181d;padding:4px" data-id="7">본문</div>';
    expect(stripThemeLockedStyles(input)).toBe(
      '<div class="note" style="padding:4px" data-id="7">본문</div>',
    );
  });

  it('handles empty and missing descriptions', () => {
    expect(stripThemeLockedStyles('')).toBe('');
  });
});
