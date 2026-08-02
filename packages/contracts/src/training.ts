import { z } from 'zod';

/**
 * Contratos de ejercicios y rutinas.
 *
 * La biblioteca de cada gimnasio es SUYA (ADR-0012): nace copiada de la plantilla
 * de plataforma y a partir de ahi la edita y la borra sin restricciones.
 */

export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'legs',
  'shoulders',
  'arms',
  'core',
  'cardio',
  'full_body',
] as const;
export const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
export type MuscleGroup = z.infer<typeof muscleGroupSchema>;

// --- Ejercicios ----------------------------------------------------------

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  muscleGroup: muscleGroupSchema,
  equipment: z.string().trim().max(80).optional(),
});
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const updateExerciseSchema = createExerciseSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const exerciseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  muscleGroup: muscleGroupSchema,
  equipment: z.string().nullable(),
  /** Si viene del catalogo de la plataforma o lo creo el gimnasio. */
  fromTemplate: z.boolean(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

// --- Rutinas -------------------------------------------------------------

/**
 * Un ejercicio dentro de la rutina.
 *
 * `reps` es TEXTO y no numero: "8-10", "al fallo" y "30 s" son prescripciones
 * validas que un entero no sabe representar.
 */
export const routineItemInputSchema = z.object({
  exerciseId: z.string().uuid(),
  sets: z.number().int().min(1).max(20),
  reps: z.string().trim().min(1).max(30),
  restSeconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(300).optional(),
});
export type RoutineItemInput = z.infer<typeof routineItemInputSchema>;

export const createRoutineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  /** El orden de la lista ES el orden de la rutina. */
  items: z.array(routineItemInputSchema).min(1).max(50),
});
export type CreateRoutineInput = z.infer<typeof createRoutineSchema>;

/**
 * Editar una rutina reemplaza la lista entera de ejercicios.
 *
 * Es mas simple que un juego de altas, bajas y reordenaciones parciales, y no
 * pierde nada: el cliente ya tiene la lista completa en pantalla cuando edita.
 */
export const updateRoutineSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    items: z.array(routineItemInputSchema).min(1).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateRoutineInput = z.infer<typeof updateRoutineSchema>;

export const routineItemSchema = z.object({
  id: z.string().uuid(),
  /** Nulo si el gimnasio borro el ejercicio. El nombre sobrevive igual. */
  exerciseId: z.string().uuid().nullable(),
  exerciseName: z.string(),
  position: z.number().int(),
  sets: z.number().int(),
  reps: z.string(),
  restSeconds: z.number().int().nullable(),
  notes: z.string().nullable(),
});
export type RoutineItem = z.infer<typeof routineItemSchema>;

export const routineSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  items: z.array(routineItemSchema),
  /** Cuantos socios la siguen ahora mismo. */
  activeAssignments: z.number().int(),
});
export type Routine = z.infer<typeof routineSchema>;

// --- Asignaciones --------------------------------------------------------

export const assignRoutineSchema = z.object({
  memberId: z.string().uuid(),
});
export type AssignRoutineInput = z.infer<typeof assignRoutineSchema>;

export const assignedRoutineSchema = routineSchema.extend({
  assignmentId: z.string().uuid(),
  assignedAt: z.string(),
});
export type AssignedRoutine = z.infer<typeof assignedRoutineSchema>;
