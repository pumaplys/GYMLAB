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
    /** Por defecto ahora. Se admite pasado: el entrenador apunta el lunes lo del sabado. */
    measuredAt: z.string().datetime().optional(),
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

export const healthConsentStatusSchema = z.object({
  /** Version vigente configurada, o `null` si todavia no hay texto legal. */
  currentVersion: z.string().nullable(),
  accepted: z.boolean(),
  acceptedAt: z.string().nullable(),
});
export type HealthConsentStatus = z.infer<typeof healthConsentStatusSchema>;
