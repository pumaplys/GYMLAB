import {
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  boolean,
  text,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Modulo `access` — el QR de entrada.
 *
 * Es la funcionalidad con mas superficie de abuso del producto: si se rompe,
 * entra gente que no paga. De ahi que casi todo aqui exista para cerrar una via
 * concreta, no por completitud.
 *
 * EL TOKEN NO SE GUARDA. Va firmado con HMAC-SHA-256 y una clave derivada por
 * gimnasio, asi que el servidor lo verifica sin consultar nada. Lo unico que se
 * guarda es su `jti` **al consumirlo**, que es lo que lo hace de un solo uso.
 *
 * QR ESTATICO DESCARTADO desde el diseno: se fotografia y circula por WhatsApp la
 * misma tarde. Estos viven 60 segundos y la app los regenera sola.
 */

/** El semaforo que ve recepcion. Mayusculas: es el vocabulario de la API. */
export const accessDecision = pgEnum('access_decision', ['ALLOW', 'WARN', 'DENY']);

/**
 * Por que se decidio asi.
 *
 * Se guarda el motivo y no solo la decision porque un `DENY` por cuota vencida y
 * uno por token reutilizado son problemas distintos: el primero lo arregla
 * recepcion cobrando, el segundo puede ser alguien pasando su QR a un amigo.
 */
export const accessReason = pgEnum('access_reason', [
  'OK',
  'DUES_WARN',
  'DUES_EXPIRED',
  'NO_SUBSCRIPTION',
  'MEMBER_INACTIVE',
  'TOKEN_EXPIRED',
  'TOKEN_REUSED',
  'BAD_SIGNATURE',
  'UNKNOWN_MEMBER',
]);

/**
 * Tokens ya consumidos. Es lo que impide reutilizar un QR.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA FILA SE INSERTA AL VERIFICAR, NUNCA AL GENERAR.                        │
 * │                                                                          │
 * │ Generar un QR no escribe nada: la app lo pide cada pocos segundos mientras │
 * │ la pantalla esta abierta, y guardar cada uno seria escribir por decenas de │
 * │ tokens que nadie llega a usar.                                            │
 * │                                                                          │
 * │ El uso unico se consigue con `INSERT ... ON CONFLICT (jti) DO NOTHING      │
 * │ RETURNING`: con dos escaneres simultaneos, PostgreSQL serializa sobre el   │
 * │ indice unico y exactamente uno recibe la fila. No hay comprobacion previa  │
 * │ que pueda quedarse obsoleta entre el SELECT y el INSERT — que es la trampa │
 * │ que ya nos mordio dos veces: en el contador de socios y en el limite de    │
 * │ intentos de login.                                                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Vive segundos: la purga se lleva todo lo caducado hace mas de una hora.
 */
export const accessTokens = pgTable(
  'access_tokens',
  {
    /** El `jti` del token. Es la clave primaria: ahi esta el uso unico. */
    jti: uuid('jti').primaryKey(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id').notNull(),

    /** La decision que se tomo, para poder repetirla ante un reintento. */
    decision: accessDecision('decision').notNull(),
    reason: accessReason('reason').notNull(),

    /**
     * Sesion del escaner que lo consumio.
     *
     * ES LA IDENTIDAD DEL DISPOSITIVO, y por eso no se pide al cliente: el
     * servidor la deriva del token de sesion, asi que no se puede falsificar
     * —es la propia credencial—. La IP no serviria: dos tablets detras del
     * router del gimnasio la comparten.
     */
    consumedBySessionId: text('consumed_by_session_id').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }).notNull().defaultNow(),
    /** Caducidad del token. Solo se usa para purgar. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('access_tokens_expires_at_idx').on(t.expiresAt),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'access_tokens_gym_member_fk',
    }).onDelete('cascade'),
  ],
);

/**
 * Todo intento de acceso, permitido o denegado.
 *
 * Alimenta el dashboard de asistencia, que es de lo que mas presume un dueno de
 * gimnasio, y ademas deja rastro de los intentos raros.
 *
 * `gym_id` SALE SIEMPRE DE LA SESION DEL ESCANER, nunca del token. Si la firma no
 * valida, el contenido del token no es de fiar — pero el intento hay que
 * registrarlo igual, y en el gimnasio correcto.
 */
export const accessEvents = pgTable(
  'access_events',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),

    /**
     * Nulo si el token no era valido —no se sabe quien lo presento— o si la
     * ficha se borro por derecho al olvido. La clave ajena anula SOLO esta
     * columna: ver la migracion, donde va escrita a mano.
     */
    memberId: uuid('member_id'),

    decision: accessDecision('decision').notNull(),
    reason: accessReason('reason').notNull(),
    /** Correlaciona con `access_tokens`. Nulo si la firma no validaba. */
    jti: uuid('jti'),

    /**
     * Repeticion tolerada de un reintento por red.
     *
     * Se marca para que la asistencia no cuente dos veces la misma entrada: sin
     * esto, un escaner con mala cobertura inflaria las metricas del dashboard.
     */
    isRetry: boolean('is_retry').notNull().default(false),

    /** Quien operaba el escaner. Nulo si esa cuenta se borro. */
    scannedByUserId: uuid('scanned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // La consulta del dashboard: "entradas de este gimnasio en tal periodo".
    index('access_events_gym_occurred_idx').on(t.gymId, t.occurredAt),
    index('access_events_gym_member_idx').on(t.gymId, t.memberId),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'access_events_gym_member_fk',
    }).onDelete('set null'),
  ],
);

export type AccessToken = typeof accessTokens.$inferSelect;
export type NewAccessToken = typeof accessTokens.$inferInsert;
export type AccessEvent = typeof accessEvents.$inferSelect;
export type NewAccessEvent = typeof accessEvents.$inferInsert;
export type AccessDecision = (typeof accessDecision.enumValues)[number];
export type AccessReason = (typeof accessReason.enumValues)[number];
