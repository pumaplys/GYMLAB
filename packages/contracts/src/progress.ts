import { z } from 'zod';

/**
 * Contratos de progreso: peso y medidas.
 *
 * CATEGORIA ESPECIAL DEL RGPD (art. 9). Toda escritura exige consentimiento
 * vigente, y el servidor lo comprueba en el servicio — no en el controlador— para
 * que la regla se cumpla venga de donde venga la llamada.
 */

/** No hay ninguna version de consentimiento configurada todavia. */
export const CONSENT_NOT_CONFIGURED = 'CONSENT_NOT_CONFIGURED' as const;
/** Hay version vigente, pero este socio no la ha aceptado. */
export const CONSENT_REQUIRED = 'CONSENT_REQUIRED' as const;

/**
 * Medida corporal. Todas opcionales menos que haya al menos una: casi nadie mide
 * todo, y un registro vacio no es un dato, es ruido.
 */
const medidaSchema = z.number().positive().max(999);

export const recordBodyMetricSchema = z
  .object({
    /**
     * Cuando se tomo la medida. Por defecto, ahora.
     *
     * SE ADMITE EL PASADO —el entrenador apunta el lunes lo que peso el sabado—
     * PERO NO EL FUTURO: una medicion fechada manana no existe, solo puede ser
     * un error de teclado. Mismo criterio que la fecha de nacimiento en
     * `members`, donde el futuro tambien se rechaza.
     *
     * Se dan dos minutos de margen para no pelearse con el reloj del cliente:
     * un movil desajustado no deberia impedir registrar un peso.
     */
    measuredAt: z
      .string()
      .datetime()
      .refine(
        (v) => new Date(v).getTime() <= Date.now() + 2 * 60 * 1000,
        'La fecha de la medicion no puede estar en el futuro',
      )
      .optional(),
    weightKg: z.number().positive().max(500).optional(),
    bodyFatPercent: z.number().positive().max(80).optional(),
    chestCm: medidaSchema.optional(),
    waistCm: medidaSchema.optional(),
    hipCm: medidaSchema.optional(),
    armCm: medidaSchema.optional(),
    thighCm: medidaSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(
    (v) =>
      v.weightKg !== undefined ||
      v.bodyFatPercent !== undefined ||
      v.chestCm !== undefined ||
      v.waistCm !== undefined ||
      v.hipCm !== undefined ||
      v.armCm !== undefined ||
      v.thighCm !== undefined,
    'Hay que registrar al menos una medida',
  );
export type RecordBodyMetricInput = z.infer<typeof recordBodyMetricSchema>;

export const bodyMetricSchema = z.object({
  id: z.string().uuid(),
  measuredAt: z.string(),
  weightKg: z.number().nullable(),
  bodyFatPercent: z.number().nullable(),
  chestCm: z.number().nullable(),
  waistCm: z.number().nullable(),
  hipCm: z.number().nullable(),
  armCm: z.number().nullable(),
  thighCm: z.number().nullable(),
  notes: z.string().nullable(),
  /** Bajo que version del consentimiento se recogio este dato concreto. */
  consentVersion: z.string(),
});
export type BodyMetric = z.infer<typeof bodyMetricSchema>;

// --- Consentimiento ------------------------------------------------------

export const grantHealthConsentSchema = z.object({
  /**
   * La version que se acepta. El servidor comprueba que coincide con la vigente:
   * asi una app antigua no puede registrar una aceptacion de un texto viejo.
   */
  version: z.string().min(1).max(40),
});
export type GrantHealthConsentInput = z.infer<typeof grantHealthConsentSchema>;

/**
 * El documento que el socio lee y acepta.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ VIAJA EL TEXTO, NO SOLO SU NOMBRE.                                       │
 * │                                                                          │
 * │ Un consentimiento del art. 9 tiene que ser informado. "Acepto la version │
 * │ 2026-09-01" sin nada que leer no es consentimiento, es un clic — y ante  │
 * │ una autoridad de control no prueba nada.                                 │
 * │                                                                          │
 * │ `controller` es el RESPONSABLE del tratamiento: el gimnasio, no GYMLAB,  │
 * │ que es encargado. Va congelado dentro del documento.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const consentDocumentSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  title: z.string(),
  body: z.string(),
  controller: z.string(),
  publishedAt: z.string(),
});
export type ConsentDocument = z.infer<typeof consentDocumentSchema>;

export const healthConsentStatusSchema = z.object({
  /** Version vigente configurada, o `null` si todavia no hay texto legal. */
  currentVersion: z.string().nullable(),
  accepted: z.boolean(),
  acceptedAt: z.string().nullable(),
  /**
   * El documento vigente, o `null` si el gimnasio no ha publicado ninguno.
   *
   * Los cuatro estados que el modelo permite salen de cruzar estos campos:
   *
   *   document === null                 -> no hay texto legal publicado
   *   document && !accepted             -> hay texto y no lo ha aceptado
   *   document && accepted              -> consentimiento vigente
   *   document && !accepted && acceptedAt === null pero hubo aceptacion antes
   *                                     -> lo revoco, o acepto otra version
   *
   * El cuarto no se distingue del segundo desde aqui a proposito: para el socio
   * la accion es la misma —leer y aceptar— y el historial de lo que revoco vive
   * en `consents`, que es donde tiene valor probatorio.
   */
  document: consentDocumentSchema.nullable(),
});
export type HealthConsentStatus = z.infer<typeof healthConsentStatusSchema>;
