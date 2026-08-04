import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Estos tests no tocan red ni base de datos: inyectan un `fetch` falso. Se
    // pueden ejecutar en paralelo sin compartir nada.
    include: ['src/**/*.test.ts'],
  },
});
