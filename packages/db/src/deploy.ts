/**
 * Poner el esquema al dia. Lo que hay que ejecutar en CADA despliegue.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTO NO USA `drizzle-kit`, Y ES A PROPOSITO.                             │
 * │                                                                          │
 * │ `drizzle-kit` es una herramienta de desarrollo: vive en devDependencies  │
 * │ y arrastra su propia cadena de compilacion. Meterla en la imagen de      │
 * │ produccion para poder migrar significaria desplegar el taller entero.    │
 * │                                                                          │
 * │ El migrador de `drizzle-orm` —que YA es dependencia de produccion— lee   │
 * │ exactamente la misma contabilidad: `drizzle.__drizzle_migrations`, que    │
 * │ es el valor por defecto de las dos herramientas. Comprobado contra la    │
 * │ base de datos de desarrollo antes de escribir esto.                      │
 * │                                                                          │
 * │ Y por eso mismo `pnpm db:migrate` ejecuta TAMBIEN este codigo: un        │
 * │ camino distinto para desarrollo y otro para produccion es justo la clase │
 * │ de diferencia que no se descubre hasta el dia del despliegue.            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los tres pasos son idempotentes: reejecutarlos deja el mismo estado.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { PgBoss } from 'pg-boss';
import { ALL_QUEUES } from './queues';

export interface OpcionesDespliegue {
  /**
   * Conexion del rol PROPIETARIO, no la de la aplicacion.
   *
   * Todo lo de aqui es DDL —crear tablas, habilitar RLS, crear el esquema de
   * pg-boss— y el rol de la aplicacion no tiene ni debe tener permiso para
   * nada de eso. Es la misma separacion que sostiene ADR-0002.
   */
  databaseUrl: string;
  /** Contrasena con la que se crea o actualiza el rol `gymlab_app`. */
  appPassword: string;
  /** Carpeta con las migraciones y su `_journal.json`. */
  migrationsDir: string;
  /** Carpeta con `00-roles.sql` y `01-rls.sql`. */
  sqlDir: string;
  registrar?: (mensaje: string) => void;
}

const FICHEROS_SQL = ['00-roles.sql', '01-rls.sql'] as const;

export async function desplegarEsquema({
  databaseUrl,
  appPassword,
  migrationsDir,
  sqlDir,
  registrar = console.log,
}: OpcionesDespliegue): Promise<void> {
  await aplicarMigraciones(databaseUrl, migrationsDir, registrar);
  await aplicarRolesYRls(databaseUrl, appPassword, sqlDir, registrar);
  await instalarPgBoss(databaseUrl, registrar);
}

async function aplicarMigraciones(
  connectionString: string,
  migrationsFolder: string,
  registrar: (mensaje: string) => void,
): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    registrar('  migraciones al dia');
  } finally {
    await pool.end();
  }
}

/**
 * Roles y politicas.
 *
 * El rol se crea aqui y no en el SQL versionado porque lleva contrasena:
 * `format('%L')` la escapa del lado de Postgres, asi que no hay concatenacion
 * de cadenas en JavaScript.
 */
async function aplicarRolesYRls(
  connectionString: string,
  appPassword: string,
  sqlDir: string,
  registrar: (mensaje: string) => void,
): Promise<void> {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gymlab_app') AS exists`,
    );
    const verbo = rows[0]?.exists ? 'ALTER' : 'CREATE';

    const { rows: construido } = await client.query<{ stmt: string }>(
      `SELECT format('%s ROLE gymlab_app LOGIN PASSWORD %L', $1::text, $2::text) AS stmt`,
      [verbo, appPassword],
    );
    await client.query(construido[0]!.stmt);
    registrar(`  ${verbo === 'CREATE' ? 'creado' : 'actualizado'} el rol gymlab_app`);

    for (const fichero of FICHEROS_SQL) {
      await client.query(await readFile(join(sqlDir, fichero), 'utf8'));
      registrar(`  aplicado ${fichero}`);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Esquema y colas de pg-boss, tambien con el rol propietario: pg-boss hace DDL
 * y desde la v10 crea una particion por cola.
 */
async function instalarPgBoss(
  connectionString: string,
  registrar: (mensaje: string) => void,
): Promise<void> {
  const boss = new PgBoss({ connectionString, supervise: false, schedule: false });
  await boss.start();
  registrar('  esquema de pg-boss instalado o actualizado');

  for (const cola of ALL_QUEUES) {
    // Politica de reintentos a nivel de COLA, no de trabajo: asi la heredan
    // todos y no depende de que quien encola se acuerde. Espera creciente
    // porque el fallo tipico de un proveedor de correo es transitorio.
    const politica = {
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      // Un correo que lleva 12 h sin enviarse ya no sirve: los tokens de
      // invitacion y de recuperacion caducan antes o poco despues.
      expireInSeconds: 12 * 60 * 60,
    };

    await boss.createQueue(cola, politica);
    // `createQueue` no cambia la politica de una cola existente, asi que sin
    // esto las creadas antes se quedarian con los valores por defecto.
    await boss.updateQueue(cola, politica);
    registrar(`  cola lista: ${cola}`);
  }

  await boss.stop({ graceful: true });

  // Permisos del rol de la aplicacion. Van aqui y no en `00-roles.sql` porque
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
    registrar('  permisos de pgboss concedidos a gymlab_app');
  } finally {
    await client.end();
  }
}
