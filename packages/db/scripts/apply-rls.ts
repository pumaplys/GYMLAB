/**
 * Aplica roles y politicas RLS.
 *
 * Se ejecuta despues de `drizzle-kit migrate` (ver script `migrate` del
 * package.json) para que las tablas existan cuando se les habilita RLS.
 *
 * Todo lo que ejecuta es idempotente: se puede lanzar tantas veces como haga
 * falta, y de hecho debe lanzarse en cada despliegue para reafirmar el estado.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const SQL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../sql');
const FILES = ['00-roles.sql', '01-rls.sql'];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Falta DATABASE_URL (rol propietario, el que ejecuta migraciones).');
  }

  const appPassword = process.env.APP_DB_PASSWORD;
  if (!appPassword) {
    throw new Error('Falta APP_DB_PASSWORD (contrasena del rol gymlab_app).');
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    // El rol se crea aqui y no en el SQL versionado porque lleva contrasena.
    // `format('%L')` la escapa correctamente del lado de Postgres, asi que no
    // hay concatenacion de cadenas en JavaScript.
    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gymlab_app') AS exists`,
    );
    const verb = rows[0]?.exists ? 'ALTER' : 'CREATE';

    const { rows: built } = await client.query<{ stmt: string }>(
      `SELECT format('%s ROLE gymlab_app LOGIN PASSWORD %L', $1::text, $2::text) AS stmt`,
      [verb, appPassword],
    );
    await client.query(built[0]!.stmt);
    console.log(`  ${verb === 'CREATE' ? 'creado' : 'actualizado'} el rol gymlab_app`);

    for (const file of FILES) {
      const sql = await readFile(join(SQL_DIR, file), 'utf8');
      await client.query(sql);
      console.log(`  aplicado ${file}`);
    }

    await client.query('COMMIT');
    console.log('[db] Roles y politicas RLS aplicados.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db] Fallo al aplicar RLS:', error);
  process.exit(1);
});
