import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const webDir = resolve(import.meta.dirname, '..');
const localesDir = resolve(webDir, '../i18n/src/locales');
const temporaryRoot = mkdtempSync(join(tmpdir(), 'cove-i18n-check-'));
const extractedDir = join(temporaryRoot, 'locales');
const sourceRoots = [
  resolve(webDir, 'src/app/(auth)'),
  resolve(webDir, 'src/app/(studio)'),
  resolve(webDir, 'src/components/studio'),
];

try {
  cpSync(localesDir, extractedDir, { recursive: true });

  const extraction = spawnSync(
    'pnpm',
    ['exec', 'i18next', '--config', 'i18next-parser.config.mjs'],
    {
      cwd: webDir,
      encoding: 'utf8',
      env: {
        ...process.env,
        I18N_OUTPUT: join(extractedDir, '$LOCALE', '$NAMESPACE.json'),
      },
    },
  );

  if (extraction.status !== 0) {
    process.stderr.write(extraction.stdout);
    process.stderr.write(extraction.stderr);
    process.exitCode = extraction.status ?? 1;
  } else {
    const problems = [
      ...findStaleKeys(localesDir, extractedDir),
      ...findCopyMarkers(localesDir),
    ];
    if (problems.length > 0) {
      process.stderr.write(`${problems.join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('i18n catalogs contain no stale keys or copy markers.\n');
    }
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function findStaleKeys(currentRoot, extractedRoot) {
  const problems = [];
  const extractedKeys = new Set();
  for (const locale of readdirSync(extractedRoot)) {
    for (const file of readdirSync(join(extractedRoot, locale)).filter((name) =>
      name.endsWith('.json'),
    )) {
      for (const key of logicalKeys(readJson(join(extractedRoot, locale, file)))) {
        extractedKeys.add(key);
      }
    }
  }
  const { literals, templatePrefixes } = sourceKeyHints(sourceRoots);

  for (const locale of readdirSync(currentRoot)) {
    const localeDir = join(currentRoot, locale);
    for (const file of readdirSync(localeDir).filter((name) => name.endsWith('.json'))) {
      // Application error keys are intentionally dynamic and are guarded by
      // the AppErrorCode exhaustive type assertion instead of parser output.
      if (file === 'errors.json') continue;
      const current = logicalKeys(readJson(join(localeDir, file)));
      const stale = [...current]
        .filter(
          (key) =>
            !extractedKeys.has(key) &&
            !literals.has(key) &&
            !templatePrefixes.some((prefix) => key.startsWith(`${prefix}.`)),
        )
        .sort();
      for (const key of stale) {
        problems.push(`Stale translation key: ${locale}/${file}:${key}`);
      }
    }
  }
  return problems;
}

function sourceKeyHints(roots) {
  const literals = new Set();
  const templatePrefixes = [];
  for (const root of roots) {
    for (const path of sourceFiles(root)) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/['"`](?:[a-z]+:)?([A-Za-z0-9_.-]+)['"`]/g)) {
        literals.add(match[1]);
      }
      for (const match of source.matchAll(/`(?:[a-z]+:)?([A-Za-z0-9_.-]+)\.\$\{/g)) {
        templatePrefixes.push(match[1]);
      }
    }
  }
  return { literals, templatePrefixes };
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function findCopyMarkers(root) {
  const problems = [];
  for (const locale of readdirSync(root)) {
    for (const file of readdirSync(join(root, locale)).filter((name) =>
      name.endsWith('.json'),
    )) {
      const values = scalarEntries(readJson(join(root, locale, file)));
      for (const [key, value] of values) {
        if (typeof value === 'string' && /\b(?:TODO|TBD)\b/i.test(value)) {
          problems.push(`Unresolved copy marker: ${locale}/${file}:${key}`);
        }
      }
    }
  }
  return problems;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function logicalKeys(value, prefix = '') {
  return new Set(
    scalarEntries(value, prefix).map(([key]) =>
      key.replace(/_(zero|one|two|few|many|other)$/, ''),
    ),
  );
}

function scalarEntries(value, prefix = '') {
  const result = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      result.push(...scalarEntries(child, path));
    } else {
      result.push([path, child]);
    }
  }
  return result;
}
