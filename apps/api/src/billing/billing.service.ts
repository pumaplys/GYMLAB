import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  auditLog,
  count,
  desc,
  eq,
  isNull,
  memberSubscriptions,
  payments,
  plans,
  sql,
  type MemberSubscription as SubscriptionRow,
  type Payment as PaymentRow,
  type Plan as PlanRow,
} from '@gymlab/db';
import {
  DIAS_DE_AVISO,
  type CreatePlanInput,
  type DuesStatus,
  type ListOwnPaymentsQuery,
  type OwnPaymentList,
  type Payment,
  type Plan,
  type PlanPeriod,
  type RegisterPaymentInput,
  type Subscription,
  type UpdatePlanInput,
} from '@gymlab/contracts';
import { requireRequestContext, requireTransaction } from '../common/request-context';
import { MembersService } from '../members/members.service';

/**
 * Cuanto cubre un pago de cada plan.
 *
 * Se resuelve en PostgreSQL con `interval` y no en JavaScript a proposito: sumar
 * un mes a un 31 de enero es una trampa clasica. Postgres devuelve el 28 o 29 de
 * febrero; hacerlo a mano con dias produce un 3 de marzo.
 */
const INTERVALO: Record<PlanPeriod, string> = {
  monthly: '1 month',
  quarterly: '3 months',
  yearly: '1 year',
};

