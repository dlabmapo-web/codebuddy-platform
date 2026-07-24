import { locales } from '@cove/i18n/settings';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = fileURLToPath(new URL('.', import.meta.url));
const input = [
  ...sourceFiles(join(webDir, 'src/app/(v2-auth)')),
  ...sourceFiles(join(webDir, 'src/app/(v2-studio)')),
  ...sourceFiles(join(webDir, 'src/components/studio')),
];

export default {
  locales: [...locales],
  defaultNamespace: 'common',
  input,
  output:
    process.env.I18N_OUTPUT ??
    '../i18n/src/locales/$LOCALE/$NAMESPACE.json',
  keySeparator: '.',
  namespaceSeparator: ':',
  pluralSeparator: '_',
  keepRemoved: false,
  lexers: {
    ts: [
      {
        lexer: 'JavascriptLexer',
        functions: ['t'],
        namespaceFunctions: [
          'getServerTranslation',
          'useLayoutTranslation',
          'useTranslation',
        ],
      },
    ],
    tsx: [
      {
        lexer: 'JsxLexer',
        functions: ['t'],
        namespaceFunctions: [
          'getServerTranslation',
          'useLayoutTranslation',
          'useTranslation',
        ],
        componentFunctions: ['Trans', 'LayoutTrans', 'ServerTrans'],
      },
    ],
  },
};

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
