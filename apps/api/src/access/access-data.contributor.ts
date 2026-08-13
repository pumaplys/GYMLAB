import { Injectable } from '@nestjs/common';
import { accessEvents, and, desc, eq } from '@gymlab/db';
import type { PersonalDataContributor } from '../common/personal-data';
import { requireTransaction } from '../common/request-context';

/**
 * Las entradas al gimnasio de un socio, para la exportacion del art. 15.
 *
 * Es historial de presencia fisica —donde estuvo esa persona y cuando— asi que
 * forma parte de lo que hay que entregar.
 *
 * NO SE ENTREGA `scanned_by_user_id`: quien manejaba el escaner es otra persona,
 * y el art. 15.4 dice que el derecho de acceso no puede perjudicar los derechos
 * de terceros. Al socio le concierne que entro, no quien estaba en el mostrador.
 *
 * Tampoco se entrega `jti`: es el identificador interno con el que se
 * correlaciona el token, no dice nada de la persona.
 */
@Injectable()
export class AccessDataContributor implements PersonalDataContributor {
  readonly seccion = 'accesos';

  async aportarDatos(gymId: string, memberId: string): Promise<unknown> {
    const tx = requireTransaction();

    return tx
      .select({
        fecha: accessEvents.occurredAt,
        decision: accessEvents.decision,
        motivo: accessEvents.reason,
        // Se marca porque, si no, una entrada aparece dos veces sin explicacion.
        fueReintento: accessEvents.isRetry,
      })
      .from(accessEvents)
      .where(and(eq(accessEvents.gymId, gymId), eq(accessEvents.memberId, memberId)))
      .orderBy(desc(accessEvents.occurredAt));
  }
}
