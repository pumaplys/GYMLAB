import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>;

/** Transaccion de Drizzle. Es lo que reciben los repositorios dentro de `withTenant`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Cualquiera de los dos: permite escribir un repositorio que funcione dentro y fuera de transaccion. */
export type Executor = Database | Transaction;

export interface CreateDatabaseOptions {
  connectionString: string;
  /** Maximo de conexiones del pool. */
  max?: number;
}

export function createDatabase({ connectionString, max = 10 }: CreateDatabaseOptions) {
  const pool = new Pool({ connectionString, max });
  return drizzle(pool, { schema });
}

/**
 * Comprueba que la conexion NO puede saltarse Row Level Security.
 *
 * Esto existe por un detalle de Postgres que arruina silenciosamente todo el
 * modelo de aislamiento: **un superusuario, y el propietario de la tabla,
 * ignoran las politicas RLS**. Si la aplicacion se conectase con el mismo rol
 * que ejecuta las migraciones, RLS estaria activo, las politicas estarian
 * escritas, los tests podrian pasar... y no habria ningun aislamiento real.
 *
 * Es un fallo que no da ningun error: simplemente devuelve datos de mas.
 * Por eso se comprueba al arrancar y se aborta el proceso, en lugar de confiar
 * en que nadie configure mal la variable de entorno.
 *
 * La API debe llamar a esta funcion en el arranque, antes de aceptar trafico.
 */
export async function assertRlsIsEnforced(db: Database): Promise<void> {
  const result = await db.execute<{
    role: string;
    is_superuser: boolean;
    bypasses_rls: boolean;
  }>(sql`
    SELECT rolname       AS role,
           rolsuper      AS is_superuser,
           rolbypassrls  AS bypasses_rls
    FROM pg_roles
    WHERE rolname = current_user
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error('[db] No se pudo determinar el rol de la conexion.');
  }

  if (row.is_superuser || row.bypasses_rls) {
    throw new Error(
      `[db] La aplicacion esta conectada como "${row.role}", que ignora Row Level Security ` +
        `(superusuario=${row.is_superuser}, bypassrls=${row.bypasses_rls}). ` +
        'El aislamiento entre gimnasios seria inexistente. ' +
        'Usa DATABASE_URL_APP con el rol "gymlab_app"; DATABASE_URL es solo para migraciones.',
    );
  }
}
