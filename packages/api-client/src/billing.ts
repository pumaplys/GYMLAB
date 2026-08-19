import {
  duesStatusSchema,
  paymentSchema,
  planSchema,
  registerPaymentResponseSchema,
  subscriptionSchema,
  type CreatePlanInput,
  type CreateSubscriptionInput,
  type DuesStatus,
  type Payment,
  type Plan,
  type RegisterPaymentInput,
  type RegisterPaymentResponse,
  type Subscription,
  type UpdatePlanInput,
} from '@gymlab/contracts';
import { z } from 'zod';
import type { Http, RequestOptions } from './http';

/**
 * Planes, cuotas y pagos.
 *
 * GYMLAB **no cobra**: el gimnasio cobra por sus medios y aqui solo se registra
 * lo ocurrido. Por eso no hay nada de pasarelas ni de reembolsos — anular un
 * pago es otra cosa y es del dueno.
 *
 * EL DINERO VIAJA EN CENTIMOS ENTEROS: 19,99 € es 1999. Un decimal en JSON
 * vuelve del cliente como 19.989999999999998.
 */
export interface BillingApi {
  /**
   * El catalogo de planes del gimnasio.
   *
   * Lo leen dueno y recepcion: hace falta para elegir el plan al dar de alta
   * una cuota. Crearlos y cambiarles el precio sigue siendo solo del dueno.
   */
  listPlans(gymId: string, options?: RequestOptions): Promise<Plan[]>;

  /**
   * Crea un plan. Solo el dueno.
   *
   * Sin esto, un gimnasio nuevo **no puede cobrar a nadie**: nace con el
   * catalogo vacio, y dar de alta una cuota exige un `planId`.
   */
  createPlan(gymId: string, input: CreatePlanInput, options?: RequestOptions): Promise<Plan>;

  /**
   * Cambia nombre, descripcion o precio.
   *
   * ┌──────────────────────────────────────────────────────────────────────┐
   * │ LA PERIODICIDAD NO ESTA, Y NO ES UN OLVIDO.                          │
   * │                                                                      │
   * │ `updatePlanSchema` no la admite: cambiarla reescribiria lo que cubre │
   * │ cada pago ya registrado de las suscripciones vivas. Quien pago un    │
   * │ mes pasaria a haber pagado un trimestre, retroactivamente.           │
   * │                                                                      │
   * │ Para cambiarla se crea otro plan y se archiva el viejo, y asi el     │
   * │ historial de quien pago que sigue en pie. Igual que en otras partes  │
   * │ del proyecto, la garantia es que el dato NO EXISTE en el contrato.   │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * Cambiar el precio **no** toca las suscripciones ya cobradas: los pagos
   * guardan su importe.
   */
  updatePlan(
    gymId: string,
    planId: string,
    input: UpdatePlanInput,
    options?: RequestOptions,
  ): Promise<Plan>;

  /**
   * Archiva un plan: deja de ofrecerse para cuotas nuevas.
   *
   * No lo borra. Las suscripciones que ya lo usan siguen vivas — de ahi que el
   * catalogo traiga `activeSubscriptions`, que es lo que hay que mirar antes.
   */
  archivePlan(gymId: string, planId: string, options?: RequestOptions): Promise<Plan>;

  /**
   * El estado de la cuota de un socio.
   *
   * NO es una columna: se calcula comparando el fin de periodo con hoy en la
   * zona del gimnasio. Por eso se pregunta, no se deduce de la suscripcion.
   */
  dues(gymId: string, memberId: string, options?: RequestOptions): Promise<DuesStatus>;

  /** Le da de alta una cuota con el plan elegido. */
  subscribe(
    gymId: string,
    memberId: string,
    input: CreateSubscriptionInput,
    options?: RequestOptions,
  ): Promise<Subscription>;

  /**
   * Registra un pago ya cobrado, y devuelve **el estado resultante**.
   *
   * Un pago de cuota extiende el periodo exactamente uno; la matricula no lo
   * extiende. Con una deuda de varios meses, cobrar uno NO pone al corriente —
   * y por eso la respuesta trae el estado recalculado: para que el mostrador lo
   * vea en ese momento en lugar de suponerlo.
   */
  registerPayment(
    gymId: string,
    memberId: string,
    input: RegisterPaymentInput,
    options?: RequestOptions,
  ): Promise<RegisterPaymentResponse>;

