import { foreignKey, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Modulo `progress` — peso y medidas corporales.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ CATEGORIA ESPECIAL DEL RGPD (art. 9). No es una tabla mas.                 │
 * │                                                                          │
 * │ Un peso y un porcentaje de grasa son datos de salud. Su tratamiento esta  │
 * │ prohibido salvo excepcion, y la que aplica aqui es el consentimiento      │
 * │ EXPLICITO del interesado (art. 9.2.a).                                    │
 * │                                                                          │
 * │ Por eso el servicio rechaza toda escritura sin consentimiento vigente, y  │
 * │ la comprobacion vive alli y no en el controlador: la regla debe cumplirse │
 * │ entre por donde entre la llamada.                                         │
 * │                                                                          │
 * │ RECEPCION NO ACCEDE. No lo impone RLS —dentro de un gimnasio no distingue │
 * │ roles— sino la autorizacion de aplicacion, con sus tests.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LAS FOTOS DE PROGRESO QUEDAN FUERA del MVP: exigen almacenamiento cifrado,
 * URLs firmadas y politica de retencion propia.
 */
export const bodyMetrics = pgTable(
  'body_metrics',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),

    /**
     * Fecha de la medicion, no del registro.
     *
     * El entrenador apunta el lunes lo que peso el sabado, y la grafica debe
     * dibujarse por cuando ocurrio.
     */
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull().defaultNow(),

    /**
     * `numeric` y no coma flotante: 72,4 kg debe seguir siendo 72,4 despues de
     * sumarlo cien veces. Es el mismo motivo por el que el dinero va en centimos,
     * resuelto aqui con el tipo exacto porque los decimales son parte del dato.
     */
    weightKg: numeric('weight_kg', { precision: 5, scale: 2 }),
    bodyFatPercent: numeric('body_fat_percent', { precision: 4, scale: 1 }),
    /** Perimetros en centimetros. Todos opcionales: casi nadie mide todo. */
    chestCm: numeric('chest_cm', { precision: 5, scale: 1 }),
    waistCm: numeric('waist_cm', { precision: 5, scale: 1 }),
    hipCm: numeric('hip_cm', { precision: 5, scale: 1 }),
    armCm: numeric('arm_cm', { precision: 4, scale: 1 }),
    thighCm: numeric('thigh_cm', { precision: 4, scale: 1 }),

    notes: text('notes'),

    /** Quien la tomo: el entrenador, o el propio socio desde la app. */
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    /**
     * Version del consentimiento vigente cuando se registro.
     *
     * NO ES DECORATIVA: ante una reclamacion hay que poder demostrar bajo que
     * texto se recogio cada dato concreto. Guardar solo el consentimiento en su
     * tabla no basta si despues cambia de version.
     */
    consentVersion: text('consent_version').notNull(),

    ...timestamps,
  },
  (t) => [
    // La consulta del modulo: la evolucion de un socio en el tiempo.
    index('body_metrics_gym_member_idx').on(t.gymId, t.memberId, t.measuredAt),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'body_metrics_gym_member_fk',
    }).onDelete('cascade'),
  ],
);

export type BodyMetric = typeof bodyMetrics.$inferSelect;
export type NewBodyMetric = typeof bodyMetrics.$inferInsert;
