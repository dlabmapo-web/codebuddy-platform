import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      'server-only': fileURLToPath(
        new URL('./src/test/serverOnlyStub.ts', import.meta.url),
      ),
    },
  },
});
