import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Piezas comunes a todas las tablas. Se centralizan aqui para que ninguna tabla
 * se invente su propio formato de id o de marcas de tiempo.
 */

/** Clave primaria UUID generada por Postgres (`gen_random_uuid()`, nativo en PG13+). */
export const primaryId = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * Referencia al tenant. TODA tabla de negocio la lleva.
 *
 * No se define aqui la foreign key porque provocaria una dependencia circular
 * entre modulos del esquema; cada tabla la declara apuntando a `gyms.id`.
 */
export const tenantId = () => uuid('gym_id').notNull();

/** Marcas de tiempo con zona horaria. Nunca `timestamp` sin tz: es fuente garantizada de bugs. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
