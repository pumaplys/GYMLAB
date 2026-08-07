import { defineConfig } from 'tsup';

export default defineConfig({
  // `deploy-cli` es la orden que pone el esquema al dia en el despliegue. Se
  // compila aqui —y no se ejecuta con tsx— para que la imagen de produccion no
  // tenga que llevar la cadena de compilacion.
  entry: ['src/index.ts', 'src/schema/index.ts', 'src/deploy-cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['pg', 'drizzle-orm', 'pg-boss'],
});
