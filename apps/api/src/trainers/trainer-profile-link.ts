import { Injectable } from '@nestjs/common';
import { sql } from '@gymlab/db';
import type {
  InvitationAcceptedEvent,
  InvitationAcceptedHook,
} from '../common/invitation-hooks';

/**
 * Crea el perfil del entrenador cuando acepta su invitacion.
 *
 * SIN DEPENDENCIAS, y no por casualidad: quien implementa este punto de
 * extension no puede depender de `InvitationsService`, porque el token vive en
 * su grafo y se cerraria un ciclo con el que Nest se cuelga en el arranque sin
 * dar ningun error. Es la misma regla que obligo a separar `MemberAccountLink`
 * de `MembersService` (ADR-0010), aplicada desde el principio esta vez.
 *
 * `TrainersService` si depende de otras cosas y por eso no puede ser el
 * implementador, aunque el metodo pareciera encajar ahi.
 */
@Injectable()
export class TrainerProfileLink implements InvitationAcceptedHook {
  /**
   * Se ejecuta DENTRO de la transaccion que consume la invitacion.
   *
   * Solo actua si el rol invitado era `trainer`. Socios, recepcion y duenos
   * pasan de largo.
   */
  async onInvitationAccepted(evento: InvitationAcceptedEvent): Promise<void> {
    if (evento.role !== 'trainer') return;

    // `ON CONFLICT DO NOTHING` hace la creacion idempotente: si esa cuenta ya
    // tiene perfil en este gimnasio —reinvitacion, o alguien que fue entrenador,
    // se fue y vuelve— se respeta el perfil existente con su bio y su historial
    // en lugar de crear uno vacio. El indice unico (gym_id, user_id) es lo que
    // lo hace posible.
    await evento.tx.execute(sql`
      INSERT INTO trainers (gym_id, user_id)
      VALUES (${evento.gymId}, ${evento.userId})
      ON CONFLICT (gym_id, user_id) DO NOTHING
    `);
  }
}
