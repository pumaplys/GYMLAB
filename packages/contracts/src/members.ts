import { z } from 'zod';
import { emailSchema } from './auth';

/**
 * Contratos del modulo de socios.
 *
 * Se definen una vez y los consumen la API, el panel web y la app movil, asi que
 * la validacion del servidor y la del cliente no pueden separarse (ADR-003). El
 * servidor valida igualmente: el cliente no es de fiar.
 */

export const MEMBER_STATUSES = ['active', 'inactive'] as const;
export const memberStatusSchema = z.enum(MEMBER_STATUSES);
export type MemberStatus = z.infer<typeof memberStatusSchema>;

const nameSchema = z.string().trim().min(1, 'Obligatorio').max(120);

/**
 * Telefono con validacion deliberadamente laxa.
 *
 * Los formatos varian por pais, con prefijos, espacios y guiones. Una expresion
 * estricta rechazaria numeros validos, y el coste de un telefono mal escrito es
 * una llamada fallida — no una brecha de seguridad. Se comprueba longitud y que
 * solo haya digitos y separadores.
 */
const phoneSchema = z
  .string()
  .trim()
  .min(6)
  .max(30)
  .regex(/^[+0-9()\-.\s]+$/, 'Solo digitos, espacios y los signos + ( ) - .');

/**
 * Fecha de nacimiento.
 *
 * Se rechaza el futuro y cualquier cosa anterior a 1900: son errores de teclado,
 * no personas. No se impone edad minima: los gimnasios tienen socios menores y
 * decidir eso es del negocio, no de la validacion.
 */
const birthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado AAAA-MM-DD')
  .refine((v) => {
    const fecha = new Date(`${v}T00:00:00Z`);
    if (Number.isNaN(fecha.getTime())) return false;
    return fecha <= new Date() && fecha >= new Date('1900-01-01T00:00:00Z');
  }, 'Fecha no verosimil');

// --- Alta y edicion ------------------------------------------------------

export const createMemberSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  /** Nullable: solo hace falta para invitar a crear cuenta. */
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  birthDate: birthDateSchema.optional(),
});
export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/** Toda edicion es parcial, pero al menos un campo. */
export const updateMemberSchema = createMemberSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

/**
 * Lo que el propio socio puede cambiar de su ficha.
 *
 * Solo telefono y fecha de nacimiento. NO el nombre, que es dato de contrato y
 * lo corrige recepcion; y NO el email, que es el vinculo con su cuenta y
 * cambiarlo exige un flujo verificado.
 */
export const updateOwnProfileSchema = z
  .object({
    phone: phoneSchema.optional(),
    birthDate: birthDateSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>;

// --- Listado -------------------------------------------------------------

export const listMembersQuerySchema = z.object({
  /** Busca por nombre, apellido, email o numero de socio. */
  q: z.string().trim().max(120).optional(),
  status: memberStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

// --- Respuestas ----------------------------------------------------------

export const memberSchema = z.object({
  id: z.string().uuid(),
  memberNumber: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  birthDate: z.string().nullable(),
  status: memberStatusSchema,
  joinedAt: z.string(),
  leftAt: z.string().nullable(),
  /** Si tiene cuenta creada. No se expone el id de usuario. */
  hasAccount: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const memberListSchema = z.object({
  items: z.array(memberSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type MemberList = z.infer<typeof memberListSchema>;

// --- Notas internas ------------------------------------------------------

export const createMemberNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
export type CreateMemberNoteInput = z.infer<typeof createMemberNoteSchema>;

export const memberNoteSchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  authorUserId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type MemberNote = z.infer<typeof memberNoteSchema>;
