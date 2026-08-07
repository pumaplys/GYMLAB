/**
 * Entrada de linea de ordenes de `desplegarEsquema`.
 *
 * Es la MISMA que se usa en desarrollo (`pnpm db:migrate`) y en el despliegue
 * (`node dist/deploy.cjs`). Un solo camino, para que lo que se prueba a diario
 * sea exactamente lo que corre en produccion.
 *
 * Las carpetas se resuelven desde el directorio de trabajo, que en los dos
 * casos es la raiz de este paquete: `pnpm --filter` la fija en desarrollo y el
 * `WORKDIR` de la imagen en produccion. Sin `__dirname`, que no existe en el
 * formato ESM que tsup genera en paralelo.
 */
import { resolve } from 'node:path';
import { desplegarEsquema } from './deploy';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Falta DATABASE_URL (rol propietario, el que ejecuta migraciones).');
  }

  const appPassword = process.env.APP_DB_PASSWORD;
  if (!appPassword) {
    throw new Error('Falta APP_DB_PASSWORD (contrasena del rol gymlab_app).');
  }

  await desplegarEsquema({
    databaseUrl,
    appPassword,
    migrationsDir: resolve('migrations'),
    sqlDir: resolve('sql'),
  });

  console.log('[db] Esquema al dia: migraciones, RLS y colas.');
}

main().catch((error: unknown) => {
  console.error('[db] Fallo al poner el esquema al dia:', error);
  process.exit(1);
});
