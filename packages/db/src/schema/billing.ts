import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, tenantId, timestamps } from './_helpers';
import { users } from './identity';
import { members } from './members';
import { gyms } from './organization';

/**
 * Modulo `billing` — planes, cuotas de socio y pagos registrados.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GYMLAB NO MUEVE DINERO (asuncion A1, cerrada el 2026-07-30).              │
 * │                                                                          │
 * │ El gimnasio cobra por sus propios medios —efectivo, su TPV, su banco— y   │
 * │ aqui solo se REGISTRA lo ocurrido. No hay pasarela, ni conciliacion, ni   │
 * │ reembolsos. Esto es un libro de registro, no un cobrador.                 │
 * │                                                                          │
 * │ Si algun dia entra Stripe Connect, estas tablas siguen valiendo: lo que   │
 * │ cambiaria es quien las escribe, no lo que guardan.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * EL DINERO SE GUARDA EN CENTIMOS ENTEROS. 19,99 € es 1999. Un `float` acaba
 * dando 19.989999999999998 y el error se acumula justo en los totales que el
 * dueno usa para decidir. `numeric` seria correcto pero innecesario: en centimos
 * no hay fracciones que representar.
 */

/** Periodicidad de un plan. Cuanto dura lo que cubre un pago. */
export const planPeriod = pgEnum('plan_period', ['monthly', 'quarterly', 'yearly']);

/**
 * Estado del plan. Se archiva, nunca se borra: un plan con suscripciones detras
 * dejaria el historial sin explicacion de que estaba pagando cada socio.
 */
export const planStatus = pgEnum('plan_status', ['active', 'archived']);

/**
 * Estado de una suscripcion. SOLO LOS QUE ALGUIEN DECIDE.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ NO EXISTE EL ESTADO "VENCIDA", y es la decision que ordena el modulo.     │
 * │                                                                          │
 * │ Que una cuota este vencida es una consecuencia de `current_period_end`    │
 * │ frente a hoy, y se calcula al leer. Guardarlo ademas seria un segundo     │
 * │ origen de verdad que exige un trabajo nocturno para mantenerlo al dia — y │
 * │ el dia que ese trabajo falle, el gimnasio dejaria entrar a quien no paga  │
 * │ sin que nadie se entere.                                                  │
 * │                                                                          │
 * │ Es el mismo criterio que en `invitations`, que tampoco tiene columna de   │
 * │ estado: caducada, usada o revocada se deducen de sus fechas.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const subscriptionStatus = pgEnum('subscription_status', [
  'active',
  'paused',
  'cancelled',
]);

/** Como se registro el pago. Es informativo: GYMLAB no cobra por ninguna via. */
export const paymentMethod = pgEnum('payment_method', ['cash', 'card', 'transfer', 'other']);

/**
 * Que cubre el pago.
 *
 * `subscription` extiende el periodo de la cuota; `enrolment` es la matricula de
 * alta y no extiende nada; `other` es cualquier cobro suelto que el gimnasio
 * quiera dejar anotado.
 */
export const paymentConcept = pgEnum('payment_concept', ['subscription', 'enrolment', 'other']);

/** Lo que el gimnasio vende. */
export const plans = pgTable(
  'plans',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    /** En centimos. Ver la cabecera del fichero. */
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    period: planPeriod('period').notNull(),
    status: planStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    // Dos planes activos con el mismo nombre solo confunden a recepcion. Parcial:
    // un plan archivado no bloquea el nombre para uno nuevo.
    uniqueIndex('plans_gym_name_active_key')
      .on(t.gymId, sql`lower(${t.name})`)
      .where(sql`status = 'active'`),
    index('plans_gym_id_idx').on(t.gymId),
    // Para que las suscripciones apunten aqui con clave ajena compuesta y no se
    // pueda contratar el plan de otro gimnasio.
    unique('plans_gym_id_key').on(t.gymId, t.id),
  ],
);

/**
 * La cuota de un socio.
 *
 * INVARIANTE QUE MANTIENE EL SERVICIO, y que los tests comprueban:
 *
 *   current_period_end = started_on
 *                      + (pagos de cuota x periodo)
 *                      + dias congelados
 *
 * De ahi que un alta NO conceda periodo: nace con `current_period_end` igual a
 * `started_on`, es decir, vencida hasta que alguien registre el primer pago.
 * Cada periodo lo concede un pago, sin excepciones.
 */
