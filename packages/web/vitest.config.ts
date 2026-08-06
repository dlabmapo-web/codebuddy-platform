import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Unit tests run without Next's compiler, so the `@/` alias it resolves has to
 * be spelled out here. Everything else is the default: these are pure-function
 * suites, and a browser environment they do not use would only slow them down.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
