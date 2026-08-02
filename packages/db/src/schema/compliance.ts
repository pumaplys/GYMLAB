import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
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
    /**
     * Cuenta que consintio, si la tiene.
     *
     * ANULABLE desde el modulo de progreso, y el motivo es el que ordena todo
     * `members`: un gimnasio real tiene socios que nunca tendran cuenta. Exigir
     * `user_id` significaba que a esas personas no se les podia registrar el peso
     * —no habia donde anotar su consentimiento—, y la senora que va a aquagym es
     * justo quien mas veces pasa por la bascula del entrenador.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    /**
     * Ficha de socio que consintio.
     *
     * Es la clave natural y no un anadido: esta misma tabla ya explicaba que el
     * socio no consiente que GYMLAB trate sus datos, sino que **su gimnasio** lo
     * haga. La identidad dentro de un gimnasio es la ficha, no la cuenta global.
     * `user_id` era la aproximacion posible en la Fase 0, cuando `members` aun no
     * existia.
     *
     * Al menos uno de los dos debe estar relleno; lo impone una restriccion CHECK.
     */
    memberId: uuid('member_id'),
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
    index('consents_gym_member_idx').on(t.gymId, t.memberId),
    index('consents_purpose_idx').on(t.purpose),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'consents_gym_member_fk',
    }).onDelete('cascade'),
    // Un consentimiento sin sujeto no prueba nada ante una autoridad de control.
    check('consents_sujeto_check', sql`user_id IS NOT NULL OR member_id IS NOT NULL`),
  ],
);

export type Consent = typeof consents.$inferSelect;
export type NewConsent = typeof consents.$inferInsert;
export type ConsentPurpose = (typeof consentPurpose.enumValues)[number];
