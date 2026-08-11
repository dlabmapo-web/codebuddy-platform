import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The palette lives in CSS, so this reads the CSS rather than a duplicate copy
 * in TypeScript. A table of colours no test can see is a table that drifts.
 */
const css = readFileSync(
  fileURLToPath(new URL('../../app/globals.css', import.meta.url)),
  'utf8',
);

/** Declarations of one rule, given the text that opens it. */
function declarationsAfter(opener: string): Record<string, string> {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`Rule not found in globals.css: ${opener}`);

  let depth = 0;
  let end = start;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = css.slice(css.indexOf('{', start) + 1, end);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const light = declarationsAfter(':root,\n.theme-light {');
const dark = declarationsAfter('.dark {');

function relativeLuminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Every pair a reader actually reads words through. Icon-only and decorative
 * pairings are left out: they answer to the 3:1 non-text bar, and folding them
 * in here would either weaken the assertion or fail it for the wrong reason.
 */
const textPairs: ReadonlyArray<readonly [string, string]> = [
  ['--ink', '--canvas'],
  ['--ink', '--card'],
  ['--ink', '--surface'],
  ['--sub', '--canvas'],
  ['--sub', '--card'],
  ['--sub', '--surface'],
  ['--brand', '--canvas'],
  ['--brand', '--card'],
  ['--brand', '--brand-soft'],
  ['--primary', '--card'],
  ['--success', '--card'],
  ['--danger', '--card'],
  ['--warning', '--card'],
  ['--peer', '--peer-soft'],
  ['--present', '--present-soft'],
  ['--draft', '--draft-soft'],
  ['--retired', '--retired-soft'],
  ['--unstable', '--unstable-soft'],
];

/** A filled swatch and the label token that names it. */
const fillPairs: ReadonlyArray<readonly [string, string]> = [
  ['--on-brand', '--brand'],
  ['--on-brand-panel', '--brand-panel'],
  ['--on-primary', '--primary'],
  ['--on-peer', '--peer'],
  ['--on-success', '--success'],
  ['--on-danger', '--danger'],
  ['--on-warning', '--warning'],
  ['--canvas', '--ink'],
];

/**
 * Known gaps, recorded rather than hidden.
 *
 * `primary` is the Cove brand orange. White on it is 3.94:1, short of the
 * 4.5:1 body-text bar at the 14–15px the buttons use. Closing it means moving
 * the brand colour — `#D13A12` reaches 4.86:1, and the existing
 * `primary-hover` `#C93A15` is already at 5.12:1 — which is a brand decision,
 * not a theming one. Open question 1 in
 * docs/superpowers/specs/2026-08-11-light-dark-theme-design.md.
 *
 * The floor still holds these pairs to their current value, so the gap cannot
 * quietly widen while it waits for an answer.
 */
const knownGaps: Record<string, number> = {
  'light:--primary:--card': 3.94,
  'light:--on-primary:--primary': 3.94,
};

describe.each([
  ['light', light],
  ['dark', dark],
])('%s palette', (themeName, palette) => {
  function assertReadable(
    foreground: string,
    background: string,
    themeLabel: string,
  ) {
    const ratio = contrast(palette[foreground], palette[background]);
    const floor = knownGaps[`${themeLabel}:${foreground}:${background}`] ?? 4.5;
    expect(
      ratio,
      `${themeLabel}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(floor);
  }

  it.each(textPairs)('%s on %s is readable', (foreground, background) => {
    assertReadable(foreground, background, themeName);
  });

  it.each(fillPairs)('%s on %s is readable', (foreground, background) => {
    assertReadable(foreground, background, themeName);
  });
});

describe('legacy scoping', () => {
  it('pins the v1-era groups to light through .theme-light', () => {
    // Those pages hold >1,200 hex colours in inline `style` props that no
    // class migration reaches. If a group ever loses the class, its tokenised
    // surfaces darken under near-black text.
    expect(css).toContain('.theme-light {');
  });
});

describe('palette structure', () => {
  it('defines the same tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
  });

  it('raises card above canvas in dark, since shadows do not read there', () => {
    expect(relativeLuminance(dark['--card'])).toBeGreaterThan(
      relativeLuminance(dark['--canvas']),
    );
    expect(relativeLuminance(light['--card'])).toBeGreaterThan(
      relativeLuminance(light['--canvas']),
    );
  });

  it('darkens the full-height brand plane rather than brightening it', () => {
    // The auth panel covers half the viewport. Every other brand token
    // lightens in dark so it can carry text; this one must go the other way,
    // or dark mode hands the reader a brighter screen than light mode did.
    expect(relativeLuminance(dark['--brand-panel'])).toBeLessThan(
      relativeLuminance(light['--brand-panel']),
    );
  });

  it('avoids pure white on pure black', () => {
    expect(dark['--ink'].toUpperCase()).not.toBe('#FFFFFF');
    expect(dark['--canvas'].toUpperCase()).not.toBe('#000000');
  });
});
