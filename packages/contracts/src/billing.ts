import { z } from 'zod';

/**
 * Contratos del modulo de planes, cuotas y pagos.
 *
 * GYMLAB **no cobra**: el gimnasio cobra por sus medios y aqui solo se registra
 * lo ocurrido (asuncion A1). Por eso no hay nada de pasarelas, tokens de tarjeta
 * ni reembolsos: `method` es informativo.
 *
 * EL DINERO VIAJA EN CENTIMOS ENTEROS. 19,99 € es 1999. Un decimal en JSON
 * atraviesa `parseFloat` en el cliente y vuelve con 19.989999999999998.
 */

export const PLAN_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;
export const planPeriodSchema = z.enum(PLAN_PERIODS);
export type PlanPeriod = z.infer<typeof planPeriodSchema>;

export const PLAN_STATUSES = ['active', 'archived'] as const;
export const planStatusSchema = z.enum(PLAN_STATUSES);

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'cancelled'] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'other'] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export const PAYMENT_CONCEPTS = ['subscription', 'enrolment', 'other'] as const;
export const paymentConceptSchema = z.enum(PAYMENT_CONCEPTS);
export type PaymentConcept = z.infer<typeof paymentConceptSchema>;

/**
 * Importe en centimos.
 *
 * Se rechaza el negativo —un reembolso no es un pago negativo, es una anulacion—
 * y se pone un techo alto pero finito para que un cero de mas en el mostrador no
 * pase inadvertido.
 */
const centsSchema = z
  .number()
  .int('El importe va en centimos enteros')
  .min(0)
  .max(100_000_00, 'Importe fuera de rango; revisa si sobran ceros');

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado AAAA-MM-DD');

// --- Planes --------------------------------------------------------------

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  priceCents: centsSchema,
  period: planPeriodSchema,
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

/**
 * La periodicidad NO se puede cambiar.
 *
 * Cambiarla reescribiria lo que cubre cada pago ya registrado de las
 * suscripciones vivas. Si un gimnasio quiere pasar de mensual a trimestral, crea
 * un plan nuevo y archiva el viejo: el historial de quien pago que sigue en pie.
 */
export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    priceCents: centsSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada que actualizar');
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const planSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  priceCents: z.number().int(),
  currency: z.string(),
  period: planPeriodSchema,
  status: planStatusSchema,
  /** Cuantas suscripciones vigentes lo usan. Lo que un dueno mira primero. */
  activeSubscriptions: z.number().int(),
});
export type Plan = z.infer<typeof planSchema>;

// --- Suscripciones -------------------------------------------------------

export const createSubscriptionSchema = z.object({
  planId: z.string().uuid(),
  /** Por defecto hoy, en la zona horaria del gimnasio. */
  startedOn: isoDateSchema.optional(),
});
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  planName: z.string(),
  period: planPeriodSchema,
  /** Copia del precio al contratar: subir el plan no reescribe esto. */
  priceCents: z.number().int(),
  currency: z.string(),
  status: subscriptionStatusSchema,
  startedOn: z.string(),
  currentPeriodEnd: z.string(),
  pausedAt: z.string().nullable(),
  pausedDays: z.number().int(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

// --- Estado de cuota: lo que consume el QR (modulo 4) --------------------

/**
 * Estado derivado de la cuota de un socio.
 *
 * NO SE GUARDA EN NINGUNA COLUMNA: se calcula comparando `currentPeriodEnd` con
 * hoy en la zona del gimnasio. Guardarlo obligaria a un trabajo nocturno que lo
 * mantuviera al dia, y el dia que fallara el gimnasio dejaria entrar a quien no
 * paga sin enterarse.
 */
export const DUES_STATES = [
  /** Dentro de periodo con margen. */
  'AL_CORRIENTE',
  /** Dentro de periodo pero vence pronto -> el QR responde WARN. */
  'POR_VENCER',
  /** Vencida, dentro de los dias de cortesia del gimnasio -> WARN. */
  'EN_GRACIA',
  /** Vencida y agotada la cortesia -> DENY. */
  'VENCIDA',
  /** Congelada por vacaciones o lesion -> DENY, pero no es una deuda. */
  'PAUSADA',
  /** Nunca tuvo cuota, o la cancelo -> DENY. */
  'SIN_SUSCRIPCION',
] as const;
export const duesStateSchema = z.enum(DUES_STATES);
export type DuesState = z.infer<typeof duesStateSchema>;

/** A cuantos dias del vencimiento se empieza a avisar. */
export const DIAS_DE_AVISO = 7;

export const duesStatusSchema = z.object({
  estado: duesStateSchema,
  /**
   * El atajo para el torno: solo `true` si puede entrar hoy.
   *
   * Existe para que el modulo 4 no tenga que enumerar estados y arriesgarse a
   * olvidar uno nuevo. Anadir un estado no debe abrir la puerta por accidente.
   */
  puedeAcceder: z.boolean(),
  /** Dias hasta el vencimiento. Negativo si ya vencio. `null` si no hay cuota. */
  diasRestantes: z.number().int().nullable(),
  hasta: z.string().nullable(),
  planName: z.string().nullable(),
});
export type DuesStatus = z.infer<typeof duesStatusSchema>;

// --- Pagos ---------------------------------------------------------------

export const registerPaymentSchema = z.object({
  concept: paymentConceptSchema,
  amountCents: centsSchema,
  method: paymentMethodSchema,
  /** El dia que se recibio el dinero, que puede no ser hoy. Por defecto, hoy. */
  paidOn: isoDateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentSchema>;

/** Anular exige motivo: un pago que desaparece sin explicacion no es auditable. */
export const voidPaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  concept: paymentConceptSchema,
  amountCents: z.number().int(),
  currency: z.string(),
  method: paymentMethodSchema,
  paidOn: z.string(),
  note: z.string().nullable(),
  recordedByUserId: z.string().uuid().nullable(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

/**
 * Lo que devuelve registrar un pago: el pago **y el estado resultante**.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO ES UN PAGO SUELTO, Y ESO ES EL DISENO, NO UN EXTRA.                   │
 * │                                                                          │
 * │ Cada pago cubre exactamente un periodo, encadenado desde el vencimiento  │
 * │ anterior. Con una deuda de varios meses, cobrar uno **no** pone al       │
 * │ corriente: el socio sigue vencido. El mostrador tiene que verlo en ese   │
 * │ momento, no descubrirlo cuando la persona no pase el QR.                 │
 * │                                                                          │
 * │ Por eso la respuesta trae el estado ya recalculado por el servidor. El   │
 * │ cliente no lo deduce ni lo vuelve a pedir.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ESQUEMA LO DESCUBRIO EL PANEL: la API ya respondia asi desde la Fase 1
 * y el contrato no lo describia. Nadie se habia dado cuenta porque hasta ahora
 * el unico consumidor eran los tests, que leen el cuerpo sin validarlo.
 */
export const registerPaymentResponseSchema = z.object({
  payment: paymentSchema,
  dues: duesStatusSchema,
});
export type RegisterPaymentResponse = z.infer<typeof registerPaymentResponseSchema>;