/**
 * Planes, cuotas y pagos registrados.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ LA REGLA DEL MODULO, y es una sola: CADA PAGO CUBRE EXACTAMENTE UN        │
 * │ PERIODO, encadenado desde el vencimiento anterior. Sin excepciones y sin  │
 * │ mirar la antiguedad de la deuda.                                          │
 * │                                                                          │
 * │ De ahi sale un invariante que los tests comprueban:                       │
 * │                                                                          │
 * │   current_period_end = started_on                                         │
 * │                      + (pagos de cuota vigentes x periodo)                │
 * │                      + dias congelados                                    │
 * │                                                                          │
 * │ Consecuencia deliberada: quien lleva meses sin pagar no se pone al        │
 * │ corriente con un pago. El camino de vuelta es cancelar y dar de alta de   │
 * │ nuevo, que es una decision de recepcion — no del sistema cambiando de     │
 * │ criterio segun lo vieja que sea la deuda.                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
@Injectable()
export class BillingService {
  /**
   * Se pide a `members`, no se lee su tabla (ADR-0006).
   *
   * La direccion es `billing -> members` y solo esa. La vuelta —exportar cuotas y
   * pagos de un socio— va por el punto de extension de ADR-0011, cuyo
   * implementador no depende de este servicio justo para no cerrar el ciclo.
   */
  constructor(private readonly members: MembersService) {}

  // --- Planes --------------------------------------------------------------

  async createPlan(gymId: string, input: CreatePlanInput): Promise<Plan> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    const [fila] = await tx
      .insert(plans)
      .values({
        gymId,
        name: input.name,
        description: input.description ?? null,
        priceCents: input.priceCents,
        period: input.period,
      })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'plan.created',
      entityType: 'plan',
      entityId: fila!.id,
      metadata: { period: input.period, priceCents: input.priceCents },
    });

    return this.planToDto(fila!, 0);
  }

  async listPlans(gymId: string): Promise<Plan[]> {
    const tx = requireTransaction();
    const filas = await tx
      .select({
        plan: plans,
        // ┌──────────────────────────────────────────────────────────────────┐
        // │ `plans.id` VA ESCRITO, NO INTERPOLADO. NO ES UN DESCUIDO.        │
        // │                                                                  │
        // │ Con `${plans.id}`, Drizzle rinde la columna SIN CUALIFICAR —     │
        // │ `"id"` a secas—. Dentro de esta subconsulta eso ya no apunta a   │
        // │ `plans` sino a `member_subscriptions`, asi que la condicion      │
        // │ quedaba `s.plan_id = s.id`: un identificador de suscripcion      │
        // │ comparado consigo mismo. Nunca es cierto.                        │
        // │                                                                  │
        // │ El contador daba 0 SIEMPRE, en todos los planes y todos los      │
        // │ gimnasios, y sin ningun error que lo delatara. Se vio al montar  │
        // │ la pantalla de planes: la confirmacion antes de archivar avisa   │
        // │ de cuantas cuotas dependen del plan, y nunca podia avisar.       │
        // └──────────────────────────────────────────────────────────────────┘
        activas: sql<number>`(
          SELECT count(*) FROM member_subscriptions s
          WHERE s.plan_id = plans.id AND s.status IN ('active', 'paused')
        )::int`,
      })
      .from(plans)
      .where(eq(plans.gymId, gymId))
      .orderBy(plans.status, plans.name);

    return filas.map((f) => this.planToDto(f.plan, Number(f.activas)));
  }

  async updatePlan(gymId: string, id: string, input: UpdatePlanInput): Promise<Plan> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscarPlan(gymId, id);

    if (actual.status === 'archived') {
      throw new BadRequestException('Ese plan esta archivado. Crea uno nuevo.');
    }

    await tx
      .update(plans)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(plans.gymId, gymId), eq(plans.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'plan.updated',
      entityType: 'plan',
      entityId: id,
      // Con el precio SI se guarda el valor: es dato de negocio, no personal, y
      // saber cuando subio una cuota es justo lo que se consulta despues.
      metadata: { campos: Object.keys(input), priceCents: input.priceCents },
    });

    return this.getPlan(gymId, id);
  }

  /**
   * Archiva un plan: deja de poder contratarse, pero no desaparece.
   *
   * Las suscripciones vivas siguen igual, con su copia del precio. Borrarlo
   * dejaria el historial sin explicacion de que estaba pagando cada socio, y la
   * clave ajena es `restrict` precisamente para que nadie pueda.
   */
  async archivePlan(gymId: string, id: string): Promise<Plan> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const actual = await this.buscarPlan(gymId, id);

    if (actual.status === 'archived') {
      throw new BadRequestException('Ese plan ya esta archivado.');
    }

    await tx
      .update(plans)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(and(eq(plans.gymId, gymId), eq(plans.id, id)));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'plan.archived',
      entityType: 'plan',
      entityId: id,
    });

    return this.getPlan(gymId, id);
  }

  async getPlan(gymId: string, id: string): Promise<Plan> {
    const todos = await this.listPlans(gymId);
    const plan = todos.find((p) => p.id === id);
    if (!plan) throw new NotFoundException('Plan no encontrado.');
    return plan;
  }

  // --- Suscripciones -------------------------------------------------------

  /**
   * Da de alta la cuota de un socio.
   *
   * NACE VENCIDA, y es intencionado: `current_period_end` arranca igual a
   * `started_on`, de modo que el socio no esta al corriente hasta que alguien
   * registre el primer pago. Conceder un periodo en el alta seria regalar un mes
   * a quien todavia no ha pagado, y rompería el invariante de que cada periodo
   * lo concede un pago.
   */
  async subscribe(
    gymId: string,
    memberId: string,
    planId: string,
    startedOn?: string,
  ): Promise<Subscription> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    const socio = await this.members.getById(gymId, memberId);
    if (socio.status !== 'active') {
      throw new BadRequestException('Ese socio esta de baja.');
    }

    const plan = await this.buscarPlan(gymId, planId);
    if (plan.status === 'archived') {
      throw new BadRequestException('Ese plan esta archivado; elige uno activo.');
    }

    if (await this.vigenteDe(gymId, memberId)) {
      throw new BadRequestException(
        'Ese socio ya tiene una cuota vigente. Cancelala antes de dar de alta otra.',
      );
    }

    const inicio = startedOn ?? (await this.hoy(gymId));

    const [fila] = await tx
      .insert(memberSubscriptions)
      .values({
        gymId,
        memberId,
        planId,
        priceCents: plan.priceCents,
        currency: plan.currency,
        startedOn: inicio,
        currentPeriodEnd: inicio,
      })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'subscription.created',
      entityType: 'subscription',
      entityId: fila!.id,
      metadata: { planId, startedOn: inicio },
    });

    return this.subToDto(fila!, plan);
  }

  /**
   * Congela la cuota por vacaciones o lesion.
   *
   * Solo se puede congelar lo que todavia cubre algo: si ya venció, no hay dias
   * que guardar y congelarla solo produciria un vencimiento futuro absurdo.
   */
  async pause(gymId: string, memberId: string): Promise<Subscription> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const sub = await this.exigirVigente(gymId, memberId);

    if (sub.status === 'paused') throw new BadRequestException('Esa cuota ya esta congelada.');

    const hoy = await this.hoy(gymId);
    if (sub.currentPeriodEnd < hoy) {
      throw new BadRequestException(
        'No se puede congelar una cuota vencida: no quedan dias que guardar.',
      );
    }

    await tx
      .update(memberSubscriptions)
      .set({ status: 'paused', pausedAt: hoy, updatedAt: new Date() })
      .where(eq(memberSubscriptions.id, sub.id));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'subscription.paused',
      entityType: 'subscription',
      entityId: sub.id,
    });

    return this.getSubscription(gymId, memberId);
  }

  /**
   * Reanuda y DEVUELVE LOS DIAS CONGELADOS al vencimiento.
   *
   * Es el motivo de que esto se modelara desde el principio: quien se va tres
   * semanas no pierde lo que pago. Anadirlo despues obliga a recalcular
   * vencimientos ya emitidos.
   */
  async resume(gymId: string, memberId: string): Promise<Subscription> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const sub = await this.exigirVigente(gymId, memberId);

    if (sub.status !== 'paused') throw new BadRequestException('Esa cuota no esta congelada.');

    const hoy = await this.hoy(gymId);

    const [fila] = await tx
      .update(memberSubscriptions)
      .set({
        status: 'active',
        pausedAt: null,
        // La resta de fechas va en SQL: `date - date` da los dias exactos sin
        // que ninguna zona horaria de JavaScript se meta por medio. Y va como
        // parametro, no interpolada en el texto de la consulta.
        currentPeriodEnd: sql`current_period_end + (${hoy}::date - paused_at)`,
        pausedDays: sql`paused_days + (${hoy}::date - paused_at)`,
        updatedAt: new Date(),
      })
      .where(eq(memberSubscriptions.id, sub.id))
      .returning({ dias: memberSubscriptions.pausedDays });

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'subscription.resumed',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { diasCongeladosAcumulados: fila?.dias },
    });

    return this.getSubscription(gymId, memberId);
  }

  /**
   * Cancela la cuota vigente.
   *
   * Libera el indice unico parcial, de modo que el socio puede volver a darse de
   * alta. **Es el camino de vuelta previsto** para quien lleva meses sin pagar:
   * cancelar y dar de alta de nuevo, en lugar de que el sistema decida solo.
   */
  async cancel(gymId: string, memberId: string): Promise<void> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();
    const sub = await this.exigirVigente(gymId, memberId);

    await tx
      .update(memberSubscriptions)
      .set({ status: 'cancelled', cancelledAt: new Date(), pausedAt: null, updatedAt: new Date() })
      .where(eq(memberSubscriptions.id, sub.id));

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'subscription.cancelled',
      entityType: 'subscription',
      entityId: sub.id,
    });
  }

  async getSubscription(gymId: string, memberId: string): Promise<Subscription> {
    const sub = await this.exigirVigente(gymId, memberId);
    return this.subToDto(sub, await this.buscarPlan(gymId, sub.planId));
  }

  // --- Estado de cuota: lo que consumira el QR ------------------------------

  /**
   * ¿Esta el socio al corriente hoy?
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ ESTE ES EL METODO QUE CONSUMIRA EL MODULO 4. La direccion sera            │
   * │ `access -> billing`, nunca al reves: el QR pregunta y aqui se responde.   │
   * │                                                                          │
   * │ Devuelve `puedeAcceder` ya resuelto para que el torno no tenga que        │
   * │ enumerar estados. Anadir un estado nuevo no debe abrir la puerta por      │
   * │ descuido.                                                                 │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * NO mira si el socio esta de baja: eso es de `members`, y quien decida el
   * acceso tendra que comprobar las dos cosas. Mezclarlas aqui haria imposible
   * distinguir "no paga" de "ya no es socio", que son avisos distintos en el
   * mostrador.
   *
   * "Hoy" se calcula en la zona del gimnasio (`gyms.timezone`): a las 02:00 de
   * un lunes en Madrid, el servidor en UTC todavia cree que es domingo.
   */
  async estadoDe(gymId: string, memberId: string): Promise<DuesStatus> {
    const tx = requireTransaction();

    const res = await tx.execute<{
      status: string;
      current_period_end: string;
      plan_name: string;
      dias: number;
      grace_days: number;
    }>(sql`
      SELECT s.status,
             s.current_period_end,
             p.name AS plan_name,
             (s.current_period_end - (now() AT TIME ZONE g.timezone)::date)::int AS dias,
             g.grace_days
      FROM member_subscriptions s
      JOIN plans p ON p.id = s.plan_id
      JOIN gyms g ON g.id = s.gym_id
      WHERE s.gym_id = ${gymId}
        AND s.member_id = ${memberId}
        AND s.status IN ('active', 'paused')
      LIMIT 1
    `);

    const fila = res.rows[0];
    if (!fila) {
      return {
        estado: 'SIN_SUSCRIPCION',
        puedeAcceder: false,
        diasRestantes: null,
        hasta: null,
        planName: null,
      };
    }

    const dias = Number(fila.dias);
    const base = {
      diasRestantes: dias,
      hasta: fila.current_period_end,
      planName: fila.plan_name,
    };

    if (fila.status === 'paused') {
      return { ...base, estado: 'PAUSADA', puedeAcceder: false };
    }
    if (dias >= DIAS_DE_AVISO) {
      return { ...base, estado: 'AL_CORRIENTE', puedeAcceder: true };
    }
    if (dias >= 0) {
      return { ...base, estado: 'POR_VENCER', puedeAcceder: true };
    }
    if (dias >= -Number(fila.grace_days)) {
      return { ...base, estado: 'EN_GRACIA', puedeAcceder: true };
    }
    return { ...base, estado: 'VENCIDA', puedeAcceder: false };
  }

  /**
   * Lo mismo, pero partiendo de la sesion: la via del propio socio.
   *
   * Parte del `userId` y nunca de un `memberId` de la peticion, asi que no hay
   * parametro con el que mirar la cuota de otro. Si no tiene ficha en este
   * gimnasio, `getOwnProfile` responde 404 antes de llegar aqui.
   */
  async estadoDeUsuario(gymId: string, userId: string): Promise<DuesStatus> {
    const ficha = await this.members.getOwnProfile(gymId, userId);
    return this.estadoDe(gymId, ficha.id);
  }

  // --- Pagos ---------------------------------------------------------------

  /**
   * Registra un pago. Si cubre cuota, extiende el periodo UNA vez.
   *
   * Encadenado desde `current_period_end`, no desde hoy: la fecha de cobro se
   * mantiene estable mes a mes, que es lo que un gimnasio necesita para prever
   * su caja. Quien paga tarde paga los dias que ya uso.
   */
  async registerPayment(
    gymId: string,
    memberId: string,
    input: RegisterPaymentInput,
  ): Promise<{ payment: Payment; dues: DuesStatus }> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    await this.members.getById(gymId, memberId);
    const hoy = await this.hoy(gymId);

    let subscriptionId: string | null = null;

    if (input.concept === 'subscription') {
      const sub = await this.exigirVigente(gymId, memberId);
      if (sub.status === 'paused') {
        throw new BadRequestException(
          'Esa cuota esta congelada. Reanudala antes de registrar el pago.',
        );
      }
      subscriptionId = sub.id;

      const plan = await this.buscarPlan(gymId, sub.planId);
      await tx
        .update(memberSubscriptions)
        .set({
          currentPeriodEnd: sql`current_period_end + ${INTERVALO[plan.period]}::interval`,
          updatedAt: new Date(),
        })
        .where(eq(memberSubscriptions.id, sub.id));
    }

    const [fila] = await tx
      .insert(payments)
      .values({
        gymId,
        memberId,
        subscriptionId,
        concept: input.concept,
        amountCents: input.amountCents,
        method: input.method,
        paidOn: input.paidOn ?? hoy,
        note: input.note ?? null,
        recordedByUserId: actorUserId,
      })
      .returning();

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'payment.recorded',
      entityType: 'payment',
      entityId: fila!.id,
      metadata: { concept: input.concept, amountCents: input.amountCents },
    });

    // Se devuelve el estado resultante para que el mostrador vea de inmediato si
    // el socio SIGUE vencido tras pagar — que con la regla de un pago = un
    // periodo es exactamente lo que ocurre con una deuda de varios meses.
    return { payment: this.pagoToDto(fila!), dues: await this.estadoDe(gymId, memberId) };
  }

  async listPayments(gymId: string, memberId: string): Promise<Payment[]> {
    const tx = requireTransaction();
    await this.members.getById(gymId, memberId);

    const filas = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.gymId, gymId), eq(payments.memberId, memberId)))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt));

    return filas.map((f) => this.pagoToDto(f));
  }

  /**
   * Mis pagos, como socio. Paginados.
   *
   * ┌──────────────────────────────────────────────────────────────────────────┐
   * │ METODO APARTE Y NO UN PARAMETRO EN `listPayments`.                       │
   * │                                                                          │
   * │ El listado del mostrador devuelve la lista entera y hay pantallas que    │
   * │ cuentan con eso. Anadirle paginacion "por defecto" cambiaria en silencio │
   * │ lo que reciben, y un consumidor que esperaba un array y recibe un objeto │
   * │ con `items` falla en el sitio equivocado.                                 │
   * │                                                                          │
   * │ Ademas el DTO es otro: aqui no salen ni la nota del mostrador ni quien   │
   * │ cobro. Son dos respuestas distintas, no la misma con un filtro.          │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * Los ANULADOS entran. No son ruido: anular retira el periodo que el pago
   * concedio, asi que son justo lo que explica por que una cuota volvio atras.
   *
   * Y los pagos de una ficha borrada quedan con `member_id` a nulo, asi que este
   * filtro los deja fuera solos. No se intenta recuperarlos por correo ni por
   * cuenta: eso desharia el borrado del art. 17.
   */
  async listMyPayments(
    gymId: string,
    userId: string,
    query: ListOwnPaymentsQuery,
  ): Promise<OwnPaymentList> {
    const tx = requireTransaction();
    const ficha = await this.members.getOwnProfile(gymId, userId);

    const where = and(eq(payments.gymId, gymId), eq(payments.memberId, ficha.id));

    const [filas, [total]] = await Promise.all([
      tx
        .select()
        .from(payments)
        .where(where)
        .orderBy(desc(payments.paidOn), desc(payments.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      tx.select({ n: count() }).from(payments).where(where),
    ]);

    return {
      items: filas.map((f) => ({
        id: f.id,
        concept: f.concept,
        amountCents: f.amountCents,
        currency: f.currency,
        method: f.method,
        paidOn: f.paidOn,
        voidedAt: f.voidedAt?.toISOString() ?? null,
        voidReason: f.voidReason,
      })),
      total: Number(total?.n ?? 0),
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * Anula un pago. NO lo borra.
   *
   * Si cubria cuota, RETIRA el periodo que concedio. De lo contrario el
   * invariante dejaria de cumplirse y el socio conservaria un mes que nadie pago.
   */
  async voidPayment(gymId: string, paymentId: string, reason: string): Promise<Payment> {
    const tx = requireTransaction();
    const { userId: actorUserId } = requireRequestContext();

    const [pago] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.gymId, gymId), eq(payments.id, paymentId)))
      .limit(1);

    if (!pago) throw new NotFoundException('Pago no encontrado.');
    if (pago.voidedAt) throw new BadRequestException('Ese pago ya esta anulado.');

    if (pago.concept === 'subscription' && pago.subscriptionId) {
      const [sub] = await tx
        .select()
        .from(memberSubscriptions)
        .where(eq(memberSubscriptions.id, pago.subscriptionId))
        .limit(1);

      if (sub) {
        const plan = await this.buscarPlan(gymId, sub.planId);
        await tx
          .update(memberSubscriptions)
          .set({
            currentPeriodEnd: sql`current_period_end - ${INTERVALO[plan.period]}::interval`,
            updatedAt: new Date(),
          })
          .where(eq(memberSubscriptions.id, sub.id));
      }
    }

    const [fila] = await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidReason: reason, voidedByUserId: actorUserId })
      .where(and(eq(payments.gymId, gymId), eq(payments.id, paymentId), isNull(payments.voidedAt)))
      .returning();

    if (!fila) throw new BadRequestException('Ese pago ya estaba anulado.');

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'payment.voided',
      entityType: 'payment',
      entityId: paymentId,
      metadata: { reason },
    });

    return this.pagoToDto(fila);
  }

  /**
   * Metricas de cuotas e ingresos para el panel.
   *
   * `sinSuscripcion` es la que mas vale de las cinco: socios ACTIVOS sin ninguna
   * cuota vigente. Es dinero que el gimnasio cree estar cobrando y no cobra, y
   * no aparece en ninguna otra pantalla.
   *
   * Los ingresos excluyen los pagos anulados. Sumarlos convertiria una
   * correccion de un error de tecleo en facturacion inventada.
   */
  async stats(gymId: string) {
    const tx = requireTransaction();
    const hoy = await this.hoy(gymId);

    const res = await tx.execute<Record<string, string>>(sql`
      WITH vigentes AS (
        SELECT s.status,
               (s.current_period_end - ${hoy}::date) AS dias
        FROM member_subscriptions s
        WHERE s.gym_id = ${gymId} AND s.status IN ('active', 'paused')
      )
      SELECT
        (SELECT count(*) FROM vigentes WHERE status = 'active' AND dias >= ${DIAS_DE_AVISO}) AS al_corriente,
        (SELECT count(*) FROM vigentes WHERE status = 'active' AND dias >= 0 AND dias < ${DIAS_DE_AVISO}) AS por_vencer,
        (SELECT count(*) FROM vigentes WHERE status = 'active' AND dias < 0) AS vencidas,
        (SELECT count(*) FROM vigentes WHERE status = 'paused') AS pausadas,
        (SELECT count(*) FROM members m
          WHERE m.gym_id = ${gymId} AND m.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM member_subscriptions s2
              WHERE s2.gym_id = m.gym_id AND s2.member_id = m.id
                AND s2.status IN ('active', 'paused')
            )) AS sin_suscripcion,
        (SELECT coalesce(sum(amount_cents), 0) FROM payments p
          WHERE p.gym_id = ${gymId} AND p.voided_at IS NULL
            AND p.paid_on >= date_trunc('month', ${hoy}::date)) AS ingresos
    `);

    const f = res.rows[0];
    return {
      alCorriente: Number(f?.al_corriente ?? 0),
      porVencer: Number(f?.por_vencer ?? 0),
      vencidas: Number(f?.vencidas ?? 0),
      pausadas: Number(f?.pausadas ?? 0),
      sinSuscripcion: Number(f?.sin_suscripcion ?? 0),
      ingresosDelMesCents: Number(f?.ingresos ?? 0),
    };
  }

  /** El dia de referencia del gimnasio, para que el panel lo muestre. */
  async hoyDelGimnasio(gymId: string): Promise<string> {
    return this.hoy(gymId);
  }

  // --- Interno -------------------------------------------------------------

  /** Hoy en la zona del gimnasio, no en la del servidor. */
  private async hoy(gymId: string): Promise<string> {
    const tx = requireTransaction();
    const res = await tx.execute<{ hoy: string }>(
      sql`SELECT (now() AT TIME ZONE timezone)::date AS hoy FROM gyms WHERE id = ${gymId}`,
    );
    const hoy = res.rows[0]?.hoy;
    if (!hoy) throw new NotFoundException('Gimnasio no encontrado.');
    return String(hoy);
  }

  private async vigenteDe(gymId: string, memberId: string): Promise<SubscriptionRow | undefined> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(memberSubscriptions)
      .where(
        and(
          eq(memberSubscriptions.gymId, gymId),
          eq(memberSubscriptions.memberId, memberId),
          sql`${memberSubscriptions.status} IN ('active', 'paused')`,
        ),
      )
      .limit(1);
    return fila;
  }

  private async exigirVigente(gymId: string, memberId: string): Promise<SubscriptionRow> {
    const fila = await this.vigenteDe(gymId, memberId);
    if (!fila) throw new NotFoundException('Ese socio no tiene ninguna cuota vigente.');
    return fila;
  }

  private async buscarPlan(gymId: string, id: string): Promise<PlanRow> {
    const tx = requireTransaction();
    const [fila] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.gymId, gymId), eq(plans.id, id)))
      .limit(1);

    if (!fila) throw new NotFoundException('Plan no encontrado.');
    return fila;
  }

  private planToDto(fila: PlanRow, activas: number): Plan {
    return {
      id: fila.id,
      name: fila.name,
      description: fila.description,
      priceCents: fila.priceCents,
      currency: fila.currency,
      period: fila.period,
      status: fila.status,
      activeSubscriptions: activas,
    };
  }

  private subToDto(fila: SubscriptionRow, plan: PlanRow): Subscription {
    return {
      id: fila.id,
      planId: fila.planId,
      planName: plan.name,
      period: plan.period,
      priceCents: fila.priceCents,
      currency: fila.currency,
      status: fila.status,
      startedOn: fila.startedOn,
      currentPeriodEnd: fila.currentPeriodEnd,
      pausedAt: fila.pausedAt,
      pausedDays: fila.pausedDays,
    };
  }

  private pagoToDto(fila: PaymentRow): Payment {
    return {
      id: fila.id,
      concept: fila.concept,
      amountCents: fila.amountCents,
      currency: fila.currency,
      method: fila.method,
      paidOn: fila.paidOn,
      note: fila.note,
      recordedByUserId: fila.recordedByUserId,
      voidedAt: fila.voidedAt?.toISOString() ?? null,
      voidReason: fila.voidReason,
    };
  }
}
