import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { primaryId, tenantId } from './_helpers';
import { users } from './identity';
import { gyms } from './organization';

/**
 * Dos registros de actividad, y no es duplicacion.
 *
 *   auth_events  Autenticacion. GLOBAL, sin gym_id, sin RLS.
 *   audit_log    Acciones dentro de un gimnasio. Con gym_id y RLS.
 *
 * El motivo de la separacion: **un intento de login fallido no tiene gimnasio**.
 * Todavia no sabemos quien es quien lo intenta. Si esa tabla llevara RLS, esos
 * registros serian invisibles justo para el dueno que quiere comprobar si le
 * estan atacando la cuenta.
 *
 * Ver docs/adr/0007-autenticacion-y-sesiones.md.
 */

export const authEventType = pgEnum('auth_event_type', [
  'login_success',
  'login_failure',
  'logout',
  'password_reset_requested',
  'password_reset_completed',
  'email_verified',
  'session_revoked',
]);

/**
 * Eventos de autenticacion. Append-only y GLOBAL.
 *
 * RGPD: guarda IP y user-agent, que son datos personales. Retencion **90 dias**,
 * aplicada por un job periodico. No es opcional: conservarlos indefinidamente
 * sin justificacion incumple la limitacion del plazo de conservacion
 * (art. 5.1.e).
 */
export const authEvents = pgTable(
  'auth_events',
  {
    id: primaryId(),
    /** Nulo si el intento fallo con un email que no existe. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** El email tal cual se intento, incluso si no corresponde a nadie. */
    emailAttempted: text('email_attempted'),
    eventType: authEventType('event_type').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('auth_events_created_at_idx').on(t.createdAt),
    index('auth_events_email_idx').on(t.emailAttempted),
    index('auth_events_user_id_idx').on(t.userId),
  ],
);

/**
 * Acciones dentro de un gimnasio. Append-only y con RLS.
 *
 * El caracter append-only no se deja a la buena voluntad del codigo: en
 * sql/01-rls.sql se le revocan UPDATE y DELETE al rol de la aplicacion, y sus
 * politicas solo cubren SELECT e INSERT. Un registro de auditoria que la propia
 * aplicacion puede reescribir no es un registro de auditoria.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    /** Nulo si el actor se borro por derecho al olvido. */
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Accion en forma 'recurso.verbo', p. ej. 'invitation.created'. */
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_gym_created_idx').on(t.gymId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorUserId),
  ],
);

export type AuthEvent = typeof authEvents.$inferSelect;
export type NewAuthEvent = typeof authEvents.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
export type AuthEventType = (typeof authEventType.enumValues)[number];
