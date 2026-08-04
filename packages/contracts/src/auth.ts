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
  .string({ error: 'Obligatorio' })
  .min(10, 'La contrasena debe tener al menos 10 caracteres')
  .max(200);

/**
 * Los mensajes se escriben aqui, no en el formulario.
 *
 * Es el mismo motivo por el que el esquema vive en `contracts`: el panel valida
 * antes de enviar y el servidor vuelve a validar sin fiarse, y las dos veces
 * debe decir lo mismo. Sin mensaje propio, Zod responde en ingles y con su
 * jerga ("Too small: expected string to have >=1 characters"), que es lo que
 * acabaria leyendo recepcion.
 */
export const emailSchema = z
  // El mensaje del constructor cubre el caso "no ha llegado nada", que es el que
  // se da cuando un formulario envia el campo vacio. Sin el, Zod responde
  // "Invalid input: expected string, received undefined".
  .string({ error: 'Obligatorio' })
  .email('Introduce un correo electronico valido')
  .max(254)
  .toLowerCase()
  .trim();
const nameSchema = z.string({ error: 'Obligatorio' }).trim().min(1, 'Obligatorio').max(120);

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
  // Sin minimo de longitud a proposito: al entrar no se comprueba la politica de
  // contrasenas, solo que se haya escrito algo. Exigir aqui los 10 caracteres
  // delataria la regla y, peor, dejaria fuera a quien tenga una anterior.
  password: z.string({ error: 'Obligatorio' }).min(1, 'Obligatorio'),
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
 * Respuesta de las operaciones que no devuelven datos.
 *
 * Existe como esquema y no como `void` porque el cliente valida TODA respuesta:
 * si `logout` empezara a devolver otra cosa, hay que enterarse igual que con
 * cualquier otro campo.
 */
export const okResponseSchema = z.object({
  ok: z.literal(true),
});
export type OkResponse = z.infer<typeof okResponseSchema>;

/**
 * Respuesta de los flujos que envian un correo.
 *
 * No devuelve el token en ningun entorno: el correo se encola en pg-boss y el
 * token viaja en el, nunca en la respuesta HTTP.
 */
export const emailFlowResponseSchema = okResponseSchema;
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
});
export type Invitation = z.infer<typeof invitationSchema>;

/**
 * Aceptar una invitacion. SOLO para cuentas nuevas (ADR-0010).
 *
 * Si el email ya tiene cuenta, el servidor responde 409 y hay que usar
 * `link-invitation` estando autenticado. Nunca se fija una contrasena sobre una
 * cuenta que ya existe.
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: nameSchema,
  password: passwordSchema,
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

/**
 * Vincular una invitacion a una cuenta que YA existe (ADR-0010).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ NO LLEVA CONTRASENA NI NOMBRE, y eso es la garantia principal.        │
 * │                                                                      │
 * │ Al no existir el dato en el contrato, este endpoint no puede modificar │
 * │ credenciales ni por un error de programacion. Si un token de          │
 * │ invitacion pudiera fijar la contrasena de una cuenta preexistente,     │
 * │ quien lo tuviera se apoderaria de ella — y con ella de su acceso a     │
 * │ otros gimnasios.                                                     │
 * │                                                                      │
 * │ Es una garantia estructural, no una comprobacion que alguien pueda    │
 * │ olvidar: el mismo criterio que llevo a RLS en ADR-0002.               │
 * └──────────────────────────────────────────────────────────────────────┘
 */
export const linkInvitationSchema = z.object({
  token: z.string().min(1),
});
export type LinkInvitationInput = z.infer<typeof linkInvitationSchema>;

/**
 * Respuesta de `link-invitation`.
 *
 * Devuelve el gimnasio al que se acaba de entrar, y hace falta: el endpoint
 * **no** cambia el gimnasio activo de la sesion —quien decide donde opera es la
 * persona, con `switch-gym`— asi que quien vincula necesita saber cual es para
 * poder ofrecerselo. Sin este dato, el cliente acabaria adivinandolo.
 */
export const linkInvitationResponseSchema = z.object({
  ok: z.literal(true),
  gymId: z.string().uuid(),
});
export type LinkInvitationResponse = z.infer<typeof linkInvitationResponseSchema>;

/** Codigo que devuelve `accept-invitation` cuando el email ya tiene cuenta. */
export const ACCOUNT_EXISTS = 'ACCOUNT_EXISTS' as const;

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
