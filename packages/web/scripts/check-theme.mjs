/**
 * Fails on colours that cannot follow the theme.
 *
 * The token layer only works if component code goes through it. One
 * `bg-white` renders a white card on a dark page, and nothing in review
 * reliably catches the twentieth one. This is the guard that keeps
 * docs/superpowers/specs/2026-08-11-light-dark-theme-design.md true a year
 * from now.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const webDir = resolve(import.meta.dirname, '..');
const sourceDir = resolve(webDir, 'src');

/**
 * Code surfaces — the editor, the terminal, the result panes — are dark in
 * both themes by design, so their literal hex and translucent whites are
 * correct rather than missed. Listed file by file so adding one is a decision.
 */
const darkSurfaces = new Set(
  [
    'app/(auth)/auth/_components/code-preview.tsx',
    'app/(studio)/studio/academies/[academyId]/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/starter-code-editor.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/code-editor.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/editor-pane.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/error-coach-panel.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/result-hero.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/result-metrics.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/result-panel.tsx',
    'app/(studio)/studio/academies/[academyId]/learn/exercises/[materialId]/_components/test-result-list.tsx',
    'app/(studio)/studio/academies/[academyId]/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/authoring-fields.tsx',
    'app/(studio)/studio/academies/[academyId]/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/preview-modal.tsx',
    'app/(studio)/studio/academies/[academyId]/teach/classes/[classId]/students/[membershipId]/live/_components/live-editor.tsx',
    'app/(studio)/studio/academies/[academyId]/teach/classes/[classId]/students/[membershipId]/live/_components/live-output.tsx',
    'app/(studio)/studio/academies/[academyId]/teach/classes/[classId]/students/[membershipId]/live/_components/preview-editor.tsx',
    'app/(studio)/studio/academies/[academyId]/teach/classes/[classId]/students/[membershipId]/live/_components/student-run-panel.tsx',
    'components/workspace/example-card.tsx',
    'components/workspace/font-size-controls.tsx',
    'components/workspace/run-controls.tsx',
    'components/workspace/terminal-panel.tsx',
  ].map((path) => path.replaceAll('/', sep)),
);

/**
 * The v1-era surfaces predate the token system and are slated for removal with
 * the v1 cutover. They are checked for `bg-white`, which the migration did
 * convert, but not for the arbitrary hex that was always there — much of which
 * lives in inline `style` props this check cannot reach anyway.
 *
 * `components/admin` and `components/charts` are listed because the v1 admin
 * pages are their only consumers.
 */
const legacyGroups = [
  '(admin)',
  '(auth)',
  '(fullscreen)',
  '(student)',
  '(teacher)',
  join('components', 'admin'),
  join('components', 'charts'),
];

/**
 * Escape hatch for a file that is mostly light chrome but embeds a dark pane —
 * the live workspace, for instance. Per-line, so the rest of the file stays
 * covered, unlike adding it to `darkSurfaces` wholesale.
 */
const IGNORE = 'theme-lint-ignore';

const rules = [
  {
    name: 'bg-white',
    // `bg-white/N` on a dark code surface is a legitimate overlay; the bare
    // form never is.
    pattern: /\b(?:hover:|focus:|active:|data-\[[^\]]+\]:)?(?:bg|border)-white\b(?!\/)/g,
    fix: 'use bg-card / border-card',
    legacy: true,
  },
  {
    name: 'raw palette scale',
    pattern: /\b(?:bg|text|border|ring|fill|stroke)-(?:gray|slate|zinc|neutral|stone)-\d{2,3}\b/g,
    fix: 'use a Cove token (ink, sub, border, muted, accent, retired…)',
    legacy: true,
  },
  {
    name: 'arbitrary hex',
    pattern: /\b(?:bg|text|border|ring|fill|stroke|shadow|from|via|to)-\[#[0-9A-Fa-f]{3,8}\]/g,
    fix: 'add a token in globals.css, or add the file to darkSurfaces',
    legacy: false,
  },
];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* sourceFiles(full);
    } else if (
      // `.ts` as well as `.tsx`: class strings also live in plain modules —
      // `lib/workspace/navigator-geometry.ts` held a `bg-white` that shipped a
      // white curriculum panel into dark mode precisely because an earlier
      // version of this check only walked components.
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.spec.tsx')
    ) {
      yield full;
    }
  }
}

const violations = [];
for (const file of sourceFiles(sourceDir)) {
  const rel = relative(sourceDir, file);
  if (darkSurfaces.has(rel)) continue;
  const isLegacy = legacyGroups.some((group) => rel.includes(group));

  const lines = readFileSync(file, 'utf8').split('\n');
  for (const rule of rules) {
    if (isLegacy && !rule.legacy) continue;
    lines.forEach((line, index) => {
      if (line.includes(IGNORE) || lines[index - 1]?.includes(IGNORE)) return;
      for (const match of line.matchAll(rule.pattern)) {
        violations.push(`${rel}:${index + 1}  ${match[0]}  — ${rule.fix}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error(
    `Found ${violations.length} colour${violations.length === 1 ? '' : 's'} that cannot follow the theme:\n`,
  );
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(
    '\nSee docs/superpowers/specs/2026-08-11-light-dark-theme-design.md §7.',
  );
  process.exit(1);
}

console.log('Theme check passed: every colour goes through a token.');
