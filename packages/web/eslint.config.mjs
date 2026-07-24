import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/app/(v2-auth)/**/*.{ts,tsx}",
      "src/app/(v2-studio)/**/*.{ts,tsx}",
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
    files: ["src/app/(v2-auth)/auth/_components/code-preview.tsx"],
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
  ]),
]);

export default eslintConfig;
