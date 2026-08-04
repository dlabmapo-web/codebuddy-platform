/**
 * 외부(엘리스 등)에서 가져온 문제 설명 HTML 정리.
 *
 * 가져온 HTML은 `<pre style="background:#f6f7f9">`처럼 라이트 테마 색을 인라인으로
 * 들고 온다. 인라인 스타일은 스타일시트를 이기므로 배경만 밝게 바뀌고 글자색은 테마
 * 값이 그대로 남아, 밝은 배경 위의 밝은 글자가 되어 읽을 수 없다.
 *
 * 배치(여백·정렬·크기)는 그대로 두고 테마에 종속된 색 선언만 제거한다.
 * 저자가 의도적으로 넣은 span/a 의 글자색은 건드리지 않는다.
 */

/** 가져온 HTML에서만 나타나는 요소들 — 편집기로는 이 태그에 스타일을 넣을 수 없다. */
const THEME_LOCKED_TAGS = ['pre', 'blockquote', 'div', 'hr'] as const;

/** border-radius 처럼 색과 무관한 속성은 이름이 달라 걸리지 않는다. */
const PRESENTATION_PROPERTIES = new Set([
  'background',
  'background-color',
  'border',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-color',
  'color',
]);

function stripDeclarations(style: string): string {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => {
      const property = declaration.split(':')[0].trim().toLowerCase();
      return !PRESENTATION_PROPERTIES.has(property);
    })
    .join(';');
}

export function stripThemeLockedStyles(html: string): string {
  if (!html) return html;

  const pattern = new RegExp(
    `<(${THEME_LOCKED_TAGS.join('|')})([^>]*?)\\sstyle="([^"]*)"([^>]*)>`,
    'gi',
  );

  return html.replace(pattern, (match, tag, before, style, after) => {
    const kept = stripDeclarations(style);
    if (kept === style.trim()) return match;
    return kept
      ? `<${tag}${before} style="${kept}"${after}>`
      : `<${tag}${before}${after}>`;
  });
}
