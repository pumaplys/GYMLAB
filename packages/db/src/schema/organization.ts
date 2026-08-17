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
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ Y ES TAMBIEN EL RESPONSABLE DEL TRATAMIENTO.                             │
 * │                                                                          │
 * │ GYMLAB es ENCARGADO; quien responde ante el socio es su gimnasio. Pero   │
 * │ "el gimnasio" en sentido juridico no es la sede: una sede no tiene NIF   │
 * │ ni puede firmar nada. Lo es la SOCIEDAD que la explota, que es esto.     │
 * │                                                                          │
 * │ En el MVP, con una organizacion por gimnasio, la distincion no se nota.  │
 * │ Se nota con una cadena: tres sedes de la misma empresa tienen UN         │
 * │ responsable, no tres, y repetir su razon social en cada sede solo crea   │
 * │ tres sitios donde puede quedar desactualizada.                           │
 * │                                                                          │
 * │ Una franquicia donde cada sede es sociedad distinta se modela con una    │
 * │ organizacion por sociedad, que es lo que el modelo ya hacia.             │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Los campos legales son ANULABLES a proposito: una organizacion recien creada
 * no los tiene, y exigirlos en el alta convertiria el registro en un formulario
 * fiscal. Lo que no se permite es publicar un consentimiento sin ellos — ver
 * `datosDelResponsable` en el modulo `legal`.
 */
export const organizations = pgTable('organizations', {
  id: primaryId(),
  /** Nombre comercial. Es el que se usa en la interfaz. */
  name: text('name').notNull(),
  /**
   * Razon social. La denominacion con la que la sociedad existe legalmente.
   *
   * Separada de `name` porque no son lo mismo: el socio conoce «Gimnasio
   * Centro» y quien responde ante la autoridad es «Deportes del Norte, S.L.».
   * Reutilizar el nombre comercial como identidad juridica es exactamente el
   * atajo que deja un consentimiento sin responsable identificable.
   */
  legalName: text('legal_name'),
  /** Identificador fiscal (NIF/CIF). */
  taxId: text('tax_id'),
  /** Domicilio del responsable, en una linea. */
  address: text('address'),
  /**
   * Direccion de contacto para privacidad y ejercicio de derechos.
   *
   * NO se reutiliza el correo de recepcion: son cosas distintas. Un socio que
   * ejerce su derecho de supresion no deberia acabar en la bandeja donde se
   * reservan clases, y quien atiende esa bandeja no tiene por que ver esas
   * peticiones.
   */
  privacyEmail: text('privacy_email'),
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
    /**
     * Cuantos meses se conservan los eventos de acceso (RGPD art. 5.1.e).
     *
     * Configurable por gimnasio y no una constante de la plataforma: la
     * asistencia es dato de negocio, y hay clientes con obligaciones o
     * costumbres distintas. Doce meses por defecto permiten comparar con el
     * mismo mes del ano anterior.
     *
     * OJO AL BAJARLO: la purga es destructiva. Si el dashboard llega a querer
     * asistencia de mas atras, hara falta calcular agregados ANTES de purgar,
     * porque ese dato no vuelve.
     */
    accessEventsRetentionMonths: integer('access_events_retention_months')
      .notNull()
      .default(12),
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