export const memberSubscriptions = pgTable(
  'member_subscriptions',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),
    /**
     * `cascade`: la suscripcion es un dato del socio y muere con el. Los PAGOS
     * no —el gimnasio tiene obligacion fiscal de conservarlos— y por eso alli la
     * regla es otra.
     */
    memberId: uuid('member_id').notNull(),
    /** `restrict`: un plan con suscripciones no se puede borrar, solo archivar. */
    planId: uuid('plan_id').notNull(),

    /**
     * COPIA del precio del plan al contratarlo.
     *
     * Sin ella, subir la mensualidad de 30 a 35 € reescribiria el historial de lo
     * que cada socio estaba pagando. Con ella, las suscripciones vivas siguen a
     * 30 hasta que alguien las cambie explicitamente.
     */
    priceCents: integer('price_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),

    status: subscriptionStatus('status').notNull().default('active'),

    startedOn: date('started_on').notNull(),
    /**
     * Hasta cuando esta cubierta. **Es el dato que decide si el socio pasa el QR.**
     *
     * `date` y no `timestamp`: un gimnasio razona en dias, no en instantes. Que
     * "hoy" sea el dia correcto depende de `gyms.timezone`, no del reloj del
     * servidor.
     */
    currentPeriodEnd: date('current_period_end').notNull(),

    /** Cuando se congelo. Mientras no sea nulo, el estado es `paused`. */
    pausedAt: date('paused_at'),
    /** Dias acumulados de congelacion, ya devueltos al vencimiento. */
    pausedDays: integer('paused_days').notNull().default(0),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // Una suscripcion vigente por socio. Parcial a proposito: las canceladas se
    // conservan como historial y no impiden un alta nueva, que es exactamente el
    // camino de vuelta de quien dejo de pagar y quiere volver.
    uniqueIndex('member_subscriptions_member_vigente_key')
      .on(t.gymId, t.memberId)
      .where(sql`status IN ('active', 'paused')`),
    index('member_subscriptions_gym_member_idx').on(t.gymId, t.memberId),
    // El dashboard preguntara "que cuotas vencen esta semana".
    index('member_subscriptions_gym_period_end_idx').on(t.gymId, t.currentPeriodEnd),
    // Compuestas: la cuota, el socio y el plan han de ser del MISMO gimnasio.
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'member_subscriptions_gym_member_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.gymId, t.planId],
      foreignColumns: [plans.gymId, plans.id],
      name: 'member_subscriptions_gym_plan_fk',
    }).onDelete('restrict'),
    // Para que los pagos apunten aqui con clave ajena compuesta.
    unique('member_subscriptions_gym_id_key').on(t.gymId, t.id),
  ],
);

/**
 * Pagos registrados.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ APPEND-ONLY: no se editan ni se borran, se ANULAN.                        │
 * │                                                                          │
 * │ Un registro de dinero que la aplicacion puede reescribir en silencio no   │
 * │ sirve como registro de dinero. Anular deja quien lo hizo, cuando y por    │
 * │ que, y la fila original intacta. Es el mismo criterio que `audit_log`,    │
 * │ donde ademas se retiran los permisos de UPDATE y DELETE.                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const payments = pgTable(
  'payments',
  {
    id: primaryId(),
    gymId: tenantId().references(() => gyms.id, { onDelete: 'cascade' }),

    /**
     * `set null` Y ANULABLE, al contrario que en el resto del modulo.
     *
     * Cuando alguien ejerce el derecho de supresion (art. 17), su ficha
     * desaparece pero el pago **sobrevive desligado**: importe y fecha siguen
     * ahi para que el gimnasio cuadre su contabilidad, sin ningun dato personal.
     * Lo ampara el art. 17.3.b — la conservacion por obligacion legal prevalece.
     */
    memberId: uuid('member_id'),
    /** Nulo en una matricula o en un cobro suelto, que no cubren cuota. */
    subscriptionId: uuid('subscription_id'),

    concept: paymentConcept('concept').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('EUR'),
    method: paymentMethod('method').notNull(),
    /** El dia que el gimnasio recibio el dinero, que puede no ser hoy. */
    paidOn: date('paid_on').notNull(),
    note: text('note'),

    /** Quien lo apunto. Nulo si esa cuenta se borro. */
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'set null' }),

    ...timestamps,
  },
  (t) => [
    index('payments_gym_member_idx').on(t.gymId, t.memberId),
    index('payments_gym_paid_on_idx').on(t.gymId, t.paidOn),
    index('payments_subscription_idx').on(t.subscriptionId),
    /**
     * ┌────────────────────────────────────────────────────────────────────────┐
     * │ ATENCION AL LEER LA MIGRACION: estas dos claves NO son exactamente lo   │
     * │ que drizzle escribe aqui.                                               │
     * │                                                                        │
     * │ En SQL llevan `ON DELETE SET NULL (member_id)` y                        │
     * │ `ON DELETE SET NULL (subscription_id)` — con la columna entre           │
     * │ parentesis, sintaxis de PostgreSQL 15+. Drizzle no sabe expresar esa    │
     * │ lista, y su `set null` a secas pondria a NULL **todas** las columnas de  │
     * │ la clave, incluido `gym_id`, que es NOT NULL: el borrado de un socio     │
     * │ fallaria con violacion de no-nulo.                                       │
     * │                                                                        │
     * │ Por eso la migracion 0008 ajusta esas dos a mano. El snapshot dice      │
     * │ "set null" y la base de datos dice "set null (columna)"; drizzle nunca   │
     * │ compara contra la base de datos, asi que la divergencia es estable y no  │
     * │ genera migraciones espureas. Hay un test que comprueba el catalogo real. │
     * └────────────────────────────────────────────────────────────────────────┘
     *
     * El comportamiento buscado sigue siendo el del art. 17.3.b: al borrar al
     * socio, el pago sobrevive desligado con su importe y su fecha.
     */
    foreignKey({
      columns: [t.gymId, t.memberId],
      foreignColumns: [members.gymId, members.id],
      name: 'payments_gym_member_fk',
    }).onDelete('set null'),
    foreignKey({
      columns: [t.gymId, t.subscriptionId],
      foreignColumns: [memberSubscriptions.gymId, memberSubscriptions.id],
      name: 'payments_gym_subscription_fk',
    }).onDelete('set null'),
  ],
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;
export type PlanPeriod = (typeof planPeriod.enumValues)[number];
export type MemberSubscription = typeof memberSubscriptions.$inferSelect;
export type NewMemberSubscription = typeof memberSubscriptions.$inferInsert;
export type SubscriptionStatus = (typeof subscriptionStatus.enumValues)[number];
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type PaymentMethod = (typeof paymentMethod.enumValues)[number];
export type PaymentConcept = (typeof paymentConcept.enumValues)[number];
