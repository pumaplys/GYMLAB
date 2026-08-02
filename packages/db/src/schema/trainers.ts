import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Modulo `trainers` — el entrenador y los socios que tiene asignados.
 *
 * UN ENTRENADOR SI ES UN USUARIO, y ahi esta la diferencia con `members`.
 *
 * La ficha de socio existe sin cuenta porque hay socios que nunca instalaran una
 * app. Un entrenador, en cambio, entra a la plataforma para ver a sus socios: si
 * no tiene cuenta, no hay nada que representar. Por eso `user_id` es obligatorio
 * aqui y opcional alli.
 *
 * Consecuencia practica: el nombre y el email NO se duplican en esta tabla, se
 * leen de `users`. En `members` si se duplican, y tambien por la misma razon —
 * alli puede no haber cuenta de donde leerlos—. Duplicar un dato que ya existe
 * solo garantiza que algun dia las dos copias digan cosas distintas.
 *
 * La pertenencia al gimnasio con rol `trainer` ya existia desde la Fase 0, en
 * `memberships`. Esto anade el PERFIL (datos profesionales dentro del gimnasio)
 * y la ASIGNACION.
 */

/** Estado del entrenador en el gimnasio. Dar de baja no borra su historial. */
export const trainerStatus = pgEnum('trainer_status', ['active', 'inactive']);

export const trainers = pgTable(
  'trainers',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),

    /**
     * Cuenta del entrenador. Obligatoria, y en cascada.
     *
     * `cascade` y no `set null` —al reves que en `members`— porque un perfil de
     * entrenador sin cuenta no representa nada: nadie podria entrar a usarlo. Si
     * alguien ejerce su derecho al olvido, su perfil profesional se va con el.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** Lo que el socio ve de su entrenador en la app. Opcional. */
    bio: text('bio'),
    /** Contacto profesional, distinto del personal aunque coincida. */
    phone: text('phone'),

    status: trainerStatus('status').notNull().default('active'),

    ...timestamps,
  },
  (t) => [
    // Una cuenta, un perfil de entrenador por gimnasio. Sin esto, aceptar dos
    // invitaciones seguidas crearia dos perfiles de la misma persona.
    uniqueIndex('trainers_gym_user_key').on(t.gymId, t.userId),
    index('trainers_gym_id_idx').on(t.gymId),
  ],
);

/**
 * Que socios lleva cada entrenador.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ ESTA TABLA ES UN LIMITE DE AUTORIZACION, no una comodidad.                │
 * │                                                                          │
 * │ RLS aisla entre gimnasios, no DENTRO de uno: para PostgreSQL, un          │
 * │ entrenador y el dueno del mismo gimnasio son indistinguibles. Que el      │
 * │ entrenador vea solo a sus socios lo decide la aplicacion consultando      │
 * │ esta tabla, y por eso exige tests de abuso propios.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SE TERMINA, NO SE BORRA (`ended_at`). Cuando un socio cambia de entrenador,
 * las rutinas que le asigno el anterior siguen existiendo y necesitan que esa
 * relacion haya existido. Borrar la fila dejaria rutinas sin explicacion.
 *
 * UN SOCIO PUEDE TENER VARIOS ENTRENADORES A LA VEZ, a proposito: en un gimnasio
 * real alguien hace fuerza con uno y rehabilitacion con otro. Imponer uno solo
 * seria una restriccion inventada, y quitarla despues obliga a migrar datos.
 */
export const trainerAssignments = pgTable(
  'trainer_assignments',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    trainerId: uuid('trainer_id')
      .notNull()
      .references(() => trainers.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),

    /** Quien hizo la asignacion. Nulo si esa cuenta se borro. */
    assignedByUserId: uuid('assigned_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    /** Fin de la relacion. Mientras sea NULL, la asignacion esta vigente. */
    endedAt: timestamp('ended_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // El mismo par no puede estar asignado dos veces A LA VEZ. Parcial porque
    // tras terminar una asignacion, volver a asignar la misma pareja mas
    // adelante es legitimo y no debe chocar con la fila historica.
    uniqueIndex('trainer_assignments_active_key')
      .on(t.gymId, t.trainerId, t.memberId)
      .where(sql`ended_at IS NULL`),
    // Las dos consultas del modulo: "los socios de este entrenador" y "los
    // entrenadores de este socio". Con gym_id delante, como todo lo demas.
    index('trainer_assignments_gym_trainer_idx').on(t.gymId, t.trainerId),
    index('trainer_assignments_gym_member_idx').on(t.gymId, t.memberId),
  ],
);

export type Trainer = typeof trainers.$inferSelect;
export type NewTrainer = typeof trainers.$inferInsert;
export type TrainerStatus = (typeof trainerStatus.enumValues)[number];
export type TrainerAssignment = typeof trainerAssignments.$inferSelect;
export type NewTrainerAssignment = typeof trainerAssignments.$inferInsert;
