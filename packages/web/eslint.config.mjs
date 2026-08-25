import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/app/(auth)/**/*.{ts,tsx}",
      "src/app/(studio)/**/*.{ts,tsx}",
      "src/components/studio/**/*.{ts,tsx}",
    ],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-components": {
            include: [],
            exclude: ["Trans", "LayoutTrans", "ServerTrans"],
          },
        },
      ],
    },
  },
  {
    files: ["src/app/(auth)/auth/_components/code-preview.tsx"],
    rules: {
      // This component intentionally renders a Python source-code sample.
      "i18next/no-literal-string": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Vendored third-party assets. `pyodide.asm.js` alone is 1.2 MB of
    // generated Emscripten output; linting it is slow and its findings are not
    // actionable.
    "public/**",

    // V1, frozen until removal.
    //
    // The v2 migration rule is that v1 keeps working and is not modified, so
    // lint findings here can never be acted on — they would only keep CI red
    // and train everyone to ignore it. These entries are deleted along with the
    // v1 surface itself. Anything under `(v2-*)` stays fully linted.
    "src/app/(admin)/**",
    "src/app/(auth)/**",
    "src/app/(fullscreen)/**",
    "src/app/(student)/**",
    "src/app/(teacher)/**",
    // Listed individually rather than as `src/app/api/**` so that new v2 BFF
    // routes under the same parent stay linted.
    "src/app/api/admin/**",
    "src/app/api/ai-feedbacks/**",
    "src/app/api/auth/**",
    "src/app/api/curriculum/**",
    "src/app/api/feedbacks/**",
    "src/app/api/health/**",
    "src/app/api/hints/**",
    "src/app/api/problems/**",
    "src/app/api/progress/**",
    "src/app/api/sessions/**",
    "src/app/api/setup/**",
    "src/app/api/students/**",
    "src/app/api/submissions/**",
    "src/app/api/teacher/**",
    "src/app/api/uploads/**",
    "src/components/admin/**",
    "src/components/charts/**",
    "src/components/collab/**",
    "src/components/dashboard/**",
    "src/components/demo/**",
    "src/components/editor/**",
    "src/components/layout/**",
  ]),
]);

export default eslintConfig;
