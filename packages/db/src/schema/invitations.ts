import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { membershipRole, users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Invitaciones. Tabla de tenant: las crea un gimnasio ya autenticado.
 *
 * VIVE EN SU PROPIO FICHERO, y no junto a `identity`, por una razon concreta:
 * necesita apuntar tanto a `users` como a `members`. Declararla en
 * `identity.ts` obligaria a que ese fichero importara `members.ts`, que a su vez
 * importa `identity.ts` — un ciclo entre modulos de ES que deja tablas sin
 * definir en tiempo de evaluacion.
 *
 * Con este fichero el grafo queda aciclico:
 *   invitations -> identity, members, organization
 *   members     -> identity, organization
 *
 * Dos decisiones que merecen explicacion:
 *
 * 1. `tokenHash` guarda el token **hasheado**, igual que una contrasena. Si la
 *    base de datos se filtra, las invitaciones pendientes no son canjeables.
 *
 * 2. No hay columna `status`. El estado es funcion de las fechas:
 *
 *      revokedAt  != null   -> REVOCADA
 *      acceptedAt != null   -> ACEPTADA
 *      expiresAt  < now()   -> CADUCADA
 *      en otro caso         -> PENDIENTE
 *
 *    Una columna de estado ademas de las fechas seria un segundo origen de
 *    verdad, y tarde o temprano las dos se contradicen.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: membershipRole('role').notNull(),
    tokenHash: text('token_hash').notNull(),

    /**
     * Ficha de socio a la que pertenece la invitacion, si viene de una.
     *
     * Nullable porque el personal —dueno, recepcion, entrenador— se invita sin
     * ficha de socio. Al aceptar, este id es lo que permite rellenar
     * `members.user_id`.
     *
     * `cascade`: si se borra la ficha por derecho al olvido, sus invitaciones
     * pendientes dejan de tener sentido. Sin esta clave ajena quedarian
     * apuntando a una ficha inexistente, y el flujo de aceptacion fallaria en un
     * sitio donde ya no se puede explicar por que.
     */
    memberId: uuid('member_id'),

    invitedByUserId: uuid('invited_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('invitations_token_hash_key').on(t.tokenHash),
    index('invitations_gym_id_idx').on(t.gymId),
    index('invitations_email_idx').on(t.email),
    index('invitations_member_id_idx').on(t.memberId),
    // Compuesta: la invitacion y la ficha han de ser del MISMO gimnasio. Aqui
    // `cascade` sobre las dos columnas es correcto porque la invitacion entera
    // deja de tener sentido si desaparece la ficha de la que salio.
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'invitations_gym_member_fk',
    }).onDelete('cascade'),
  ],
);

export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
