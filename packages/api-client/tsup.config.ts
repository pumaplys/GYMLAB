import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Mismo doble formato que @gymlab/contracts: los frontends consumen ESM y la
  // API, si algun dia necesitara llamarse a si misma, CommonJS.
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
