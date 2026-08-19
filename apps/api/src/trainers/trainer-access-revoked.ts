import { Injectable } from '@nestjs/common';
import { and, auditLog, eq, isNull, trainerAssignments, trainers } from '@gymlab/db';
import type { AccessRevokedEvent, AccessRevokedHook } from '../common/access-revoked-hooks';

/**
 * Cierra el perfil de un entrenador cuando se le retira el acceso al gimnasio.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ SON DOS COSAS DISTINTAS, Y ESE ERA EXACTAMENTE EL PROBLEMA.             │
 * │                                                                          │
 * │ `memberships.ended_at` es el acceso al gimnasio. `trainers.status` es el │
 * │ estado del perfil profesional. La separación es deliberada — pero nada   │
 * │ las coordinaba, así que retirar el acceso dejaba un entrenador `active`  │
 * │ con socios asignados que no podía entrar.                                │
 * │                                                                          │
 * │ Lo hace TODO dentro de la transacción de la revocación: si esto fallara, │
 * │ tampoco se retira el acceso. Media operación es peor que ninguna.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Clase dedicada y SIN DEPENDENCIAS, como los otros implementadores de puntos
 * de extensión. No inyecta `TrainersService` —aunque `deactivate` haga justo
 * esto— porque ese servicio depende de `MembersService`, y arrastrar ese grafo
 * hasta `auth` cierra un ciclo con el que Nest se queda colgado en el arranque
 * sin dar ningún error (ADR-0010).
 *
 * La lógica es corta y está aquí duplicada a conciencia; lo que NO se duplica
 * es la tabla: sigue siendo del módulo de entrenadores.
 */
@Injectable()
export class TrainerAccessRevoked implements AccessRevokedHook {
  async onAccessRevoked({ gymId, userId, role, actorUserId, tx }: AccessRevokedEvent) {
    // Si se va alguien de recepción o el dueño, aquí no hay nada que hacer.
    if (role !== 'trainer') return;

    const [perfil] = await tx
      .select({ id: trainers.id, status: trainers.status })
      .from(trainers)
      .where(and(eq(trainers.gymId, gymId), eq(trainers.userId, userId)))
      .limit(1);

    // Sin perfil no hay nada que cerrar: puede pasar si nunca llegó a aceptar
    // la invitación. No es un error.
    if (!perfil || perfil.status === 'inactive') return;

    const ahora = new Date();

    await tx
      .update(trainers)
      .set({ status: 'inactive', updatedAt: ahora })
      .where(and(eq(trainers.gymId, gymId), eq(trainers.id, perfil.id)));

    /*
     * Terminar las asignaciones no pierde nada: queda `ended_at`, no se borra
     * ninguna fila. Y deja a esos socios visiblemente sin entrenador, que es
     * la situación real — alguien que ya no puede entrar no los está llevando.
     *
     * Volver a darle acceso NO las restaura: reasignar es una decisión, no un
     * efecto secundario.
     */
    const terminadas = await tx
      .update(trainerAssignments)
      .set({ endedAt: ahora, updatedAt: ahora })
      .where(
        and(
          eq(trainerAssignments.gymId, gymId),
          eq(trainerAssignments.trainerId, perfil.id),
          isNull(trainerAssignments.endedAt),
        ),
      )
      .returning({ id: trainerAssignments.id });

    await tx.insert(auditLog).values({
      gymId,
      actorUserId,
      action: 'trainer.deactivated',
      entityType: 'trainer',
      entityId: perfil.id,
      // `porRevocacion` distingue esto de una baja hecha a mano desde el panel:
      // el efecto es el mismo, el motivo no.
      metadata: { asignacionesTerminadas: terminadas.length, porRevocacion: true },
    });
  }
}
