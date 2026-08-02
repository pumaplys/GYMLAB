import { z } from 'zod';
import { memberSchema, phoneSchema } from './members';

/**
 * Contratos del modulo de entrenadores y asignaciones.
 *
 * Nombre y email del entrenador NO se envian nunca desde el cliente: salen de su
 * cuenta. Aqui solo viajan los datos profesionales que el gimnasio administra.
 */

export const TRAINER_STATUSES = ['active', 'inactive'] as const;
export const trainerStatusSchema = z.enum(TRAINER_STATUSES);
export type TrainerStatus = z.infer<typeof trainerStatusSchema>;

// --- Edicion -------------------------------------------------------------

/**
 * Lo unico editable de un perfil de entrenador.
 *
 * No hay `name` ni `email`: son de la cuenta, y cambiarlos desde aqui crearia
 * dos versiones de la misma persona. Tampoco hay `status`: dar de baja es una
 * accion con su propio endpoint, no un campo que se edita de pasada.
 */
export const updateTrainerSchema = z
  .object({
    bio: z.string().trim().max(2000).optional(),
    phone: phoneSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateTrainerInput = z.infer<typeof updateTrainerSchema>;

// --- Asignaciones --------------------------------------------------------

export const assignMemberSchema = z.object({
  memberId: z.string().uuid(),
});
export type AssignMemberInput = z.infer<typeof assignMemberSchema>;

// --- Respuestas ----------------------------------------------------------

export const trainerSchema = z.object({
  id: z.string().uuid(),
  /** De la cuenta, no de esta tabla. */
  name: z.string(),
  email: z.string(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),
  status: trainerStatusSchema,
  /** Cuantos socios lleva ahora mismo. Lo primero que mira un dueno. */
  activeMembers: z.number().int(),
  createdAt: z.string(),
});
export type Trainer = z.infer<typeof trainerSchema>;

/**
 * Un socio visto desde una asignacion.
 *
 * Es la ficha completa mas el momento de la asignacion. El entrenador ve la
 * misma ficha que recepcion —necesita telefono y fecha de nacimiento para
 * programar— pero **solo de los socios que tiene asignados**, y las notas
 * internas siguen sin estar aqui.
 */
export const assignedMemberSchema = memberSchema.extend({
  assignmentId: z.string().uuid(),
  assignedAt: z.string(),
});
export type AssignedMember = z.infer<typeof assignedMemberSchema>;

export const trainerAssignmentSchema = z.object({
  id: z.string().uuid(),
  trainerId: z.string().uuid(),
  memberId: z.string().uuid(),
  assignedAt: z.string(),
  endedAt: z.string().nullable(),
});
export type TrainerAssignment = z.infer<typeof trainerAssignmentSchema>;
