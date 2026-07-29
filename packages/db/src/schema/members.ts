import { sql } from 'drizzle-orm';
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { gyms } from './organization';

/**
 * Modulo `members` — la ficha del socio dentro de un gimnasio.
 *
 * UN SOCIO NO ES UN USUARIO, y esa es la decision que ordena todo el modulo.
 *
 * Un gimnasio real tiene socios que nunca tendran cuenta: se dan de alta en
 * recepcion, llevan su tarjeta con QR y no instalan ninguna app. Si la ficha
 * exigiera un `user_id`, esa parte de la cartera no se podria representar.
 *
 *   users          identidad global con credenciales. OPCIONAL para un socio.
 *   memberships    vinculo cuenta <-> gimnasio con rol. Solo si tiene cuenta.
 *   members        LA FICHA. Existe siempre, con o sin cuenta detras.
 *
 * De ahi que dar de alta e invitar a crear cuenta sean dos acciones distintas.
 */

/**
 * Estado de la RELACION con el gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ NO es el estado de la suscripcion.                                   │
 * │                                                                      │
 * │ Si esta al corriente de pago lo dira el modulo `billing`. Mezclarlos  │
 * │ parece comodo y luego impide responder a "socio activo que debe dos   │
 * │ meses", que es justo lo que un dueno quiere ver.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const memberStatus = pgEnum('member_status', ['active', 'inactive']);

export const members = pgTable(
  'members',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),

    /**
     * Cuenta asociada, si la tiene. Se rellena al aceptar la invitacion.
     *
     * `set null` y no `cascade`: si alguien borra su cuenta, sigue siendo socio
     * del gimnasio. La ficha no depende de la identidad.
     */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),

    /** Numero corto y legible para recepcion. Secuencial por gimnasio (ver memberCounters). */
    memberNumber: integer('member_number').notNull(),

    // Separados a proposito: recepcion busca por apellido.
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),

    /** Nullable: solo hace falta para invitar a crear cuenta. */
    email: text('email'),
    phone: text('phone'),
    /** `date` y no `timestamp`: una fecha de nacimiento no tiene hora ni zona. */
    birthDate: date('birth_date'),

    status: memberStatus('status').notNull().default('active'),

    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Fecha de baja. Que exista no significa borrado:
     *
     * Dar de baja NO es el derecho al olvido. La baja conserva la ficha porque
     * el gimnasio necesita historial para contabilidad y para cuando esa
     * persona vuelva. El borrado del art. 17 es otra operacion, explicita y
     * destructiva. Confundirlos lleva o a perder historial legitimo o a
     * incumplir el RGPD.
     */
    leftAt: timestamp('left_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('members_gym_number_key').on(t.gymId, t.memberNumber),
    index('members_gym_id_idx').on(t.gymId),
    index('members_user_id_idx').on(t.userId),
    // Recepcion busca por apellido; el indice lleva gym_id delante porque toda
    // consulta esta ya acotada al tenant.
    index('members_gym_last_name_idx').on(t.gymId, t.lastName),
    // Un mismo email no puede pertenecer a dos socios ACTIVOS del mismo
    // gimnasio. Parcial a proposito: tras una baja, ese email vuelve a estar
    // libre, y una persona puede reincorporarse con ficha nueva.
    uniqueIndex('members_gym_email_active_key')
      .on(t.gymId, sql`lower(${t.email})`)
      .where(sql`status = 'active' AND email IS NOT NULL`),
  ],
);

/**
 * Contador del numero de socio, uno por gimnasio.
 *
 * EXISTE POR UN PROBLEMA DE CONCURRENCIA, no por comodidad.
 *
 * Lo natural seria `SELECT max(member_number) + 1`, y es exactamente la trampa
 * que ya nos mordio con el limite de intentos de login: dos personas dando de
 * alta a la vez en el mostrador leen el mismo maximo y generan el mismo numero.
 *
 * Con esta tabla, el numero se obtiene con un UPSERT que incrementa y devuelve
 * el valor en una sola sentencia. Postgres bloquea la fila, asi que dos altas
 * simultaneas reciben numeros distintos. El indice unico de arriba es la red por
 * si alguien lo cambia por un `max()+1`.
 */
export const memberCounters = pgTable('member_counters', {
  gymId: tenantId()
    .primaryKey()
    .references(() => gyms.id, { onDelete: 'cascade' }),
  nextNumber: integer('next_number').notNull().default(1),
});

/**
 * Notas internas del personal sobre un socio.
 *
 * Tabla aparte y no un campo `notes` en la ficha, por dos motivos: queda quien
 * escribio cada nota y cuando, y el socio **no las ve** al consultar sus datos.
 *
 * NO es el sitio para lesiones ni observaciones medicas: eso es categoria
 * especial (art. 9) y vive en el modulo `progress`, con acceso mas restringido.
 */
export const memberNotes = pgTable(
  'member_notes',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    /** Nulo si el autor se borro por derecho al olvido. */
    authorUserId: uuid('author_user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('member_notes_gym_member_idx').on(t.gymId, t.memberId)],
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type MemberStatus = (typeof memberStatus.enumValues)[number];
export type MemberNote = typeof memberNotes.$inferSelect;
export type NewMemberNote = typeof memberNotes.$inferInsert;
