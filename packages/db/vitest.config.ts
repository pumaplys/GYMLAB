import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests tocan un PostgreSQL real y comparten filas sembradas:
    // ejecutarlos en paralelo produciria falsos positivos.
    fileParallelism: false,
    sequence: { concurrent: false },
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
