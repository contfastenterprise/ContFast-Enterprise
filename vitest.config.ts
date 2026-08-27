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
      // Umbrales de cobertura.
      //
      // Los globales actuan como trinquete: estan justo por debajo de la
      // cobertura real de hoy, de modo que cualquier bajada rompe la build.
      // Hay que SUBIRLOS conforme se anadan pruebas, no bajarlos.
      // (Antes estaban en 10 con una cobertura real del 0,96%, asi que
      // `pnpm test:coverage` fallaba siempre y nadie lo ejecutaba.)
      //
      // Los umbrales por archivo protegen de verdad lo que si esta probado:
      // si alguien toca el calculo de facturacion o de nomina y baja la
      // cobertura, falla aunque el global siga igual.
      thresholds: {
        lines: 0.9,
        functions: 0.9,
        branches: 0.6,
        statements: 0.9,

        'src/services/invoice/invoiceCalculator.ts': {
          lines: 100,
          functions: 100,
          branches: 90,
          statements: 100,
        },
        'src/services/payrollCalculationService.ts': {
          lines: 84,
          functions: 100,
          branches: 55,
          statements: 79,
        },
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
