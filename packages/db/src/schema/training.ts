import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';
import { trainers } from './trainers';

/**
 * Modulo `training` — ejercicios, rutinas y su asignacion a un socio.
 *
 * LA BIBLIOTECA SE COPIA, NO SE COMPARTE (ADR-0012). Hay una plantilla de
 * plataforma y cada gimnasio recibe su copia al darse de alta. Se descarto un
 * catalogo global con `gym_id` anulable: seria la unica tabla del producto fuera
 * del modelo de tenencia, obligaria a politicas asimetricas y dejaria las rutinas
 * fuera de la regla de claves ajenas compuestas.
 */

/** Grupo muscular principal. Sirve para agrupar en la app, no para prescribir. */
export const muscleGroup = pgEnum('muscle_group', [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'full_body',
]);

/**
 * Catalogo de la plataforma. **No es una tabla de tenant.**
 *
 * No lleva `gym_id` a proposito: son datos de referencia, como una lista de
 * paises. Por eso tampoco lleva RLS —no hay nada que aislar— y el guardarrail del
 * catalogo, que exige politica a toda tabla CON `gym_id`, la ignora con razon.
 *
 * Se siembra en una migracion con el rol propietario. La aplicacion solo lee.
 */
export const exerciseTemplates = pgTable(
  'exercise_templates',
  {
    id: primaryId(),
    name: text('name').notNull(),
    muscleGroup: muscleGroup('muscle_group').notNull(),
    /** Material necesario: barra, mancuernas, maquina, peso corporal... */
    equipment: text('equipment'),
    ...timestamps,
  },
  (t) => [uniqueIndex('exercise_templates_name_key').on(t.name)],
);

/**
 * Los ejercicios de UN gimnasio. Su copia, suya para editar y borrar.
 *
 * `gym_id` obligatorio, politica de siempre, sin excepciones. Que dos gimnasios
 * tengan "Press de banca" significa dos filas distintas, y esa es exactamente la
 * decision de ADR-0012.
 */
export const exercises = pgTable(
  'exercises',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),

    /**
     * De que ejercicio de la plantilla salio esta copia.
     *
     * Anulable por dos motivos: los que crea el gimnasio no vienen de ninguno, y
     * `set null` deja la copia intacta si algun dia se retira el original.
     *
     * ES LO QUE CONSERVA EL VOCABULARIO COMUN: dos gimnasios que no han tocado el
     * press de banca siguen apuntando al mismo origen, asi que comparar entre
     * gimnasios sigue siendo posible aunque las filas sean distintas.
     */
    templateId: uuid('template_id').references(() => exerciseTemplates.id, {
      onDelete: 'set null',
    }),

    name: text('name').notNull(),
    muscleGroup: muscleGroup('muscle_group').notNull(),
    equipment: text('equipment'),
    ...timestamps,
  },
  (t) => [
    // Dos ejercicios con el mismo nombre en el mismo gimnasio solo confunden a
    // quien arma la rutina.
    uniqueIndex('exercises_gym_name_key').on(t.gymId, t.name),
    index('exercises_gym_muscle_idx').on(t.gymId, t.muscleGroup),
    // Para que las rutinas apunten aqui con clave ajena compuesta.
    unique('exercises_gym_id_key').on(t.gymId, t.id),
  ],
);

/**
 * Una rutina: la plantilla de entrenamiento que se asigna a socios.
 *
 * La misma rutina puede estar asignada a varios socios a la vez — es justo el
 * motivo de que exista como entidad y no como una lista dentro de cada socio.
 */
export const routineStatus = pgEnum('routine_status', ['active', 'archived']);

export const routines = pgTable(
  'routines',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /**
     * Archivada = ya no se usa, pero su historia se queda.
     *
     * Mismo patron que `plans`: la accion normal es ARCHIVAR, no borrar. El
     * borrado cascadea `routine_assignments` y eliminaria el registro de que un
     * socio siguio esta rutina — justo lo contrario de como el resto del
     * producto trata el historico.
     *
     * Una rutina archivada no admite asignaciones nuevas, y eso lo impone el
     * SERVICIO, no la pantalla. En V1 no se desarchiva.
     */
    status: routineStatus('status').notNull().default('active'),
    /** Quien la creo. Nulo si esa cuenta se borro. */
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [
    index('routines_gym_id_idx').on(t.gymId),
    unique('routines_gym_id_key').on(t.gymId, t.id),
  ],
);

