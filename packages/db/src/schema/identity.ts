import { sql } from 'drizzle-orm';
import { boolean, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { gyms } from './organization';

/**
 * Modulo `identity` — quien eres y que puedes hacer, y en que gimnasio.
 *
 * Se separa deliberadamente en dos tablas:
 *
 *   users        Identidad global. Una persona, una cuenta, un email.
 *   memberships  Vinculo usuario <-> gimnasio, con su rol.
 *
 * El motivo es que un entrenador puede trabajar en dos gimnasios y un socio
 * puede cambiarse de gimnasio sin perder su cuenta. Modelar el rol dentro de
 * `users` habria hecho ese caso imposible sin migracion.
 */

/**
 * Roles dentro de un gimnasio. `superadmin` NO esta aqui: es un rol de
 * plataforma, no de tenant, y vive en `users.is_platform_admin`.
 */
export const membershipRole = pgEnum('membership_role', [
  'owner',
  'receptionist',
  'trainer',
  'member',
]);

/**
 * Identidad global.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ EXCEPCION DELIBERADA: esta tabla NO lleva RLS de tenant.             │
 * │                                                                      │
 * │ El login ocurre ANTES de que exista contexto de gimnasio: hay que    │
 * │ poder buscar por email sin saber todavia a que tenant pertenece.     │
 * │ Una politica RLS aqui haria imposible autenticarse.                  │
 * │                                                                      │
 * │ Por eso esta tabla contiene el minimo imprescindible: credenciales e │
 * │ identificacion. Ningun dato de negocio y, sobre todo, ningun dato de │
 * │ salud. Todo lo demas cuelga de tablas con `gym_id` y RLS.            │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    name: text('name').notNull(),
    /** Rol de plataforma (soporte GYMLAB). Su uso queda auditado. */
    isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // Unico sin distinguir mayusculas: nadie debe poder registrarse dos veces
    // como Ana@gym.com y ana@gym.com.
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
  ],
);

/**
 * Pertenencia de un usuario a un gimnasio, con su rol.
 * Tabla de tenant: lleva `gym_id` y politica RLS.
 *
 * Restriccion de v1: un usuario tiene **un** rol por gimnasio. Si mas adelante
 * hiciera falta que alguien sea a la vez `trainer` y `receptionist`, se elimina
 * el indice unico y se permiten varias filas.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_gym_user_key').on(t.gymId, t.userId),
    index('memberships_gym_id_idx').on(t.gymId),
    index('memberships_user_id_idx').on(t.userId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type MembershipRole = (typeof membershipRole.enumValues)[number];
