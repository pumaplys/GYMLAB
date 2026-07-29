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
import { config } from 'dotenv';
import { PgBoss } from 'pg-boss';
import { Client } from 'pg';
// Codigo fuente del propio paquete, no un `dist`: este script corre dentro de
// `pnpm db:migrate`, y una migracion no debe depender de haber compilado nada.
import { ALL_QUEUES } from '../src/queues.js';

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
    // Politica de reintentos a nivel de COLA, no de trabajo: asi la heredan
    // todos los trabajos y no depende de que quien encola se acuerde.
    //
    // Espera creciente porque el fallo tipico de un proveedor de correo es
    // transitorio —limite de peticiones o caida puntual—: insistir de inmediato
    // empeora las cosas. Con 60 s iniciales y backoff, los cinco intentos se
    // reparten a lo largo de horas, tiempo de sobra para que se recupere.
    //
    // Agotados los reintentos, el trabajo queda en estado `failed` en
    // `pgboss.job`, que es consultable. No se pierde en silencio.
    const politica = {
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      // Un correo que lleva 12 h sin enviarse ya no sirve de nada: los tokens de
      // invitacion y de recuperacion caducan antes o poco despues.
      expireInSeconds: 12 * 60 * 60,
    };

    await boss.createQueue(cola, politica);
    // `createQueue` no cambia la politica de una cola que ya existia, asi que
    // sin este `updateQueue` las colas creadas antes se quedarian con los
    // valores por defecto. Este script debe poder reaplicarse y dejar el mismo
    // estado siempre, no solo la primera vez.
    await boss.updateQueue(cola, politica);
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