/**
 * Cada ejercicio dentro de una rutina, con sus series.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GUARDA UNA COPIA DEL NOMBRE DEL EJERCICIO, y no es redundancia.           │
 * │                                                                          │
 * │ El gimnasio puede borrar un ejercicio cuando quiera (ADR-0012). Sin la    │
 * │ copia, las rutinas que lo usaban quedarian con un hueco imposible de      │
 * │ explicar; con ella, la rutina sigue diciendo "Prensa 4x10" aunque la      │
 * │ ficha del ejercicio ya no exista.                                         │
 * │                                                                          │
 * │ Es el mismo criterio que hace que una suscripcion guarde el precio del    │
 * │ plan: lo que ya ocurrio no se reescribe cuando cambia el catalogo.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const routineItems = pgTable(
  'routine_items',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id').notNull(),
    /** Anulable: si se borra el ejercicio, queda el nombre copiado. */
    exerciseId: uuid('exercise_id'),
    /** La copia. Se rellena al anadir el ejercicio y ya no cambia sola. */
    exerciseName: text('exercise_name').notNull(),

    /** Orden dentro de la rutina. Lo fija quien la arma. */
    position: integer('position').notNull(),
    sets: integer('sets').notNull(),
    /** Texto y no numero: "8-10", "al fallo" y "30 s" son repeticiones validas. */
    reps: text('reps').notNull(),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('routine_items_routine_position_key').on(t.gymId, t.routineId, t.position),
    index('routine_items_gym_routine_idx').on(t.gymId, t.routineId),
    foreignKey({
      columns: [t.gymId, t.routineId],
      foreignColumns: [routines.gymId, routines.id],
      name: 'routine_items_gym_routine_fk',
    }).onDelete('cascade'),
    // `SET NULL` SOLO sobre `exercise_id`: ver la migracion, donde va escrito a
    // mano. Anular tambien `gym_id`, que es NOT NULL, haria fallar el borrado.
    foreignKey({
      columns: [t.gymId, t.exerciseId],
      foreignColumns: [exercises.gymId, exercises.id],
      name: 'routine_items_gym_exercise_fk',
    }).onDelete('set null'),
  ],
);

/**
 * Que rutina lleva cada socio.
 *
 * SE TERMINA, NO SE BORRA (`ended_at`), igual que las asignaciones de entrenador:
 * saber que rutina siguio alguien hace tres meses es justo lo que da sentido al
 * seguimiento del modulo 6.
 *
 * Un socio puede tener varias a la vez —fuerza y movilidad, por ejemplo—, con el
 * mismo criterio que se aplico a los entrenadores: imponer una sola seria una
 * restriccion inventada.
 */
export const routineAssignments = pgTable(
  'routine_assignments',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    routineId: uuid('routine_id').notNull(),
    memberId: uuid('member_id').notNull(),
    /** Entrenador que la asigno. Nulo si su perfil se borro. */
    assignedByTrainerId: uuid('assigned_by_trainer_id'),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // El mismo par no puede estar asignado dos veces A LA VEZ. Parcial, para que
    // volver a asignar la misma rutina mas adelante siga siendo legitimo.
    uniqueIndex('routine_assignments_active_key')
      .on(t.gymId, t.routineId, t.memberId)
      .where(sql`ended_at IS NULL`),
    index('routine_assignments_gym_member_idx').on(t.gymId, t.memberId),
    index('routine_assignments_gym_routine_idx').on(t.gymId, t.routineId),
    foreignKey({
      columns: [t.gymId, t.routineId],
      foreignColumns: [routines.gymId, routines.id],
      name: 'routine_assignments_gym_routine_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'routine_assignments_gym_member_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.gymId, t.assignedByTrainerId],
      foreignColumns: [trainers.gymId, trainers.id],
      name: 'routine_assignments_gym_trainer_fk',
    }).onDelete('set null'),
  ],
);

export type ExerciseTemplate = typeof exerciseTemplates.$inferSelect;
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type MuscleGroup = (typeof muscleGroup.enumValues)[number];
export type Routine = typeof routines.$inferSelect;
export type NewRoutine = typeof routines.$inferInsert;
export type RoutineItem = typeof routineItems.$inferSelect;
export type NewRoutineItem = typeof routineItems.$inferInsert;
export type RoutineAssignment = typeof routineAssignments.$inferSelect;
export type NewRoutineAssignment = typeof routineAssignments.$inferInsert;
