import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Ejecuta `fn` dentro de una transaccion con el contexto de tenant fijado.
 *
 * A partir de ahi, cualquier consulta sobre una tabla con RLS queda limitada al
 * gimnasio indicado. No hay que anadir `WHERE gym_id = ...` en ningun sitio:
 * lo impone Postgres. Si algun dia se olvida un filtro, el resultado son cero
 * filas — nunca las de otro gimnasio.
 *
 * Detalle que parece menor y no lo es: el tercer argumento de `set_config` es
 * `true`, que hace la variable **local a la transaccion**. Con `false` seria
 * local a la *sesion*, y detras de un pooler en modo transaction esa sesion se
 * reutiliza para la siguiente peticion — de otro gimnasio. Ese unico booleano
 * es la diferencia entre aislamiento y fuga de datos.
 *
 * @example
 * const socios = await withTenant(db, gymId, (tx) => tx.select().from(members));
 */
export async function withTenant<T>(
  db: Database,
  gymId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  // El valor va parametrizado, asi que no hay riesgo de inyeccion. La
  // validacion esta para fallar con un mensaje claro en lugar de con un error
  // de casting de Postgres tres capas mas abajo.
  if (!UUID_RE.test(gymId)) {
    throw new Error(`[db] withTenant recibio un gymId que no es un UUID: "${gymId}"`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.gym_id', ${gymId}, true)`);
    return fn(tx);
  });
}

/**
 * Ejecuta `fn` SIN contexto de tenant.
 *
 * Uso legitimo y limitado a operaciones anteriores o ajenas al tenant:
 * autenticacion (buscar un usuario por email), alta de una organizacion nueva
 * y tareas de plataforma.
 *
 * No es una puerta trasera: las tablas con RLS siguen protegidas y devolveran
 * cero filas, porque `app.gym_id` queda vacio y la politica falla en cerrado.
 * Solo son accesibles las tablas sin RLS (`users`).
 *
 * Se limpia la variable explicitamente para no heredar el contexto de una
 * transaccion anterior en la misma conexion del pool.
 */
export async function withoutTenant<T>(
  db: Database,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.gym_id', '', true)`);
    return fn(tx);
  });
}
