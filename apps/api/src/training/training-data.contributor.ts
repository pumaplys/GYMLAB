import { Injectable } from '@nestjs/common';
import { and, desc, eq, routineAssignments, routines } from '@gymlab/db';
import type { PersonalDataContributor } from '../common/personal-data';
import { requireTransaction } from '../common/request-context';

/**
 * Las rutinas que se le han asignado a un socio, para la exportacion del art. 15.
 *
 * Su plan de entrenamiento es un dato sobre el: dice que le mandaron hacer y
 * durante cuanto tiempo.
 *
 * NO SE ENTREGA QUIEN SE LA ASIGNO. `assigned_by_trainer_id` identifica a otra
 * persona, y el art. 15.4 pone el limite ahi: el derecho de acceso de uno no
 * puede convertirse en una entrega de datos de otro. Que rutina siguio le
 * concierne; el nombre del entrenador que se la puso, no necesariamente — y
 * ante la duda, en una entrega legal se peca de conservador.
 *
 * Se entregan tambien las TERMINADAS: el historial de lo que entreno forma
 * parte de lo que le concierne, igual que el de lo que pago.
 */
@Injectable()
export class TrainingDataContributor implements PersonalDataContributor {
  readonly seccion = 'rutinasAsignadas';

  async aportarDatos(gymId: string, memberId: string): Promise<unknown> {
    const tx = requireTransaction();

    return tx
      .select({
        rutina: routines.name,
        descripcion: routines.description,
        asignadaEl: routineAssignments.assignedAt,
        terminadaEl: routineAssignments.endedAt,
      })
      .from(routineAssignments)
      .innerJoin(routines, eq(routines.id, routineAssignments.routineId))
      .where(and(eq(routineAssignments.gymId, gymId), eq(routineAssignments.memberId, memberId)))
      .orderBy(desc(routineAssignments.assignedAt));
  }
}
