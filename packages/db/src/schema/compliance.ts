import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { gyms } from './organization';

/**
 * Consentimientos RGPD.
 *
 * Esta tabla lleva `gym_id`, y el motivo es legal antes que tecnico.
 *
 * En la arquitectura se establecio que GYMLAB es **encargado** del tratamiento
 * y el gimnasio es **responsable**. El socio no consiente que GYMLAB trate sus
 * datos de salud: consiente que **su gimnasio** lo haga. Si se cambia de
 * gimnasio, ese consentimiento no le acompana — hay que pedirlo de nuevo.
 *
 * `version` es imprescindible: cuando cambie la politica de privacidad hay que
 * poder demostrar que version acepto cada persona y cuando. Un booleano
 * "acepto: si" no sirve como prueba ante una autoridad de control.
 */

export const consentPurpose = pgEnum('consent_purpose', [
  /** Terminos del servicio y politica de privacidad. */
  'terms',
  /** Datos de salud: peso, medidas, entrenamiento. Art. 9 RGPD. */
  'health_data',
  /**
   * Derechos de imagen: fotos en la sala, redes sociales.
   *
   * Proposito independiente y no agrupado con los terminos, porque se revoca por
   * separado: alguien puede seguir siendo socio y retirar el permiso para
   * aparecer en fotos. Si fuera la misma casilla, revocarlo obligaria a
   * revocar tambien el contrato.
   */
  'image_rights',
]);

export const consents = pgTable(
  'consents',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: consentPurpose('purpose').notNull(),
    /** Version del documento aceptado, p. ej. '2026-07-01'. */
    version: text('version').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    /** El consentimiento es revocable: es un derecho, no una casilla. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    ...timestamps,
  },
  (t) => [
    index('consents_gym_user_idx').on(t.gymId, t.userId),
    index('consents_purpose_idx').on(t.purpose),
  ],
);

export type Consent = typeof consents.$inferSelect;
export type NewConsent = typeof consents.$inferInsert;
export type ConsentPurpose = (typeof consentPurpose.enumValues)[number];
