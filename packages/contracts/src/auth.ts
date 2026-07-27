import { z } from 'zod';

/**
 * Contratos de autenticacion e invitaciones.
 *
 * Se definen una sola vez y los consumen la API, el panel web y la app movil.
 * Cambiar un campo aqui rompe la compilacion en los tres sitios antes de
 * desplegar, que es justo lo que se buscaba en ADR-003.
 */

export const ROLES = ['owner', 'receptionist', 'trainer', 'member'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/**
 * Minimo de contrasena: 10 caracteres.
 *
 * Deliberadamente sin reglas de composicion (mayusculas, simbolos...). La
 * evidencia y las guias actuales (NIST SP 800-63B) coinciden en que empujan a
 * la gente hacia 'Password1!' y a reutilizarla. La longitud aporta mas.
 */
export const passwordSchema = z
  .string()
  .min(10, 'La contrasena debe tener al menos 10 caracteres')
  .max(200);

export const emailSchema = z.string().email().max(254).toLowerCase().trim();
const nameSchema = z.string().trim().min(1).max(120);

// --- Alta de gimnasio ---------------------------------------------------

export const registerGymSchema = z.object({
  organizationName: nameSchema,
  gymName: nameSchema,
  ownerName: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Codigo de plataforma. Se sustituira por el flujo de pago en la Fase 2. */
  platformCode: z.string().min(1),
});
export type RegisterGymInput = z.infer<typeof registerGymSchema>;

// --- Sesion -------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const switchGymSchema = z.object({
  gymId: z.string().uuid(),
});
export type SwitchGymInput = z.infer<typeof switchGymSchema>;

export const gymMembershipSchema = z.object({
  gymId: z.string().uuid(),
  gymName: z.string(),
  role: roleSchema,
});

export const meSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    isPlatformAdmin: z.boolean(),
  }),
  activeGymId: z.string().uuid().nullable(),
  memberships: z.array(gymMembershipSchema),
});
export type Me = z.infer<typeof meSchema>;

export const sessionResponseSchema = z.object({
  token: z.string(),
  activeGymId: z.string().uuid().nullable(),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// --- Contrasena y verificacion -----------------------------------------

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

/**
 * Respuesta de los flujos que envian un correo.
 *
 * `devToken` SOLO aparece con NODE_ENV=development, para poder recorrer el flujo
 * sin proveedor de correo. En produccion nunca se incluye: seria entregar a
 * quien pregunta el token de restablecer la contrasena de otra persona.
 */
export const emailFlowResponseSchema = z.object({
  ok: z.literal(true),
  devToken: z.string().optional(),
});
export type EmailFlowResponse = z.infer<typeof emailFlowResponseSchema>;

// --- Invitaciones -------------------------------------------------------

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const invitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: roleSchema,
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  /** Solo en desarrollo, mientras no exista el envio de correo. */
  devToken: z.string().optional(),
});
export type Invitation = z.infer<typeof invitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: nameSchema,
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Quien puede invitar a quien. Es el control de escalada de privilegios: sin
 * esto, un recepcionista puede crearse un dueno y quedarse con el gimnasio.
 *
 * Vive en `contracts` y no en la API para que el panel web pueda pintar el
 * desplegable de roles con exactamente las mismas reglas que el servidor va a
 * aplicar. Una sola fuente de verdad, aunque el servidor no se fie del cliente.
 */
export const CAN_INVITE: Record<Role, readonly Role[]> = {
  owner: ['owner', 'receptionist', 'trainer', 'member'],
  // Un recepcionista gestiona personal cuando el dueno no esta, de ahi que
  // pueda invitar entrenadores. Nunca un dueno, y de momento tampoco otro
  // recepcionista (seria lateral, no escalada, pero no se ha pedido).
  receptionist: ['trainer', 'member'],
  trainer: [],
  member: [],
} as const;

export function canInvite(actor: Role, target: Role): boolean {
  return CAN_INVITE[actor].includes(target);
}
