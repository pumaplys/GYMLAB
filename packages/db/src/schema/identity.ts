import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { gyms } from './organization';

/**
 * Modulo `identity` — quien eres, y que puedes hacer en que gimnasio.
 *
 * Cuatro de estas tablas (users, accounts, sessions, verifications) las gestiona
 * Better Auth. Sus nombres de tabla y de columna son configurables, asi que se
 * mapean a nuestra convencion en lugar de adoptar su camelCase: las claves de
 * JavaScript coinciden con los nombres logicos que Better Auth espera, y las
 * columnas SQL van en snake_case como el resto del esquema.
 *
 * Ver docs/adr/0007-autenticacion-y-sesiones.md.
 *
 * NINGUNA de las tablas de autenticacion lleva RLS, y es deliberado: todas se
 * consultan ANTES de que exista contexto de gimnasio. Lo que compensa la
 * excepcion es que no contienen ningun dato de negocio ni de salud.
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
 * Identidad global. Modelo `user` de Better Auth.
 *
 * SIN RLS: el login busca por email antes de saber a que gimnasio pertenece la
 * persona. Una politica aqui haria imposible autenticarse. A cambio, la tabla
 * guarda el minimo imprescindible.
 */
export const users = pgTable(
  'users',
  {
    id: primaryId(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    /** Booleano porque es lo que exige Better Auth (antes era un timestamp). */
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    /** Rol de plataforma (soporte GYMLAB). Campo adicional nuestro. */
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
 * Credenciales. Modelo `account` de Better Auth.
 *
 * `providerId` vale 'credential' en v1. Es lo que hace que anadir Google, Apple
 * o magic links mas adelante sea aditivo y no una migracion de datos.
 * `password` guarda el hash, nunca la contrasena.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryId(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    /** Hash de la contrasena. Lo calcula y verifica Better Auth. */
    password: text('password'),
    ...timestamps,
  },
  (t) => [
    index('accounts_user_id_idx').on(t.userId),
    uniqueIndex('accounts_provider_account_key').on(t.providerId, t.accountId),
  ],
);

/**
 * Sesiones. Modelo `session` de Better Auth, con un campo adicional decisivo.
 *
 * `activeGymId` es la pieza central de ADR-0007: el gimnasio en el que el
 * usuario esta operando **vive aqui, en el servidor**. El cliente solo tiene un
 * token opaco y no puede manipularlo.
 *
 * Es nullable a proposito: entre el login y la eleccion de gimnasio hay un
 * instante sin contexto, y un `superadmin` de plataforma nunca lo tendra.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: primaryId(),
    token: text('token').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeGymId: uuid('active_gym_id').references(() => gyms.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.token),
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/**
 * Tokens de un solo uso: verificar email y restablecer contrasena.
 * Modelo `verification` de Better Auth.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: primaryId(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

/**
 * Pertenencia de un usuario a un gimnasio, con su rol.
 * Tabla de tenant: lleva `gym_id` y politica RLS.
 *
 * Restriccion de v1: un usuario tiene **un** rol por gimnasio.
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

// `invitations` vive en `invitations.ts`: necesita apuntar a `users` y a
// `members`, y declararla aqui obligaria a importar `members.ts`, que a su vez
// importa este fichero. Un ciclo entre modulos de ES deja tablas sin definir.

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Verification = typeof verifications.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
export type MembershipRole = (typeof membershipRole.enumValues)[number];
