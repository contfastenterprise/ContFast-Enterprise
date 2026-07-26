import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Use Node.js environment (not browser/jsdom) — all tests are server-side
    environment: 'node',

    // Global test setup: makes describe/it/expect available without importing
    globals: true,

    // Only run files under src/tests/ ending with vitest.ts
    include: ['src/tests/**/*.vitest.ts'],

    // Coverage configuration (run with: pnpm test:coverage)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**',
        'src/db/schema/**',
        'src/db/migrate.ts',
        'src/db/run-migration.ts',
        'src/db/run-sql.ts',
        '**/*.d.ts',
      ],
      // Minimum thresholds — raise progressively as coverage improves
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10,
      },
    },

    // TypeScript path aliases matching tsconfig.json
    alias: {
      '@': path.resolve(__dirname, './src'),
    },

    // Timeout per test (ms) — generous for DB-hitting integration tests
    testTimeout: 30_000,
  },
});
