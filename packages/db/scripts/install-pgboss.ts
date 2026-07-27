/**
 * Instala el esquema de pg-boss y crea las colas.
 *
 * Se ejecuta con el rol PROPIETARIO, igual que las migraciones, y por el mismo
 * motivo: pg-boss hace DDL. Crea su esquema `pgboss` y, desde la v10, **una
 * particion por cola**. El rol de la aplicacion no tiene —ni debe tener—
 * permisos para crear nada.
 *
 * Asi que el reparto es el mismo que ya teniamos:
 *   este script (gymlab)      crea esquema, tablas y colas
 *   la API (gymlab_app)       solo encola y consume
 *
 * Idempotente: se puede reejecutar en cada despliegue.
 */
import { fileURLToPath } from 'node:url';
import { ALL_QUEUES } from '@gymlab/contracts';
import { config } from 'dotenv';
import { PgBoss } from 'pg-boss';
import { Client } from 'pg';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL (rol propietario).');
  }

  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  await boss.start();
  console.log('  esquema de pg-boss instalado o actualizado');

  for (const cola of ALL_QUEUES) {
    await boss.createQueue(cola);
    console.log(`  cola lista: ${cola}`);
  }

  await boss.stop({ graceful: true });

  // Permisos para el rol de la aplicacion. Van aqui y no en 00-roles.sql porque
  // el esquema `pgboss` no existe hasta que lo crea la linea de arriba.
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(`
      GRANT USAGE ON SCHEMA pgboss TO gymlab_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO gymlab_app;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pgboss TO gymlab_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA pgboss
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gymlab_app;
    `);
    console.log('  permisos de pgboss concedidos a gymlab_app');
  } finally {
    await client.end();
  }

  console.log('[db] pg-boss listo.');
}

main().catch((error: unknown) => {
  console.error('[db] Fallo al instalar pg-boss:', error);
  process.exit(1);
});
