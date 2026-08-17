import { z } from 'zod';

/**
 * Contratos del acceso por QR.
 *
 * El token es opaco para el cliente: una cadena que se pinta como QR y se manda
 * de vuelta. Nada de lo que lleva dentro forma parte del contrato, y por eso el
 * formato puede cambiar sin romper a nadie.
 */

export const ACCESS_DECISIONS = ['ALLOW', 'WARN', 'DENY'] as const;
export const accessDecisionSchema = z.enum(ACCESS_DECISIONS);
export type AccessDecision = z.infer<typeof accessDecisionSchema>;

/**
 * Por que se decidio asi.
 *
 * Se devuelve al escaner para que recepcion sepa que hacer: un `DENY` por cuota
 * vencida se arregla cobrando; uno por token reutilizado puede ser alguien
 * pasando su QR a un amigo, y eso no lo arregla el mostrador.
 */
export const ACCESS_REASONS = [
  'OK',
  'DUES_WARN',
  'DUES_EXPIRED',
  'NO_SUBSCRIPTION',
  'MEMBER_INACTIVE',
  'TOKEN_EXPIRED',
  'TOKEN_REUSED',
  'BAD_SIGNATURE',
  'UNKNOWN_MEMBER',
] as const;
export const accessReasonSchema = z.enum(ACCESS_REASONS);
export type AccessReason = z.infer<typeof accessReasonSchema>;

// --- Generar el QR -------------------------------------------------------

export const accessTokenSchema = z.object({
  token: z.string(),
  /** Cuando caduca, para que la app lo regenere antes. */
  expiresAt: z.string(),
  /** Segundos de vida, por comodidad del cliente. */
  ttlSeconds: z.number().int(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenSchema>;

// --- Verificar -----------------------------------------------------------

export const verifyAccessSchema = z.object({
  token: z.string().min(1).max(500),
});
export type VerifyAccessInput = z.infer<typeof verifyAccessSchema>;

/**
 * Lo que ve recepcion al escanear.
 *
 * Incluye nombre y numero de socio para confirmar visualmente que quien entra es
 * quien dice el QR: es la unica defensa contra que alguien preste su telefono, y
 * mientras no haya foto en la ficha no hay otra.
 */
export const accessResultSchema = z.object({
  decision: accessDecisionSchema,
  reason: accessReasonSchema,
  /** Nulo cuando el token no identifica a nadie de fiar. */
  member: z
    .object({
      id: z.string().uuid(),
      memberNumber: z.number().int(),
      firstName: z.string(),
      lastName: z.string(),
    })
    .nullable(),
  /** Dias que faltan para vencer la cuota. Lo que convierte un WARN en util. */
  diasRestantes: z.number().int().nullable(),
  /** Repeticion tolerada de un reintento por red, no una entrada nueva. */
  isRetry: z.boolean(),
});
export type AccessResult = z.infer<typeof accessResultSchema>;

// --- Historial -----------------------------------------------------------

export const listAccessEventsQuerySchema = z.object({
  memberId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAccessEventsQuery = z.infer<typeof listAccessEventsQuerySchema>;

export const accessEventSchema = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid().nullable(),
  memberName: z.string().nullable(),
  decision: accessDecisionSchema,
  reason: accessReasonSchema,
  isRetry: z.boolean(),
  occurredAt: z.string(),
});
export type AccessEvent = z.infer<typeof accessEventSchema>;

export const accessEventListSchema = z.object({
  items: z.array(accessEventSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type AccessEventList = z.infer<typeof accessEventListSchema>;

// --- El historial que ve el propio socio ---------------------------------

/**
 * Un acceso, visto por quien lo protagonizo.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES EL MISMO CONTRATO QUE EL DEL MOSTRADOR, Y NO POR ADORNO.           │
 * │                                                                          │
 * │ `memberId` y `memberName` sobran: quien mira su propio historial ya sabe │
 * │ quien es, y repetirlo en cada fila solo anade una copia de su nombre     │
 * │ viajando por la red. `id` es interno y el frontend no lo necesita ni     │
 * │ siquiera como clave — la fecha y el indice bastan.                       │
 * │                                                                          │
 * │ Lo que NUNCA estuvo en ninguno de los dos: el `jti`, la firma y la       │
 * │ sesion del escaner. No hay que quitarlos porque nunca salieron de la     │
 * │ base de datos.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * LOS MOTIVOS TECNICOS NO APARECEN AQUI, y tampoco hay que filtrarlos: un
 * `BAD_SIGNATURE` o un `TOKEN_EXPIRED` se registran SIN socio —el token no
 * identifica a nadie de fiar— asi que al buscar por la ficha quedan fuera solos.
 * Los que si pueden salir son `OK`, `DUES_WARN`, `DUES_EXPIRED`,
 * `NO_SUBSCRIPTION`, `MEMBER_INACTIVE` y `TOKEN_REUSED`.
 */
export const ownAccessEventSchema = z.object({
  decision: accessDecisionSchema,
  reason: accessReasonSchema,
  /**
   * Un reintento del mismo escaner por un fallo de red, no una entrada nueva.
   *
   * Se conserva porque sin el, dos filas identicas al mismo segundo parecerian
   * dos entradas y quien lo mire pensaria que alguien uso su codigo dos veces.
   */
  isRetry: z.boolean(),
  occurredAt: z.string(),
});
export type OwnAccessEvent = z.infer<typeof ownAccessEventSchema>;

export const ownAccessEventListSchema = z.object({
  items: z.array(ownAccessEventSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type OwnAccessEventList = z.infer<typeof ownAccessEventListSchema>;

/**
 * La consulta del propio socio. **Sin `memberId`**, y esa ausencia es la
 * seguridad: no hay parametro que manipular para mirar el historial de otro.
 */
export const listOwnAccessEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListOwnAccessEventsQuery = z.infer<typeof listOwnAccessEventsQuerySchema>;

// --- Ajustes del gimnasio ------------------------------------------------

/**
 * Ajustes que el dueno controla y que hasta ahora solo existian en la base de
 * datos: los dias de cortesia del modulo de cuotas y la retencion de accesos.
 */
export const updateGymSettingsSchema = z
  .object({
    graceDays: z.number().int().min(0).max(60).optional(),
    accessEventsRetentionMonths: z.number().int().min(1).max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdateGymSettingsInput = z.infer<typeof updateGymSettingsSchema>;

export const gymSettingsSchema = z.object({
  gymId: z.string().uuid(),
  name: z.string(),
  timezone: z.string(),
  graceDays: z.number().int(),
  accessEventsRetentionMonths: z.number().int(),
});
export type GymSettings = z.infer<typeof gymSettingsSchema>;
