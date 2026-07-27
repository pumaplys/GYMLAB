import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Los tests levantan la aplicacion contra un PostgreSQL real y comparten
    // filas: en paralelo darian falsos positivos.
    fileParallelism: false,
    sequence: { concurrent: false },
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  // NestJS necesita `emitDecoratorMetadata` para resolver la inyeccion de
  // dependencias. esbuild, que usa Vite por defecto, no la emite: sin este
  // plugin la aplicacion no arranca en los tests aunque compile.
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
