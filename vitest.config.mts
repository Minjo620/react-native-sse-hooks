import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/index.ts', 'src/types.ts'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 70,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
    restoreMocks: true,
  },
});