  /** Historial, incluidos los anulados: la tabla es append-only. */
  listPayments(gymId: string, memberId: string, options?: RequestOptions): Promise<Payment[]>;

  /**
   * Anula un pago. NO lo borra.
   *
   * La tabla es append-only: anular marca `voidedAt` y `voidReason` y la fila
   * sigue en el historial. Un cobro que desaparece deja un descuadre que nadie
   * puede explicar seis meses despues.
   *
   * El motivo es OBLIGATORIO —minimo tres caracteres, lo exige el contrato— y
   * por eso viaja como argumento propio: sin el, la anulacion no cuenta nada.
   */
  voidPayment(
    gymId: string,
    paymentId: string,
    reason: string,
    options?: RequestOptions,
  ): Promise<Payment>;

  /** Congela la cuota. Falla si ya esta congelada o si esta vencida. */
  pause(gymId: string, memberId: string, options?: RequestOptions): Promise<Subscription>;

  /** Reanuda una cuota congelada. Falla si no lo estaba. */
  resume(gymId: string, memberId: string, options?: RequestOptions): Promise<Subscription>;

  /** Da de baja la cuota. No devuelve nada: deja de haber suscripcion vigente. */
  cancel(gymId: string, memberId: string, options?: RequestOptions): Promise<void>;
}

export function createBillingApi(http: Http): BillingApi {
  const socio = (gymId: string, memberId: string) =>
    `/gyms/${encodeURIComponent(gymId)}/members/${encodeURIComponent(memberId)}`;
  const planes = (gymId: string) => `/gyms/${encodeURIComponent(gymId)}/plans`;

  return {
    listPlans: (gymId, options) =>
      http({ method: 'GET', path: planes(gymId), schema: z.array(planSchema), ...options }),

    createPlan: (gymId, input, options) =>
      http({ method: 'POST', path: planes(gymId), body: input, schema: planSchema, ...options }),

    updatePlan: (gymId, planId, input, options) =>
      http({
        method: 'PATCH',
        path: `${planes(gymId)}/${encodeURIComponent(planId)}`,
        body: input,
        schema: planSchema,
        ...options,
      }),

    archivePlan: (gymId, planId, options) =>
      http({
        method: 'POST',
        path: `${planes(gymId)}/${encodeURIComponent(planId)}/archive`,
        schema: planSchema,
        ...options,
      }),

    dues: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `${socio(gymId, memberId)}/dues`,
        schema: duesStatusSchema,
        ...options,
      }),

    subscribe: (gymId, memberId, input, options) =>
      http({
        method: 'POST',
        path: `${socio(gymId, memberId)}/subscription`,
        body: input,
        schema: subscriptionSchema,
        ...options,
      }),

    registerPayment: (gymId, memberId, input, options) =>
      http({
        method: 'POST',
        path: `${socio(gymId, memberId)}/payments`,
        body: input,
        schema: registerPaymentResponseSchema,
        ...options,
      }),

    listPayments: (gymId, memberId, options) =>
      http({
        method: 'GET',
        path: `${socio(gymId, memberId)}/payments`,
        schema: z.array(paymentSchema),
        ...options,
      }),

    voidPayment: (gymId, paymentId, reason, options) =>
      http({
        method: 'POST',
        // Cuelga del gimnasio y no del socio: un pago se identifica solo, y
        // exigir el socio abriria la puerta a anular el pago de otro pasando
        // el suyo. Es la ruta que ya expone el servidor.
        path: `/gyms/${encodeURIComponent(gymId)}/payments/${encodeURIComponent(paymentId)}/void`,
        body: { reason },
        schema: paymentSchema,
        ...options,
      }),

    pause: (gymId, memberId, options) =>
      http({
        method: 'POST',
        path: `${socio(gymId, memberId)}/subscription/pause`,
        schema: subscriptionSchema,
        ...options,
      }),

    resume: (gymId, memberId, options) =>
      http({
        method: 'POST',
        path: `${socio(gymId, memberId)}/subscription/resume`,
        schema: subscriptionSchema,
        ...options,
      }),

    cancel: (gymId, memberId, options) =>
      http({
        method: 'DELETE',
        path: `${socio(gymId, memberId)}/subscription`,
        // El servidor no devuelve cuerpo: deja de haber cuota vigente y no hay
        // nada que describir. `z.unknown()` en vez de inventar una respuesta.
        schema: z.unknown(),
        ...options,
      }).then(() => undefined),
  };
}
