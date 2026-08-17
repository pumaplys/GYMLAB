import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>;

/** Transaccion de Drizzle. Es lo que reciben los repositorios dentro de `withTenant`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface CreateDatabaseOptions {
  connectionString: string;
  /** Maximo de conexiones del pool. */
  max?: number;
}

export function createDatabase({ connectionString, max = 10 }: CreateDatabaseOptions) {
  const pool = new Pool({ connectionString, max });

  /*
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ SIN ESTE LISTENER, PERDER POSTGRES MATA EL PROCESO ENTERO.               │
   * │                                                                          │
   * │ El pool de `pg` es un `EventEmitter`, y emite `'error'` cuando una       │
   * │ conexion OCIOSA se cae — no en respuesta a ninguna consulta, asi que no  │
   * │ hay `try/catch` que pueda recogerlo. En Node, un `'error'` sin listener  │
   * │ se convierte en excepcion no capturada y termina el proceso.             │
   * │                                                                          │
   * │ Reproducido parando Postgres con la API en marcha: murio en dos segundos │
   * │ con `Unhandled 'error' event` y `Emitted 'error' event on BoundPool`,    │
   * │ codigo 57P01 —"terminating connection due to administrator command"—.    │
   * │ Es exactamente lo que ocurre en un reinicio de la base de datos, un      │
   * │ failover o un corte de red.                                             │
   * │                                                                          │
   * │ Registrarlo no oculta nada: `pg` descarta esa conexion y abre otra a la  │
   * │ siguiente consulta. Lo que se evita es que una conexion ociosa rota      │
   * │ derribe una aplicacion que por lo demas esta perfectamente viva.          │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Se escribe a `console.error` y no a un logger propio porque este paquete no
   * conoce el de la aplicacion: quien lo use puede reemplazarlo anadiendo su
   * propio listener, que se suma a este.
   */
  pool.on('error', (error) => {
    console.error('[db] conexion ociosa perdida:', error.message);
  });

  return drizzle(pool, { schema });
}

/**
 * Cierra el pool de conexiones.
 *
 * Hace falta llamarlo al apagar el proceso. Sin esto, un `SIGTERM` durante un
 * despliegue deja las conexiones abiertas hasta que Postgres las expira por su
 * cuenta: con varias instancias reiniciandose seguidas, se acumulan.
 *
 * En los tests el efecto es mas visible: cada fichero levanta su aplicacion y su
 * pool, y sin cerrarlos las conexiones se van sumando durante toda la bateria.
 */
export async function closeDatabase(db: Database): Promise<void> {
  await db.$client.end();
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
