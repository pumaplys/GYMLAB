import { Injectable } from '@nestjs/common';
import { and, desc, eq, memberSubscriptions, payments, plans } from '@gymlab/db';
import type { PersonalDataContributor } from '../common/personal-data';
import { requireTransaction } from '../common/request-context';

/**
 * Aporta cuotas y pagos a la exportacion del art. 15 (ADR-0011).
 *
 * SIN DEPENDENCIAS INYECTADAS, y no es casualidad: `BillingService` depende de
 * `MembersService`, y `MembersService` es quien compone la exportacion. Si el
 * contribuidor fuera el servicio, el grafo se cerraria y Nest se colgaria en el
 * arranque sin dar ningun error — el fallo que ya nos costo un modulo entero
 * (ADR-0010).
 *
 * Lee sus PROPIAS tablas con la transaccion de la peticion, que es lo unico que
 * necesita. Ninguna frontera de modulo se cruza aqui.
 */
@Injectable()
export class BillingDataContributor implements PersonalDataContributor {
  readonly seccion = 'cuotasYPagos';

  async aportarDatos(gymId: string, memberId: string): Promise<unknown> {
    const tx = requireTransaction();

    // TODAS las suscripciones, no solo la vigente: el historial de lo que esa
    // persona ha pagado forma parte de lo que le concierne.
    const cuotas = await tx
      .select({
        plan: plans.name,
        periodicidad: plans.period,
        importeCentimos: memberSubscriptions.priceCents,
        moneda: memberSubscriptions.currency,
        estado: memberSubscriptions.status,
        desde: memberSubscriptions.startedOn,
        cubiertaHasta: memberSubscriptions.currentPeriodEnd,
        diasCongelados: memberSubscriptions.pausedDays,
      })
      .from(memberSubscriptions)
      .innerJoin(plans, eq(plans.id, memberSubscriptions.planId))
      .where(
        and(eq(memberSubscriptions.gymId, gymId), eq(memberSubscriptions.memberId, memberId)),
      )
      .orderBy(desc(memberSubscriptions.startedOn));

    // Los anulados tambien se entregan, con su motivo: forman parte del
    // historial de esa persona y ocultarlos daria una imagen incompleta.
    const pagos = await tx
      .select({
        concepto: payments.concept,
        importeCentimos: payments.amountCents,
        moneda: payments.currency,
        metodo: payments.method,
        fecha: payments.paidOn,
        nota: payments.note,
        anuladoEl: payments.voidedAt,
        motivoAnulacion: payments.voidReason,
      })
      .from(payments)
      .where(and(eq(payments.gymId, gymId), eq(payments.memberId, memberId)))
      .orderBy(desc(payments.paidOn));

    return { cuotas, pagos };
  }
}
