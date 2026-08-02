import { index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';

/**
 * Modulo `organization` — la jerarquia de cliente.
 *
 * organizations 1 ── N gyms
 *
 * En el MVP la relacion sera 1:1 (un gimnasio = una organizacion), pero la
 * jerarquia existe desde el dia uno. Cuando llegue la primera cadena con dos
 * sedes no habra que migrar nada: solo insertar otra fila en `gyms`.
 * (Ver asuncion A4 en docs/01-arquitectura.md.)
 */

/**
 * Cuenta de cliente. Es la entidad que contrata y paga la suscripcion GYMLAB.
 */
export const organizations = pgTable('organizations', {
  id: primaryId(),
  name: text('name').notNull(),
  ...timestamps,
});

/**
 * Sede fisica. **Es el tenant**: `gyms.id` es el valor que viaja en
 * `app.gym_id` y contra el que se comparan todas las politicas RLS.
 */
export const gyms = pgTable(
  'gyms',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    /** Identificador legible para URLs. Unico en toda la plataforma. */
    slug: text('slug').notNull(),
    /** Determina cuando vence una cuota o en que dia cae un acceso. */
    timezone: text('timezone').notNull().default('Europe/Madrid'),
    /**
     * Dias de cortesia tras vencer una cuota antes de denegar el acceso.
     *
     * Por defecto 0 —vencida es vencida— y cada gimnasio lo sube si su forma de
     * trabajar es otra. Es un ajuste del negocio, no una constante de la
     * plataforma: hay gimnasios que cobran el dia 1 y otros que dejan la primera
     * semana de margen, y decidirlo por ellos seria inventarles el negocio.
     */
    graceDays: integer('grace_days').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('gyms_slug_key').on(t.slug),
    index('gyms_organization_id_idx').on(t.organizationId),
  ],
);

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
