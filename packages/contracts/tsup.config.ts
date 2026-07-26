import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Doble formato a proposito: la API (NestJS) consume CommonJS,
  // mientras que Next.js y Expo consumen ESM.
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
