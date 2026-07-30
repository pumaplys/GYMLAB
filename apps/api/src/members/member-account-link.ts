import { Injectable } from '@nestjs/common';
import { and, eq, isNull, members } from '@gymlab/db';
import type {
  InvitationAcceptedEvent,
  InvitationAcceptedHook,
} from '../common/invitation-hooks';

/**
 * Vincula la ficha de socio con la cuenta cuando se acepta su invitacion.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ POR QUE ESTO NO VIVE EN `MembersService`                                  │
 * │                                                                          │
 * │ Ahi estuvo primero, y la aplicacion NO ARRANCABA. Nest se quedaba         │
 * │ colgado en `app.init()` sin ningun error, hasta que el test agotaba su    │
 * │ tiempo. La causa era un ciclo de PROVEEDORES:                             │
 * │                                                                          │
 * │   MembersService -> InvitationsService -> HOOK -> MembersService          │
 * │                                                                          │
 * │ El ciclo de MODULOS ya estaba roto (la interfaz en `common`, el cableado  │
 * │ en la raiz), pero eso no basta: el contenedor de dependencias mira los    │
 * │ proveedores, y ahi el ciclo seguia intacto porque las dos puntas eran la  │
 * │ MISMA clase. Nest no lo detecta ni lo denuncia; espera.                    │
 * │                                                                          │
 * │ La salida no es un truco de inyeccion perezosa que esconda el ciclo, sino │
 * │ notar que las dos puntas no tenian por que ser la misma clase: invitar    │
 * │ necesita `invitations`, vincular no necesita nada. Separadas, el grafo es │
 * │ aciclico de verdad:                                                       │
 * │                                                                          │
 * │   MembersService     -> InvitationsService   (invitar)                    │
 * │   InvitationsService -> HOOK -> este         (vincular, sin dependencias) │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * CUANDO LLEGUE EL MODULO DE ENTRENADORES querra reaccionar tambien, con su
 * propio proveedor y la misma regla: el implementador de un hook no depende del
 * modulo que lo invoca.
 */
@Injectable()
export class MemberAccountLink implements InvitationAcceptedHook {
  /**
   * Se ejecuta DENTRO de la transaccion que consume la invitacion, que llega en
   * el evento: si vincular fallara, la invitacion tampoco se consumiria.
   *
   * Solo actua si la invitacion venia de una ficha. Las del personal —dueno,
   * recepcion, entrenador— llegan sin `memberId` y aqui no hay nada que hacer.
   */
  async onInvitationAccepted(evento: InvitationAcceptedEvent): Promise<void> {
    if (!evento.memberId) return;

    // El `WHERE user_id IS NULL` no es defensivo de mas: hace la vinculacion
    // idempotente. Si el flujo se reintentara sobre una ficha ya vinculada, no
    // machaca el vinculo existente — y el indice unico (gym_id, user_id) impide
    // ademas que dos fichas del mismo gimnasio apunten a la misma cuenta.
    await evento.tx
      .update(members)
      .set({ userId: evento.userId, updatedAt: new Date() })
      .where(
        and(
          eq(members.gymId, evento.gymId),
          eq(members.id, evento.memberId),
          isNull(members.userId),
        ),
      );
  }
}
